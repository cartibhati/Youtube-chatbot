"""
FastAPI server — exposes the RAG engine over HTTP so the Chrome extension can call it.
Run with:  uvicorn main:app --reload --port 8000
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from rag_engine import process_video, ask_question, summarize_video

app = FastAPI(title="YT Summarizer API", version="1.0.0")

# ── CORS — allow the Chrome extension (chrome-extension://*)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request / Response models 
class ProcessRequest(BaseModel):
    video_id: str

class QuestionRequest(BaseModel):
    video_id: str
    question: str


# Routes 
@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/process")
def process(req: ProcessRequest):
    """Fetch transcript, embed it, and build the RAG chain."""
    try:
        message = process_video(req.video_id)
        return {"success": True, "message": message}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Processing failed: {e}")


@app.post("/summarize")
def summarize(req: ProcessRequest):
    """Return a structured summary (auto-processes if needed)."""
    try:
        # Auto-process if not yet done
        try:
            summary = summarize_video(req.video_id)
        except ValueError:
            process_video(req.video_id)
            summary = summarize_video(req.video_id)
        return {"success": True, "summary": summary}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Summarization failed: {e}")


@app.post("/chat")
def chat(req: QuestionRequest):
    """Answer a question about the video using RAG."""
    try:
        answer = ask_question(req.video_id, req.question)
        return {"success": True, "answer": answer}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat failed: {e}")