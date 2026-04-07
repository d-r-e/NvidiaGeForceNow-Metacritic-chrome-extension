(function startMetacriticOverlay() {
  const shared = globalThis.GFNMetacriticShared;

  if (!shared) {
    return;
  }

  const ROUTE_FRAGMENTS = ["#/layout/games"];
  const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;
  const STORAGE_KEY = "gfn_metacritic_cache_v5";
  const BADGE_CLASS = "gfn-metacritic-badge";
  const TILE_SELECTOR = "gfn-game-tile";

  const memoryCache = new Map();
  const inflightRequests = new Map();
  let cacheLoaded = false;
  let pageObserver = null;
  let scanTimer = null;

  function isGamesRoute() {
    return ROUTE_FRAGMENTS.some((fragment) => window.location.href.includes(fragment))
      || window.location.pathname === "/games";
  }

  function scheduleScan() {
    if (!isGamesRoute()) {
      return;
    }

    if (scanTimer) {
      window.clearTimeout(scanTimer);
    }

    scanTimer = window.setTimeout(() => {
      scanTimer = null;
      scanTiles();
    }, 120);
  }

  async function ensureCacheLoaded() {
    if (cacheLoaded) {
      return;
    }

    cacheLoaded = true;

    try {
      const stored = await chrome.storage.local.get(STORAGE_KEY);
      const values = stored[STORAGE_KEY] || {};

      Object.entries(values).forEach(([key, entry]) => {
        if (entry && typeof entry === "object") {
          memoryCache.set(key, entry);
        }
      });
    } catch (error) {
      console.warn("Metacritic cache could not be loaded.", error);
    }
  }

  async function persistCache() {
    try {
      const serializable = Object.fromEntries(memoryCache.entries());
      await chrome.storage.local.set({ [STORAGE_KEY]: serializable });
    } catch (error) {
      console.warn("Metacritic cache could not be saved.", error);
    }
  }

  function getTitleNode(tile) {
    return tile.querySelector(".game-title .gfngames-gfn-tile-card-tray-text")
      || tile.querySelector(".game-title p")
      || tile.querySelector(".gfngames-gfn-tile-card-tray-text");
  }

  function getTileTitle(tile) {
    const titleNode = getTitleNode(tile);
    return titleNode ? titleNode.textContent.trim() : "";
  }

  function getBadgeHost(tile) {
    return tile.querySelector(".gfngames-gfn-tile-image-container.image-container")
      || tile.querySelector(".crimson.constants-position-relative")
      || tile;
  }

  function ensureBadge(tile) {
    const host = getBadgeHost(tile);

    if (!host) {
      return null;
    }

    tile.querySelectorAll(`.${BADGE_CLASS}`).forEach((existingBadge) => {
      existingBadge.remove();
    });

    host.classList.add("gfn-metacritic-host");

    const badge = document.createElement("div");
    badge.className = `${BADGE_CLASS} is-hidden`;
    badge.setAttribute("aria-hidden", "true");

    const label = document.createElement("div");
    label.className = "gfn-metacritic-badge-label";

    badge.appendChild(label);
    host.appendChild(badge);

    return badge;
  }

  function setBadgeState(badge, result) {
    badge.classList.remove("is-hidden", "is-mixed", "is-positive", "is-negative");
    const label = badge.querySelector(".gfn-metacritic-badge-label");

    if (!result || result.score == null || Number(result.score) <= 0) {
      badge.classList.add("is-hidden");
      if (label) {
        label.textContent = "";
      }
      badge.removeAttribute("title");
      return;
    }

    const score = Number(result.score);
    if (label) {
      label.textContent = String(score);
    }
    badge.title = `Metacritic: ${score}${result.matchTitle ? ` (${result.matchTitle})` : ""}`;

    if (score >= 75) {
      badge.classList.add("is-positive");
    } else if (score >= 50) {
      badge.classList.add("is-mixed");
    } else {
      badge.classList.add("is-negative");
    }
  }

  function parseSearchResults(html, requestedTitle) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const anchors = Array.from(doc.querySelectorAll('a[href*="/game/"]'));
    const seen = new Set();
    const candidates = [];

    for (const anchor of anchors) {
      const href = anchor.getAttribute("href");
      const searchItem = anchor.closest(".search-item") || anchor;
      const titleNode = searchItem.querySelector(".c-search-item__title") || anchor;
      const title = titleNode.textContent.trim();

      if (!href || !title || seen.has(href)) {
        continue;
      }

      seen.add(href);

      const scoreNode = searchItem.querySelector(
        ".c-search-item__score .c-siteReviewScore, .c-search-item__score [aria-label*='Metascore'], .c-search-item__score [title*='Metascore']"
      );
      const score = shared.extractScoreFromText(
        scoreNode?.textContent
          || scoreNode?.getAttribute("aria-label")
          || scoreNode?.getAttribute("title")
          || ""
      );
      const matchScore = shared.scoreCandidate(requestedTitle, title);

      candidates.push({
        href,
        matchScore,
        score,
        title
      });
    }

    candidates.sort((left, right) => right.matchScore - left.matchScore);

    const strongest = candidates[0] || null;
    if (strongest && strongest.matchScore >= 950 && (strongest.score == null || strongest.score <= 0)) {
      return null;
    }

    const best = candidates.find((candidate) => candidate.score != null && candidate.score > 0 && candidate.matchScore >= 90);
    return best || null;
  }

  function fetchSearchHtml(url) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: "gfn-metacritic-fetch-search",
          url
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          if (!response || !response.ok) {
            reject(new Error(response?.error || "Search request failed."));
            return;
          }

          resolve(response.html);
        }
      );
    });
  }

  async function fetchSearchResult(title) {
    const queries = shared.createSearchQueries(title);

    for (const query of queries) {
      const url = `https://www.metacritic.com/search/${encodeURIComponent(query)}/`;
      try {
        const html = await fetchSearchHtml(url);
        const result = parseSearchResults(html, title);
        if (result) {
          return result;
        }
      } catch (error) {
        console.warn(`Metacritic search failed for "${query}".`, error);
      }
    }

    return null;
  }

  async function resolveMetacriticScore(title) {
    await ensureCacheLoaded();

    const cacheKey = shared.normalizeTitle(title);
    const now = Date.now();
    const cached = memoryCache.get(cacheKey);

    if (cached && now - cached.savedAt < CACHE_TTL_MS) {
      return cached;
    }

    if (inflightRequests.has(cacheKey)) {
      return inflightRequests.get(cacheKey);
    }

    const request = (async () => {
      const match = await fetchSearchResult(title);
      const payload = match
        ? {
            matchTitle: match.title,
            score: match.score,
            searchPath: match.href,
            savedAt: now
          }
        : {
            score: null,
            savedAt: now
          };

      memoryCache.set(cacheKey, payload);
      await persistCache();
      return payload;
    })().finally(() => {
      inflightRequests.delete(cacheKey);
    });

    inflightRequests.set(cacheKey, request);
    return request;
  }

  async function decorateTile(tile) {
    const title = getTileTitle(tile);
    if (!title) {
      return;
    }

    if (tile.dataset.gfnMetacriticProcessed === "1" && tile.dataset.gfnMetacriticTitle === title) {
      return;
    }

    tile.dataset.gfnMetacriticProcessed = "1";
    tile.dataset.gfnMetacriticTitle = title;

    const badge = ensureBadge(tile);
    if (!badge) {
      return;
    }

    try {
      const result = await resolveMetacriticScore(title);
      setBadgeState(badge, result);
    } catch (error) {
      console.warn(`Metacritic lookup failed for "${title}".`, error);
      setBadgeState(badge, null);
    }
  }

  function scanTiles() {
    if (!isGamesRoute()) {
      return;
    }

    const tiles = Array.from(document.querySelectorAll(TILE_SELECTOR));
    tiles.forEach((tile) => {
      void decorateTile(tile);
    });
  }

  function observePage() {
    if (pageObserver) {
      return;
    }

    pageObserver = new MutationObserver(() => {
      scheduleScan();
    });

    pageObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function watchRouteChanges() {
    const wrapped = () => {
      scheduleScan();
    };

    window.addEventListener("hashchange", wrapped);

    const originalPushState = history.pushState;
    history.pushState = function patchedPushState() {
      const result = originalPushState.apply(this, arguments);
      wrapped();
      return result;
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function patchedReplaceState() {
      const result = originalReplaceState.apply(this, arguments);
      wrapped();
      return result;
    };
  }

  observePage();
  watchRouteChanges();
  scheduleScan();
})();
