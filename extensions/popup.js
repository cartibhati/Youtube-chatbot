/**
 * popup.js
 * Controls the YT Summarizer extension UI.
 * Talks to the local FastAPI backend at localhost:8000.
 */

const API = "http://localhost:8000";

// ── DOM references ────────────────────────────────────────────────────────────
const statusDot       = document.getElementById("statusDot");
const videoInfo       = document.getElementById("videoInfo");
const videoIdLabel    = document.getElementById("videoIdLabel");
const noVideo         = document.getElementById("noVideo");
const btnSummarize    = document.getElementById("btnSummarize");
const summaryLoader   = document.getElementById("summaryLoader");
const loaderText      = document.getElementById("loaderText");
const summaryOutput   = document.getElementById("summaryOutput");
const summaryText     = document.getElementById("summaryText");
const summaryError    = document.getElementById("summaryError");
const copySummaryBtn  = document.getElementById("copySummaryBtn");
const chatNotReady    = document.getElementById("chatNotReady");
const chatMessages    = document.getElementById("chatMessages");
const chatInputArea   = document.getElementById("chatInputArea");
const chatInput       = document.getElementById("chatInput");
const sendBtn         = document.getElementById("sendBtn");
const chatError       = document.getElementById("chatError");

// ── State ─────────────────────────────────────────────────────────────────────
let currentVideoId = null;
let videoReady     = false;   // true after backend has processed the video

// ── Tabs ──────────────────────────────────────────────────────────────────────
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
  });
});

// ── Init ──────────────────────────────────────────────────────────────────────
(async () => {
  await Promise.all([checkBackend(), detectVideo()]);
})();

// ── Check backend health ──────────────────────────────────────────────────────
async function checkBackend() {
  try {
    const res = await fetch(`${API}/health`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      statusDot.className = "status-dot online";
      statusDot.title = "Backend is running";
    } else throw new Error();
  } catch {
    statusDot.className = "status-dot offline";
    statusDot.title = "Backend offline — start uvicorn";
  }
}

// ── Detect current YouTube video ──────────────────────────────────────────────
async function detectVideo() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url?.includes("youtube.com/watch")) {
      noVideo.classList.remove("hidden");
      return;
    }

    // Ask content script for the video ID
    const response = await chrome.tabs.sendMessage(tab.id, { type: "GET_VIDEO_ID" });
    const vid = response?.videoId;

    if (vid) {
      currentVideoId = vid;
      videoIdLabel.textContent = vid;
      videoInfo.classList.remove("hidden");
      btnSummarize.disabled = false;

      // Restore previous summary from session storage
      const saved = sessionStorage.getItem(`summary_${vid}`);
      if (saved) {
        renderSummary(saved);
        setVideoReady(true);
      }
    } else {
      noVideo.classList.remove("hidden");
    }
  } catch (err) {
    console.error("detectVideo error:", err);
    noVideo.classList.remove("hidden");
  }
}

// ── Generate Summary ──────────────────────────────────────────────────────────
btnSummarize.addEventListener("click", async () => {
  if (!currentVideoId) return;

  // Reset UI
  summaryOutput.classList.add("hidden");
  summaryError.classList.add("hidden");
  summaryLoader.classList.remove("hidden");
  btnSummarize.disabled = true;

  // Animate loading text
  const loadingSteps = [
    "Fetching transcript…",
    "Chunking text…",
    "Building embeddings…",
    "Generating summary…",
  ];
  let step = 0;
  loaderText.textContent = loadingSteps[0];
  const stepTimer = setInterval(() => {
    step = Math.min(step + 1, loadingSteps.length - 1);
    loaderText.textContent = loadingSteps[step];
  }, 4000);

  try {
    const res = await fetch(`${API}/summarize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video_id: currentVideoId }),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.detail || "Summarization failed.");
    }

    const summary = data.summary;
    sessionStorage.setItem(`summary_${currentVideoId}`, summary);
    renderSummary(summary);
    setVideoReady(true);

  } catch (err) {
    showError(summaryError, err.message || "Could not reach backend. Is uvicorn running?");
  } finally {
    clearInterval(stepTimer);
    summaryLoader.classList.add("hidden");
    btnSummarize.disabled = false;
  }
});

function renderSummary(text) {
  summaryText.textContent = text;
  summaryOutput.classList.remove("hidden");
}

// ── Copy Summary ──────────────────────────────────────────────────────────────
copySummaryBtn.addEventListener("click", async () => {
  const text = summaryText.textContent;
  if (!text) return;
  await navigator.clipboard.writeText(text);
  copySummaryBtn.textContent = "✓ Copied";
  setTimeout(() => (copySummaryBtn.textContent = "⧉"), 1500);
});

// ── Mark video as ready for chat ──────────────────────────────────────────────
function setVideoReady(ready) {
  videoReady = ready;
  if (ready) {
    chatNotReady.classList.add("hidden");
    chatMessages.classList.remove("hidden");
    chatInputArea.classList.remove("hidden");
  }
}

// ── Send chat message ─────────────────────────────────────────────────────────
sendBtn.addEventListener("click", sendMessage);
chatInput.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

async function sendMessage() {
  const question = chatInput.value.trim();
  if (!question || !currentVideoId) return;

  chatInput.value = "";
  chatError.classList.add("hidden");

  // Add user bubble
  appendMessage("user", question);

  // Show typing indicator
  const typingEl = appendTyping();
  sendBtn.disabled = true;

  try {
    const res = await fetch(`${API}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video_id: currentVideoId, question }),
    });

    const data = await res.json();
    typingEl.remove();

    if (!res.ok || !data.success) {
      throw new Error(data.detail || "Chat request failed.");
    }

    appendMessage("bot", data.answer);

  } catch (err) {
    typingEl.remove();
    showError(chatError, err.message || "Could not reach backend.");
  } finally {
    sendBtn.disabled = false;
    chatInput.focus();
    scrollChatToBottom();
  }
}

// ── Chat helpers ──────────────────────────────────────────────────────────────
function appendMessage(role, text) {
  const wrap = document.createElement("div");
  wrap.className = `msg ${role}`;

  const label = document.createElement("div");
  label.className = "msg-label";
  label.textContent = role === "user" ? "You" : "Assistant";

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";
  bubble.textContent = text;

  wrap.appendChild(label);
  wrap.appendChild(bubble);
  chatMessages.appendChild(wrap);
  scrollChatToBottom();
  return wrap;
}

function appendTyping() {
  const wrap = document.createElement("div");
  wrap.className = "msg bot";

  const label = document.createElement("div");
  label.className = "msg-label";
  label.textContent = "Assistant";

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble typing-dots";
  bubble.innerHTML = "<span></span><span></span><span></span>";

  wrap.appendChild(label);
  wrap.appendChild(bubble);
  chatMessages.appendChild(wrap);
  scrollChatToBottom();
  return wrap;
}

function scrollChatToBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ── Error display ─────────────────────────────────────────────────────────────
function showError(el, message) {
  el.textContent = `❌ ${message}`;
  el.classList.remove("hidden");
}