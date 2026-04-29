"""
RAG Engine — YouTube transcript ingestion + Q&A with Ollama (llama3.2)
Replaces ChatOpenAI / OpenAIEmbeddings from the original notebook.
"""

from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_ollama import OllamaEmbeddings, ChatOllama
from langchain_community.vectorstores import FAISS
from langchain_core.prompts import PromptTemplate
from langchain_core.runnables import RunnableParallel, RunnablePassthrough, RunnableLambda
from langchain_core.output_parsers import StrOutputParser

#  Model config 
OLLAMA_MODEL     = "llama3.2"
OLLAMA_BASE_URL  = "http://localhost:11434"

# In-memory session store  (video_id → chain) 
_sessions: dict[str, dict] = {}



# Helper: fetch transcript

def _fetch_transcript(video_id: str) -> str:
    """Return the full transcript text for *video_id*."""
    try:
        # youtube-transcript-api >= 0.6 uses an instance
        api = YouTubeTranscriptApi()
        fetched = api.fetch(video_id, languages=["en"])
        return " ".join(snip.text for snip in fetched)
    except AttributeError:
        # Fallback for older versions
        chunks = YouTubeTranscriptApi.get_transcript(video_id, languages=["en"])
        return " ".join(c["text"] for c in chunks)
    except TranscriptsDisabled:
        raise ValueError("Subtitles are disabled for this video.")
    except Exception as e:
        # Try without language filter as last resort
        try:
            api = YouTubeTranscriptApi()
            fetched = api.fetch(video_id)
            return " ".join(snip.text for snip in fetched)
        except Exception:
            raise ValueError(f"Could not fetch transcript: {e}")



# Helper: format retrieved docs

def _format_docs(docs) -> str:
    return "\n\n".join(d.page_content for d in docs)



# Build RAG chain for a video

def build_chain(video_id: str) -> dict:
    """
    Fetch transcript → chunk → embed (Ollama) → FAISS vector store → RAG chain.
    Returns a dict with keys: chain, transcript
    """
    transcript = _fetch_transcript(video_id)

    # Step 1: Chunking
    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    chunks = splitter.create_documents([transcript])

    #  Step 2: Embeddings + Vector Store
    embeddings = OllamaEmbeddings(model=OLLAMA_MODEL, base_url=OLLAMA_BASE_URL)
    vector_store = FAISS.from_documents(chunks, embeddings)
    retriever = vector_store.as_retriever(search_kwargs={"k": 4})

    # Step 3: LLM 
    llm = ChatOllama(model=OLLAMA_MODEL, base_url=OLLAMA_BASE_URL, temperature=0.3)

    # Step 4: Prompt 
    prompt_template = """You are a helpful assistant that answers questions about a YouTube video.
Use ONLY the context below (which is the video transcript) to answer.
If the answer is not in the context, say "I couldn't find that in the video."

Context:
{context}

Question: {question}

Answer:"""

    prompt = PromptTemplate(
        input_variables=["context", "question"],
        template=prompt_template,
    )

    #Step 5: Chain 
    parallel = RunnableParallel({
        "context":  retriever | RunnableLambda(_format_docs),
        "question": RunnablePassthrough(),
    })
    chain = parallel | prompt | llm | StrOutputParser()

    return {"chain": chain, "transcript": transcript, "llm": llm}



# Public API

def process_video(video_id: str) -> str:
    """Index the video and return a short confirmation message."""
    session = build_chain(video_id)
    _sessions[video_id] = session
    word_count = len(session["transcript"].split())
    return f"Video processed successfully. Transcript has ~{word_count} words."


def ask_question(video_id: str, question: str) -> str:
    """Answer *question* using the pre-built RAG chain for *video_id*."""
    if video_id not in _sessions:
        raise ValueError("Video not processed yet. Call /process first.")
    chain = _sessions[video_id]["chain"]
    return chain.invoke(question)


def summarize_video(video_id: str) -> str:
    """Generate a structured summary of the video."""
    if video_id not in _sessions:
        raise ValueError("Video not processed yet. Call /process first.")

    session = _sessions[video_id]
    llm = session["llm"]
    transcript = session["transcript"]

    # Use only first ~3000 words to keep summary fast
    short_transcript = " ".join(transcript.split()[:3000])

    summary_prompt = f"""You are an expert video summarizer.
Below is the transcript of a YouTube video. Write a clear, structured summary with:
- A one-line title/topic
- 3-5 bullet-point key takeaways
- A short paragraph conclusion (2-3 sentences)

Transcript (excerpt):
{short_transcript}

Summary:"""

    response = llm.invoke(summary_prompt)
    return response.content if hasattr(response, "content") else str(response)