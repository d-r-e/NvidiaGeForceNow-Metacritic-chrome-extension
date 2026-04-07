chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "gfn-metacritic-fetch-search") {
    return undefined;
  }

  const url = String(message.url || "");
  if (!url.startsWith("https://www.metacritic.com/search/")) {
    sendResponse({ ok: false, error: "Unsupported URL." });
    return undefined;
  }

  (async () => {
    try {
      const response = await fetch(url, {
        credentials: "omit"
      });

      if (!response.ok) {
        sendResponse({
          ok: false,
          error: `Request failed with status ${response.status}.`
        });
        return;
      }

      const html = await response.text();
      sendResponse({
        html,
        ok: true
      });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  })();

  return true;
});
