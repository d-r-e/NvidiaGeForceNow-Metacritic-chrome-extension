(function attachShared(globalScope) {
  const EDITION_SUFFIXES = [
    "game of the year edition",
    "game of the year",
    "goty edition",
    "goty",
    "definitive edition",
    "complete edition",
    "ultimate edition",
    "legendary edition",
    "deluxe edition",
    "standard edition",
    "demo"
  ];

  function normalizeTitle(value) {
    return String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[®™©]/g, " ")
      .replace(/&/g, " and ")
      .replace(/['’]/g, "")
      .replace(/[:/\\|()[\]{}!?.,+-]/g, " ")
      .replace(/\b(the|a|an)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function stripEditionSuffixes(value) {
    let output = normalizeTitle(value);

    for (const suffix of EDITION_SUFFIXES) {
      const suffixPattern = new RegExp(`\\b${suffix.replace(/\s+/g, "\\s+")}\\b`, "g");
      output = output.replace(suffixPattern, " ").replace(/\s+/g, " ").trim();
    }

    return output;
  }

  function createSearchQueries(title) {
    const original = String(title || "").trim();
    const trimmed = original.replace(/\s*\[[^\]]+\]\s*/g, " ").replace(/\s*\([^)]+\)\s*/g, " ").replace(/\s+/g, " ").trim();
    const withoutEdition = stripEditionSuffixes(trimmed);
    const queries = [original, trimmed, withoutEdition]
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    return [...new Set(queries)];
  }

  function extractScoreFromText(value) {
    const text = String(value || "");
    if (/\btbd\b/i.test(text) || /\bnull\s+out\s+of\s+100\b/i.test(text)) {
      return null;
    }

    const metascoreLabelMatch = text.match(/metascore\s+(\d{1,3})\s+out\s+of\s+100/i);
    if (metascoreLabelMatch) {
      return Number(metascoreLabelMatch[1]);
    }

    const matches = text.match(/\b\d{2,3}\b/g) || [];
    for (let index = matches.length - 1; index >= 0; index -= 1) {
      const score = Number(matches[index]);
      if (score >= 1 && score <= 100) {
        return score;
      }
    }

    return null;
  }

  function scoreCandidate(queryTitle, candidateTitle) {
    const normalizedQuery = normalizeTitle(queryTitle);
    const normalizedCandidate = normalizeTitle(candidateTitle);
    const strippedQuery = stripEditionSuffixes(queryTitle);
    const strippedCandidate = stripEditionSuffixes(candidateTitle);

    if (!normalizedQuery || !normalizedCandidate) {
      return -Infinity;
    }

    if (normalizedQuery === normalizedCandidate) {
      return 1_000;
    }

    if (strippedQuery && strippedQuery === strippedCandidate) {
      return 950;
    }

    if (normalizedCandidate.includes(normalizedQuery)) {
      return 900 - (normalizedCandidate.length - normalizedQuery.length);
    }

    if (normalizedQuery.includes(normalizedCandidate)) {
      return 875 - (normalizedQuery.length - normalizedCandidate.length);
    }

    const queryTokens = new Set(strippedQuery.split(" ").filter(Boolean));
    const candidateTokens = new Set(strippedCandidate.split(" ").filter(Boolean));

    if (!queryTokens.size || !candidateTokens.size) {
      return -Infinity;
    }

    let overlap = 0;
    for (const token of queryTokens) {
      if (candidateTokens.has(token)) {
        overlap += 1;
      }
    }

    const union = new Set([...queryTokens, ...candidateTokens]).size;
    const ratio = overlap / union;

    return Math.round(ratio * 100);
  }

  const api = {
    createSearchQueries,
    extractScoreFromText,
    normalizeTitle,
    scoreCandidate,
    stripEditionSuffixes
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  globalScope.GFNMetacriticShared = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
