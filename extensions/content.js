/**
 * content.js
 * Injected into every YouTube page.
 * Listens for messages from popup.js and replies with the current video ID.
 */

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.type === "GET_VIDEO_ID") {
    const videoId = extractVideoId(window.location.href);
    sendResponse({ videoId });
  }
  return true; // keep channel open for async
});

/**
 * Extracts the "v" query param from a YouTube watch URL.
 * Also handles youtu.be short links and /embed/ paths.
 */
function extractVideoId(url) {
  try {
    const u = new URL(url);
    // Standard: youtube.com/watch?v=VIDEO_ID
    if (u.searchParams.has("v")) return u.searchParams.get("v");
    // Short link: youtu.be/VIDEO_ID
    if (u.hostname === "youtu.be") return u.pathname.slice(1);
    // Embed: youtube.com/embed/VIDEO_ID
    const embedMatch = u.pathname.match(/\/embed\/([^/?#]+)/);
    if (embedMatch) return embedMatch[1];
  } catch (_) {}
  return null;
}