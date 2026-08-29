# 📺 YT Video Summarizer — Chrome Extension  

A Chrome extension that lets you **summarize any YouTube video** and **chat with it** — all running **100% locally** on your machine using [Ollama](https://ollama.com/) (llama3.2). No OpenAI, no API keys, no cloud.

---

## ✨ Features

- **One-click summary** — open any YouTube video, click the extension, hit Generate
- **Chat with the video** — ask questions, get answers grounded in the transcript
- **Fully local** — your data never leaves your PC (Ollama + FAISS run locally)
- **Auto language fallback** — works even if the video has no English transcript (Hindi, etc.)
- **Dark YouTube-inspired UI** — clean popup with tabs for Summary and Chat

---

## 🏗️ Architecture

```
┌─────────────────────┐         HTTP (localhost:8000)        ┌──────────────────────────┐
│  Chrome Extension   │  ──────────────────────────────────► │  FastAPI Backend          │
│                     │                                       │                          │
│  popup.html/css/js  │ ◄──────────────────────────────────  │  main.py                 │
│  content.js         │        JSON responses                 │  rag_engine.py           │
└─────────────────────┘                                       └────────────┬─────────────┘
                                                                           │
                                                              ┌────────────▼─────────────┐
                                                              │  Ollama (llama3.2)        │
                                                              │  FAISS vector store       │
                                                              │  YouTube Transcript API   │
                                                              └──────────────────────────┘
```

**Flow:**
1. Extension reads the YouTube video ID from the current tab URL
2. User clicks "Generate Summary" → sends `POST /summarize` to FastAPI
3. Backend fetches transcript → chunks it → embeds with `llama3.2` → stores in FAISS
4. LLM generates a structured summary and returns it
5. User can then ask questions in the Chat tab → RAG retrieves relevant chunks → LLM answers

---

## 📁 Project Structure

```
Youtube_chatbot/
│
├── backend/                        # Python backend (FastAPI + LangChain + Ollama)
│   ├── main.py                     # FastAPI server — defines /health, /summarize, /chat routes
│   ├── rag_engine.py               # RAG logic — transcript fetch, chunking, embeddings, Q&A
│   └── requirements.txt            # Python dependencies
│
└── extension/                      # Chrome Extension
    ├── manifest.json               # Extension config (permissions, content scripts)
    ├── content.js                  # Injected into YouTube pages — extracts the video ID
    ├── popup.html                  # Extension popup UI structure
    ├── popup.css                   # Styling (dark YouTube-inspired theme)
    ├── popup.js                    # UI logic — talks to backend, renders summary & chat
    └── icons/
        ├── icon16.png
        ├── icon48.png
        └── icon128.png
```

### Backend (`backend/`)

| File | What it does |
|------|-------------|
| `main.py` | FastAPI app with three routes: `/health` (status check), `/summarize` (generate video summary), `/chat` (answer a question using RAG) |
| `rag_engine.py` | Fetches YouTube transcript → splits into chunks → creates FAISS vector store with Ollama embeddings → builds LangChain RAG chain → exposes `process_video`, `summarize_video`, `ask_question` |

### Extension (`extension/`)

| File | What it does |
|------|-------------|
| `manifest.json` | Tells Chrome the extension's name, permissions, which pages to inject scripts into, and which file is the popup |
| `content.js` | A small script Chrome injects into every YouTube tab — when the popup asks "what video is open?", this script reads the URL and sends back the video ID |
| `popup.html` | The HTML structure of the popup window — header, tabs (Summary / Chat), buttons, and message containers |
| `popup.css` | All the visual styling — dark background, YouTube red accents, chat bubbles, loading spinner |
| `popup.js` | The brain of the extension — detects the current video, calls the backend API, renders the summary, handles the chat conversation, shows loading states and errors |

---

## 🚀 Setup & Installation

### Prerequisites

- Python 3.10+
- [Ollama](https://ollama.com/) installed and running
- Google Chrome (or any Chromium browser)

### 1. Pull the Ollama model

```bash
ollama pull llama3.2
ollama pull nomic-embed-text
```

### 2. Set up the Python backend

```bash
cd Youtube_chatbot/backend
python -m venv venv

# Windows
.\venv\Scripts\activate

# macOS/Linux
source venv/bin/activate

pip install -r requirements.txt
```

### 3. Start the backend server

Make sure Ollama is running first:
```bash
ollama serve
```

Then in a separate terminal (inside `backend/`):
```bash
uvicorn main:app --reload --port 8000
```

You should see:
```
INFO:     Application startup complete.
```

Verify it's working: open `http://127.0.0.1:8000/health` — you should see `{"status":"ok"}`.

### 4. Load the Chrome Extension

1. Open Chrome → go to `chrome://extensions/`
2. Toggle **Developer mode** ON (top-right corner)
3. Click **Load unpacked**
4. Select the `extension/` folder
5. The YT Summarizer icon will appear in your toolbar

---

## 🎮 Usage

1. Open any YouTube video
2. Click the **YT Summarizer** extension icon
3. Click **✨ Generate Summary** — wait ~15–30 seconds (first run embeds the transcript)
4. Switch to the **💬 Chat** tab to ask questions about the video

> **Note:** The backend keeps the video in memory for the session, so chat responses are fast after the first summary is generated.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| LLM | Ollama — llama3.2 (local) |
| Embeddings | Ollama — llama3.2 |
| Vector Store | FAISS (in-memory) |
| RAG Framework | LangChain |
| Transcript | youtube-transcript-api |
| Backend | FastAPI + Uvicorn |
| Frontend | Chrome Extension (HTML + CSS + JS) |

---

## ⚠️ Known Limitations

- Videos with **no transcript at all** (fully manual with captions disabled) won't work
- The backend is **in-memory only** — restarting the server clears processed videos
- Works best with videos under ~2 hours (very long videos may be slow to embed)
- Ollama must be running separately before starting the backend

---

## 🔮 Possible Future Improvements

- [ ] Persist vector stores to disk (so you don't re-embed on every restart)
- [ ] Support for multiple videos in one session
- [ ] Stream the summary token-by-token for faster perceived response
- [ ] Translate non-English transcripts before summarizing
- [ ] Firefox support

