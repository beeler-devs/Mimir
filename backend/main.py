from websocket_manager import websocket_manager
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from models import HealthResponse, JobRequest, JobResponse, ChatRequest, ChatResponse, ChatMessageResponse, AnimationSuggestion
from manim_worker.manim_service import manim_service
import logging
import os
import re
import json
import asyncio
from anthropic import Anthropic
from dotenv import load_dotenv
import pdfplumber
import io

# Load environment variables
load_dotenv()

"""
FastAPI server for Manim rendering worker
Job-based animation rendering with Supabase Storage integration
"""

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Import WebSocket manager

app = FastAPI(
    title="Mimir Manim Worker",
    description="Job-based animation rendering service using Manim",
    version="0.2.0"
)

# CORS middleware to allow requests from frontend
# Note: CORSMiddleware in FastAPI also handles WebSocket connections
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001",
                   "http://localhost:3003", "http://localhost:3002"],  # Frontend URLs
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Request logging middleware to debug WebSocket connections


@app.middleware("http")
async def log_requests(request: Request, call_next):
    # Skip logging for WebSocket upgrade requests
    if request.url.path.startswith("/ws/"):
        return await call_next(request)

    logger.info(f"Incoming request: {request.method} {request.url.path}")
    logger.info(f"Headers: {dict(request.headers)}")
    response = await call_next(request)
    return response


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Health check endpoint
    Returns the service status
    """
    return HealthResponse(status="ok", version="0.2.0")


@app.get("/ws/test")
async def websocket_test():
    """
    Test endpoint to verify WebSocket support is available
    """
    return {"message": "WebSocket endpoint available at /ws/manim/{job_id}"}


@app.get("/ws/health")
async def websocket_health():
    """Check if WebSocket support is available"""
    return {
        "websocket_support": True,
        "endpoint": "/ws/manim/{job_id}",
        "status": "ready"
    }


@app.websocket("/ws/test")
async def websocket_test_endpoint(websocket: WebSocket):
    """Minimal WebSocket endpoint for testing connection"""
    logger.info("WebSocket test connection attempt")
    await websocket.accept()
    logger.info("WebSocket test connection accepted")
    await websocket.send_text("test")
    logger.info("WebSocket test message sent")
    await websocket.close()
    logger.info("WebSocket test connection closed")


@app.post("/extract-pdf")
async def extract_pdf(file: UploadFile = File(...)):
    """
    Extract text from a PDF file using pdfplumber

    Args:
        file: Uploaded PDF file

    Returns:
        JSON with filename and extractedText

    Example:
        POST /extract-pdf
        (multipart/form-data with PDF file)

        Response:
        {
            "filename": "document.pdf",
            "extractedText": "Full text content...",
            "error": null
        }
    """
    try:
        # Validate file type
        if not file.filename or not file.filename.lower().endswith('.pdf'):
            raise HTTPException(status_code=400, detail="File must be a PDF")

        # Read file content into memory
        content = await file.read()

        if len(content) == 0:
            raise HTTPException(status_code=400, detail="Empty PDF file")

        # Extract text using pdfplumber
        extracted_text = ""

        with pdfplumber.open(io.BytesIO(content)) as pdf:
            if len(pdf.pages) == 0:
                raise HTTPException(status_code=400, detail="PDF has no pages")

            # Extract text from all pages
            for page_num, page in enumerate(pdf.pages):
                page_text = page.extract_text()
                if page_text:
                    extracted_text += f"\n--- Page {page_num + 1} ---\n"
                    extracted_text += page_text

        # Check if any text was extracted
        if not extracted_text.strip():
            logger.warning(f"No text extracted from PDF: {file.filename}")
            return {
                "filename": file.filename,
                "extractedText": "",
                "error": "No text could be extracted from this PDF. It may be image-based or empty."
            }

        logger.info(
            f"Successfully extracted {len(extracted_text)} characters from {file.filename}")

        return {
            "filename": file.filename,
            "extractedText": extracted_text.strip(),
            "error": None
        }

    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        logger.error(f"Error extracting text from PDF: {e}", exc_info=True)
        return {
            "filename": file.filename if file.filename else "unknown.pdf",
            "extractedText": "",
            "error": f"Failed to extract text: {str(e)}"
        }


@app.post("/jobs", response_model=JobResponse)
async def create_job(request: JobRequest):
    """
    Create a new animation rendering job

    Args:
        request: Job request with description, topic, and optional workspace context

    Returns:
        JobResponse with job_id and initial status

    Example:
        POST /jobs
        {
            "description": "Visualize Brownian motion",
            "topic": "math",
            "workspace_context": {...}
        }
    """
    try:
        # Extract student context from workspace context if available
        student_context = None
        if request.workspace_context:
            context_parts = []

            # Add folder information
            if request.workspace_context.folders:
                folder_names = [
                    f.name for f in request.workspace_context.folders]
                context_parts.append(
                    f"User is working in folder(s): {', '.join(folder_names)}")

            # Add instance information
            if request.workspace_context.instances:
                context_parts.append("\nCurrent workspace context includes:")
                # First instance is typically the active one
                for idx, inst in enumerate(request.workspace_context.instances):
                    is_active = idx == 0  # First instance is the active one
                    active_marker = " (CURRENTLY OPEN)" if is_active else ""
                    context_parts.append(
                        f"\n- {inst.title} ({inst.type}){active_marker}:")

                    if inst.type == "text" and inst.content:
                        context_parts.append(
                            f"  Content: {inst.content[:500]}{'...' if len(inst.content) > 500 else ''}")
                    elif inst.type == "code" and inst.code:
                        context_parts.append(f"  Language: {inst.language}")
                        context_parts.append(
                            f"  Code: {inst.code[:500]}{'...' if len(inst.code) > 500 else ''}")
                    elif inst.type == "annotate":
                        if inst.id in request.workspace_context.annotationImages:
                            context_parts.append(
                                f"  [Annotation canvas image included]")

            if context_parts:
                student_context = "\n".join(context_parts)

        # Combine student_context with planning_context if both exist
        final_context = student_context
        if request.planning_context:
            if final_context:
                final_context = f"{request.planning_context}\n\n--- Workspace Context ---\n{final_context}"
            else:
                final_context = request.planning_context

        job_id = manim_service.create_job(
            description=request.description,
            topic=request.topic,
            student_context=final_context
        )

        return JobResponse(
            job_id=job_id,
            status="pending",
            video_url=None,
            error=None
        )

    except Exception as e:
        logger.error(f"Error creating job: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/jobs/{job_id}", response_model=JobResponse)
async def get_job_status(job_id: str):
    """
    Get the status of a rendering job

    Args:
        job_id: Job identifier

    Returns:
        JobResponse with current status, video URL (if done), or error

    Example:
        GET /jobs/123e4567-e89b-12d3-a456-426614174000

        Response:
        {
            "job_id": "123e4567-e89b-12d3-a456-426614174000",
            "status": "done",
            "video_url": "https://...",
            "error": null
        }
    """
    logger.info("=" * 70)
    logger.info(f"GET JOB STATUS REQUEST FOR: {job_id}")
    logger.info("=" * 70)

    job_status = manim_service.get_job_status(job_id)

    logger.info(f"Job status retrieved: {job_status}")
    logger.info(f"Status: {job_status.get('status')}")
    logger.info(f"Video URL: {job_status.get('video_url')}")
    logger.info(f"Error: {job_status.get('error')}")

    if job_status.get("status") == "not_found":
        logger.warning(f"Job {job_id} not found")
        logger.info("=" * 70)
        raise HTTPException(status_code=404, detail="Job not found")

    response = JobResponse(
        job_id=job_id,
        status=job_status["status"],
        video_url=job_status.get("video_url"),
        error=job_status.get("error"),
    )

    logger.info(
        f"Returning response: status={response.status}, video_url={response.video_url}")
    logger.info("=" * 70)

    return response


@app.websocket("/ws/manim/{job_id}")
async def websocket_manim(websocket: WebSocket, job_id: str):
    """
    WebSocket endpoint for streaming Manim animation frames

    Args:
        websocket: WebSocket connection
        job_id: Job identifier for the animation
    """
    logger.info(f"[WebSocket] Connection attempt for job {job_id}")
    logger.info(f"[WebSocket] Client: {websocket.client}")

    try:
        # Accept the WebSocket connection first
        await websocket.accept()
        logger.info(f"[WebSocket] Connection accepted for job {job_id}")

        # Add to manager after accepting (this just tracks it, doesn't accept again)
        websocket_manager.active_connections[job_id].add(websocket)
        logger.info(
            f"[WebSocket] Registered in manager for job {job_id} (total connections: {len(websocket_manager.active_connections[job_id])})")

        # Send initial connection confirmation
        await websocket.send_json({
            "type": "connected",
            "job_id": job_id,
            "message": "WebSocket connected successfully"
        })
        logger.info(
            f"[WebSocket] Sent connection confirmation for job {job_id}")

        # Keep connection alive - wait for disconnect or messages
        # Use a simple loop that waits for messages or disconnect
        while True:
            try:
                # Wait for a message with a timeout
                # This keeps the connection alive and allows us to detect disconnects
                message = await asyncio.wait_for(websocket.receive(), timeout=30.0)

                if message.get("type") == "websocket.disconnect":
                    logger.info(
                        f"[WebSocket] Client disconnected for job {job_id}")
                    break
                elif message.get("type") == "websocket.receive":
                    # Handle text messages if client sends any (optional)
                    if "text" in message:
                        data = message["text"]
                        logger.debug(
                            f"[WebSocket] Received message from client for job {job_id}: {data}")
            except asyncio.TimeoutError:
                # No message received, but connection is still alive
                # Send a ping to keep connection alive and verify it's still open
                try:
                    await websocket.send_json({"type": "ping", "job_id": job_id})
                    logger.debug(
                        f"[WebSocket] Sent ping to keep connection alive for job {job_id}")
                except Exception as ping_error:
                    # Connection is closed
                    logger.info(
                        f"[WebSocket] Connection closed while sending ping for job {job_id}: {ping_error}")
                    break
            except WebSocketDisconnect:
                logger.info(f"[WebSocket] Disconnected for job {job_id}")
                break
            except Exception as receive_error:
                logger.warning(
                    f"[WebSocket] Error receiving message for job {job_id}: {receive_error}")
                # Check if connection is still open by trying to send a message
                try:
                    await websocket.send_json({"type": "error", "job_id": job_id, "error": "Connection error"})
                except:
                    # Connection is closed
                    break
    except WebSocketDisconnect:
        logger.info(f"[WebSocket] Disconnected for job {job_id}")
    except Exception as e:
        logger.error(f"[WebSocket] Error for job {job_id}: {e}", exc_info=True)
        # Try to send error message if connection is still open
        try:
            await websocket.send_json({
                "type": "error",
                "job_id": job_id,
                "error": str(e)
            })
        except:
            pass
    finally:
        websocket_manager.disconnect(websocket, job_id)
        logger.info(f"[WebSocket] Cleanup complete for job {job_id}")


@app.post("/jobs/plan")
async def plan_animation(request: JobRequest):
    """
    Generate a detailed animation plan using Claude Sonnet
    Streams planning content as Server-Sent Events (SSE)

    This endpoint is called before animation generation to create
    a comprehensive plan that will guide Manim code generation.

    Args:
        request: Job request with description, topic, and optional workspace context

    Returns:
        StreamingResponse with SSE format containing planning chunks
    """
    def generate():
        try:
            # Get Claude API key from environment
            claude_api_key = os.getenv("CLAUDE_API_KEY")

            if not claude_api_key:
                logger.warning("CLAUDE_API_KEY not set, returning error")
                error_response = {
                    "type": "error",
                    "content": "CLAUDE_API_KEY not configured. Please add it to backend/.env"
                }
                yield f"data: {json.dumps(error_response)}\n\n"
                return

            # Initialize Anthropic client
            client = Anthropic(api_key=claude_api_key)

            # Build context description from workspace context
            context_description = ""
            if request.workspace_context:
                context_parts = []

                # Add folder information
                if request.workspace_context.folders:
                    folder_names = [
                        f.name for f in request.workspace_context.folders]
                    context_parts.append(
                        f"User is working in folder(s): {', '.join(folder_names)}")

                # Add instance information
                if request.workspace_context.instances:
                    context_parts.append(
                        "\nCurrent workspace context includes:")
                    for idx, inst in enumerate(request.workspace_context.instances):
                        is_active = idx == 0
                        active_marker = " (CURRENTLY OPEN)" if is_active else ""
                        context_parts.append(
                            f"\n- {inst.title} ({inst.type}){active_marker}:")

                        if inst.type == "text" and inst.content:
                            context_parts.append(
                                f"  Content: {inst.content[:500]}{'...' if len(inst.content) > 500 else ''}")
                        elif inst.type == "code" and inst.code:
                            context_parts.append(
                                f"  Language: {inst.language}")
                            context_parts.append(
                                f"  Code: {inst.code[:500]}{'...' if len(inst.code) > 500 else ''}")

                if context_parts:
                    context_description = "\n".join(context_parts) + "\n"

            # System prompt for animation planning
            system_prompt = f"""You are an expert educational animator planning a Manim animation for a student.

Your role: Create a detailed animation plan that will help generate high-quality Manim code.

Context: Manim is a mathematical animation library created by 3Blue1Brown. The generated code will visualize concepts using:
- Mathematical objects: Axes, graphs, equations (MathTex), number lines
- Geometric shapes: Circle, Square, Rectangle, Polygon, Arrow, Dot
- Transformations: Create, Transform, MoveAlongPath, Rotate, Scale
- Layouts: to_edge(), next_to(), move_to(), arrange()
- Colors: RED, BLUE, GREEN, YELLOW, ORANGE, PURPLE, etc.

{context_description if context_description else ""}

Plan requirements:
1. Break down the concept into clear visual components
2. Suggest specific Manim objects to use (e.g., "Use Axes with range [-5, 5]", "Create Dot at origin", "Use Arrow for vector")
3. Outline animation sequence in phases:
   - Phase 1: Title/Introduction (1-2 seconds)
   - Phase 2: Setup with axes/labels/initial objects (2-3 seconds)
   - Phase 3: Main demonstration/animation (5-10 seconds)
   - Phase 4: Conclusion with key insight (1-2 seconds)
4. Recommend specific colors for different elements (e.g., "particle in RED", "path in YELLOW")
5. Suggest labels, annotations, and text that enhance understanding
6. Consider educational clarity - what sequence helps students understand best?
7. Think about pacing - where to use self.wait(), how long animations should run

Output format: A detailed, structured plan (300-600 words) that guides code generation.
Include specific Manim method names, colors, positioning, and timing recommendations.

Remember: You are creating a plan, not writing code. Focus on WHAT to visualize and HOW to sequence it for maximum educational impact."""

            # User prompt with the concept to visualize
            user_prompt = f"""Create a detailed animation plan for the following concept:

Concept: {request.description}
Topic: {request.topic}

Provide a comprehensive plan that will guide the creation of an educational Manim animation.
Focus on clarity, visual hierarchy, and step-by-step understanding."""

            # Stream from Claude API using Sonnet for high-quality planning
            planning_model = "claude-sonnet-4-5"
            full_content = ""

            with client.messages.stream(
                model=planning_model,
                max_tokens=2048,  # Allow longer planning responses
                system=system_prompt,
                messages=[{"role": "user", "content": user_prompt}]
            ) as stream:
                for text_block in stream.text_stream:
                    full_content += text_block
                    # Send each chunk as it arrives
                    chunk_response = {
                        "type": "chunk",
                        "content": text_block
                    }
                    yield f"data: {json.dumps(chunk_response)}\n\n"

            # Send final complete message
            logger.info(
                f"Planning complete for '{request.description}' - {len(full_content)} characters")
            final_response = {
                "type": "done",
                "content": full_content
            }
            yield f"data: {json.dumps(final_response)}\n\n"

        except Exception as e:
            logger.error(f"Error in planning endpoint: {e}", exc_info=True)
            error_response = {
                "type": "error",
                "content": f"Error: {str(e)}"
            }
            yield f"data: {json.dumps(error_response)}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.post("/chat/stream")
async def chat_stream(request: Request):
    """
    Streaming chat endpoint with Claude AI integration
    Streams responses as they are generated using Server-Sent Events

    Args:
        request: Chat request with messages and branch path

    Returns:
        StreamingResponse with SSE format
    """
    # Parse request body manually to get better error logging
    try:
        body = await request.json()
        logger.info("=" * 80)
        logger.info("CHAT STREAM REQUEST RECEIVED")
        logger.info(f"Request keys: {list(body.keys())}")
        logger.info(f"Messages count: {len(body.get('messages', []))}")
        logger.info(
            f"Has workspaceContext: {bool(body.get('workspaceContext'))}")
        logger.info(f"Has learningMode: {bool(body.get('learningMode'))}")

        # Log detailed structure of workspaceContext if present
        if body.get('workspaceContext'):
            ws_ctx = body['workspaceContext']
            logger.info(f"WorkspaceContext keys: {list(ws_ctx.keys())}")
            logger.info(f"  - instances: {len(ws_ctx.get('instances', []))}")
            logger.info(f"  - folders: {len(ws_ctx.get('folders', []))}")
            logger.info(
                f"  - annotationImages: {len(ws_ctx.get('annotationImages', {}))}")
            logger.info(
                f"  - pdfAttachments: {len(ws_ctx.get('pdfAttachments', []))}")
            logger.info(
                f"  - attachments: {ws_ctx.get('attachments', 'NOT_PRESENT')}")
            pdf_context = ws_ctx.get('pdfContext', '')
            logger.info(f"  - pdfContext: {bool(pdf_context)}")
            if pdf_context:
                logger.info(f"  - pdfContext length: {len(pdf_context)}")
            logger.info(
                f"  - currentPageImage: {bool(ws_ctx.get('currentPageImage'))}")

        # Log message structure
        if body.get('messages'):
            logger.info("Messages structure:")
            for idx, msg in enumerate(body['messages']):
                logger.info(
                    f"  Message {idx}: role={msg.get('role')}, content_length={len(msg.get('content', ''))}")

        # Try to parse with Pydantic
        try:
            chat_request = ChatRequest(**body)
            logger.info("✓ Pydantic validation successful")
            logger.info("=" * 80)
        except Exception as validation_error:
            logger.error("=" * 80)
            logger.error("❌ PYDANTIC VALIDATION ERROR")
            logger.error(f"Error type: {type(validation_error).__name__}")
            logger.error(f"Error message: {str(validation_error)}")

            # Try to extract detailed field errors from Pydantic ValidationError
            if hasattr(validation_error, 'errors'):
                logger.error("Detailed validation errors:")
                for err in validation_error.errors():
                    logger.error(f"  Field: {err.get('loc')}")
                    logger.error(f"  Error: {err.get('msg')}")
                    logger.error(f"  Type: {err.get('type')}")
                    logger.error(f"  Input: {err.get('input')}")

            logger.error(
                f"Full request body:\n{json.dumps(body, indent=2, default=str)}")
            logger.error("=" * 80)
            raise HTTPException(status_code=422, detail=str(validation_error))
    except json.JSONDecodeError as e:
        logger.error(f"JSON decode error: {e}")
        raise HTTPException(status_code=400, detail="Invalid JSON")

    def generate():
        try:
            # Get Claude API key from environment
            claude_api_key = os.getenv("CLAUDE_API_KEY")

            if not claude_api_key:
                logger.warning(
                    "CLAUDE_API_KEY not set, using fallback response")
                # Fallback to stub response if no API key
                last_message = chat_request.messages[-1].content
                error_response = {
                    "type": "error",
                    "content": f"I received your message: '{last_message}'\n\nCLAUDE_API_KEY not configured. Please add it to backend/.env"
                }
                yield f"data: {json.dumps(error_response)}\n\n"
                return

            # Initialize Anthropic client
            client = Anthropic(api_key=claude_api_key)

            # Build system prompt with workspace context
            context_description = ""
            if chat_request.workspaceContext:
                context_parts = []

                # Add folder information
                if chat_request.workspaceContext.folders:
                    folder_names = [
                        f.name for f in chat_request.workspaceContext.folders]
                    context_parts.append(
                        f"User is working in folder(s): {', '.join(folder_names)}")

                # Add instance information
                if chat_request.workspaceContext.instances:
                    context_parts.append(
                        "\nCurrent workspace context includes:")
                    # First instance is typically the active one
                    for idx, inst in enumerate(chat_request.workspaceContext.instances):
                        is_active = idx == 0  # First instance is the active one
                        active_marker = " (CURRENTLY OPEN)" if is_active else ""
                        context_parts.append(
                            f"\n- {inst.title} ({inst.type}){active_marker}:")

                        if inst.type == "text" and inst.content:
                            context_parts.append(
                                f"  Content: {inst.content[:500]}{'...' if len(inst.content) > 500 else ''}")
                        elif inst.type == "code" and inst.code:
                            context_parts.append(
                                f"  Language: {inst.language}")
                            context_parts.append(
                                f"  Code: {inst.code[:500]}{'...' if len(inst.code) > 500 else ''}")
                        elif inst.type == "annotate":
                            if inst.id in chat_request.workspaceContext.annotationImages:
                                context_parts.append(
                                    f"  [Annotation canvas image included below]")

                # Add PDF attachments (support both old and new formats)
                pdf_attachments = []
                if chat_request.workspaceContext.pdfAttachments:
                    pdf_attachments = chat_request.workspaceContext.pdfAttachments
                elif chat_request.workspaceContext.attachments:
                    # Filter for PDF attachments from unified attachments
                    pdf_attachments = [
                        att for att in chat_request.workspaceContext.attachments if att.type == "pdf"]

                if pdf_attachments:
                    context_parts.append("\nAttached PDF documents:")
                    for pdf in pdf_attachments:
                        if pdf.status == "ready" and pdf.extractedText:
                            # Truncate very long PDF text to avoid token limits
                            max_pdf_length = 10000  # ~10KB per PDF
                            text_preview = pdf.extractedText[:max_pdf_length]
                            if len(pdf.extractedText) > max_pdf_length:
                                text_preview += f"\n... (truncated, showing first {max_pdf_length} characters of {len(pdf.extractedText)} total)"
                            context_parts.append(f"\n[PDF: {pdf.filename}]")
                            context_parts.append(text_preview)

                # Add PDF context (full text from active PDF/Lecture instance)
                if chat_request.workspaceContext.pdfContext:
                    pdf_context = chat_request.workspaceContext.pdfContext
                    # Truncate very long PDF text to avoid token limits
                    max_pdf_length = 10000  # ~10KB
                    text_preview = pdf_context[:max_pdf_length]
                    if len(pdf_context) > max_pdf_length:
                        text_preview += f"\n... (truncated, showing first {max_pdf_length} characters of {len(pdf_context)} total)"
                    context_parts.append("\n[PDF Document Content:]")
                    context_parts.append(text_preview)
                
                # Add lecture transcript context (when @transcript is mentioned)
                if hasattr(chat_request.workspaceContext, 'lectureTranscript') and chat_request.workspaceContext.lectureTranscript:
                    transcript = chat_request.workspaceContext.lectureTranscript
                    # Truncate very long transcript to avoid token limits
                    max_length = 15000  # ~15KB
                    text_preview = transcript[:max_length]
                    if len(transcript) > max_length:
                        text_preview += f"\n... (truncated, showing first {max_length} characters of {len(transcript)} total)"
                    context_parts.append("\n[Lecture Transcript:]")
                    context_parts.append(text_preview)
                
                # Add lecture slides context (when @slides/@pdf is mentioned)
                if hasattr(chat_request.workspaceContext, 'lectureSlides') and chat_request.workspaceContext.lectureSlides:
                    slides = chat_request.workspaceContext.lectureSlides
                    # Truncate very long slides text to avoid token limits
                    max_length = 15000  # ~15KB
                    text_preview = slides[:max_length]
                    if len(slides) > max_length:
                        text_preview += f"\n... (truncated, showing first {max_length} characters of {len(slides)} total)"
                    context_parts.append("\n[Lecture Slides Content:]")
                    context_parts.append(text_preview)

                if context_parts:
                    context_description = "\n".join(context_parts) + "\n"

                    # Log warning if context is very large
                    context_size = len(context_description)
                    if context_size > 50000:  # ~50KB
                        logger.warning(
                            f"Large workspace context detected: {context_size} characters, {len(chat_request.workspaceContext.instances)} instances")

            # System prompt for Claude
            system_prompt = """You are an AI tutor for Mimir, an educational platform. Your role is to:

1. Provide clear, engaging explanations of educational concepts
2. Break down complex topics into understandable parts
3. Use analogies and examples when helpful
4. Reference the user's workspace context when relevant to help them understand their work

=== FORMATTING YOUR RESPONSES ===

Your responses support **markdown formatting** and **LaTeX math notation**:

**Markdown formatting:**
- Use headers (## Header), bold (**text**), italic (*text*), lists, code blocks, etc.
- Format your responses with clear structure and visual hierarchy

**LaTeX math notation:**
- For inline math, use single dollar signs: $equation$
  Example: "The formula is $E = mc^2$ where..."

- For display/block math, use double dollar signs: $$equation$$
  Example:
  "The quadratic formula is:
  $$x = \\frac{{-b \\pm \\sqrt{{b^2 - 4ac}}}}{{2a}}$$"

- Use LaTeX for mathematical expressions, equations, formulas, matrices, integrals, summations, etc.
- Examples of when to use LaTeX:
  * Equations: $ax^2 + bx + c = 0$
  * Fractions: $\\frac{{numerator}}{{denominator}}$
  * Integrals: $\\int_a^b f(x) dx$
  * Summations: $\\sum_{{i=1}}^n i^2$
  * Matrices: $\\begin{{bmatrix}} a & b \\\\ c & d \\end{{bmatrix}}$
  * Greek letters: $\\alpha, \\beta, \\gamma, \\theta$
  * Special symbols: $\\infty, \\nabla, \\partial$

Use LaTeX whenever it makes mathematical content clearer and more readable. The rest of your response should use standard markdown.

=== READING IMAGES AND EQUATIONS ===

When the user includes images (especially annotation canvases with handwritten or drawn content), carefully examine them:

1. **Mathematical Equations**: When reading equations from images, pay close attention to:
   - Numbers vs letters (e.g., "10" not "|D|", "0" not "O", "1" not "l" or "I")
   - Mathematical symbols (+, -, ×, ÷, =, <, >, ≤, ≥, etc.)
   - Subscripts and superscripts
   - Fractions and division signs
   - Parentheses, brackets, and braces

2. **OCR Accuracy**: Double-check your reading of mathematical content:
   - Read numbers carefully - distinguish between similar-looking characters
   - Verify mathematical operators are correct
   - If uncertain, describe what you see and ask for clarification

3. **Handwritten Content**: For handwritten equations or text:
   - Take extra care with character recognition
   - Consider context to help disambiguate ambiguous characters
   - When solving equations, use the exact equation as written in the image

Example: If you see "5x = 10" in an image, read it as exactly that - not "5x = |D|" or "5x = ID". The number "10" should be recognized as the digits one and zero, not letters or symbols.

=== USER'S WORKSPACE CONTEXT ===

""" + (context_description if context_description else "") + """

=== ANIMATION SUGGESTIONS ===

CRITICAL INSTRUCTION: If the user's message contains ANY of these keywords or phrases, you MUST include an animation suggestion:
- "visualize", "visualization", "show me", "show", "animate", "animation", "draw", "illustrate", "demonstrate", "create an animation", "make an animation", "generate an animation"
- Any request to "see" something visually
- Any request for a "graph", "plot", "diagram", or visual representation

When the user explicitly requests a visualization (using any of the above keywords), you MUST append this exact marker at the END of your response:

ANIMATION_SUGGESTION: {"description": "brief description of what to animate", "topic": "math"}

DO NOT skip this marker if the user asks for visualization. Even if you're unsure how to visualize it, create a reasonable description and include the marker.

Animation suggestions are appropriate for:
- Mathematical functions, graphs, transformations (Brownian motion, random walks, matrix transformations, conditional PDFs, joint PDFs)
- Physics simulations (waves, collisions, motion)
- Geometric visualizations
- Data structures and algorithms
- Statistical concepts (distributions, probability, conditional probability)
- Any concept the user explicitly asks to visualize or animate

When the user explicitly requests a visualization, ALWAYS provide an animation suggestion. Do not skip it.

Example response with animation:
"Brownian motion describes the random movement of particles suspended in a fluid. Imagine a tiny pollen grain in water, constantly being bumped by water molecules from all directions. This creates an erratic, zigzag path that never repeats.

ANIMATION_SUGGESTION: {"description": "Brownian motion particle", "topic": "math"}"
"""

            # Convert messages to Anthropic format, including images if present
            anthropic_messages = []

            # Find the last user message index to attach images
            last_user_msg_idx = -1
            for i in range(len(chat_request.messages) - 1, -1, -1):
                if chat_request.messages[i].role == "user":
                    last_user_msg_idx = i
                    break

            for idx, msg in enumerate(chat_request.messages):
                # Skip messages with empty content (except final assistant message)
                is_final_assistant = (idx == len(
                    chat_request.messages) - 1 and msg.role == "assistant")

                # Check if content is empty - handle None, empty string, and whitespace-only strings
                content = msg.content if msg.content is not None else ""
                if isinstance(content, str):
                    content = content.strip()
                content_empty = not content

                # Skip empty messages unless it's the final assistant message
                if content_empty and not is_final_assistant:
                    logger.warning(
                        f"Skipping empty message at index {idx} (role: {msg.role}, content type: {type(msg.content)})")
                    continue

                # Attach images to the last user message (the current one being sent)
                if (idx == last_user_msg_idx and
                    chat_request.workspaceContext and
                        chat_request.workspaceContext.annotationImages):

                    # Only add text part if content is not empty
                    content_parts = []
                    if content and content.strip():
                        content_parts.append({"type": "text", "text": content})

                    # Add annotation images with descriptions
                    for inst_id, image_base64 in chat_request.workspaceContext.annotationImages.items():
                        # Find the instance for description
                        inst = next(
                            (i for i in chat_request.workspaceContext.instances if i.id == inst_id), None)
                        if inst:
                            # Add text description before image
                            content_parts.append({
                                "type": "text",
                                "text": f"\n[Annotation canvas from '{inst.title}' instance:]"
                            })

                            # Remove data:image/png;base64, prefix if present
                            image_data = image_base64.split(
                                ',')[1] if ',' in image_base64 else image_base64

                            content_parts.append({
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": "image/png",
                                    "data": image_data
                                }
                            })

                    # Only add message if content_parts is not empty
                    if content_parts:
                        anthropic_messages.append({
                            "role": msg.role,
                            "content": content_parts
                        })
                else:
                    # For regular messages, only add if content is not empty (or it's final assistant)
                    if not content_empty or is_final_assistant:
                        anthropic_messages.append({
                            "role": msg.role,
                            "content": content if not content_empty else ""
                        })

            # Final validation: ensure no empty messages (except final assistant)
            validated_messages = []
            for idx, msg in enumerate(anthropic_messages):
                is_final = (idx == len(anthropic_messages) - 1)
                is_assistant = msg.get("role") == "assistant"

                # Check content
                msg_content = msg.get("content", "")
                if isinstance(msg_content, list):
                    # For multi-part content (with images), check if any part has content
                    has_content = any(
                        part.get("type") == "text" and part.get(
                            "text", "").strip()
                        or part.get("type") == "image"
                        for part in msg_content
                    )
                else:
                    has_content = msg_content and (isinstance(
                        msg_content, str) and msg_content.strip())

                # Skip empty messages unless it's the final assistant message
                if not has_content and not (is_final and is_assistant):
                    logger.warning(
                        f"Filtering out empty message at index {idx} after validation (role: {msg.get('role')})")
                    continue

                validated_messages.append(msg)

            # Stream from Claude API
            # Use Sonnet 4.5 as default, but allow override via environment variable
            chat_model = os.getenv("CHAT_MODEL", "claude-sonnet-4-5")
            full_content = ""
            with client.messages.stream(
                model=chat_model,
                max_tokens=1024,
                system=system_prompt,
                messages=validated_messages
            ) as stream:
                for text_block in stream.text_stream:
                    full_content += text_block
                    # Send each chunk as it arrives
                    chunk_response = {
                        "type": "chunk",
                        "content": text_block
                    }
                    yield f"data: {json.dumps(chunk_response)}\n\n"

            # Parse animation suggestion from full response
            suggested_animation = None
            # Find the ANIMATION_SUGGESTION marker
            marker_pos = full_content.find('ANIMATION_SUGGESTION:')
            logger.info(
                f"Looking for ANIMATION_SUGGESTION marker in response (length: {len(full_content)} chars)")
            if marker_pos != -1:
                logger.info(
                    f"Found ANIMATION_SUGGESTION marker at position {marker_pos}")
                # Find the opening brace after the marker
                json_start = full_content.find('{', marker_pos)
                if json_start != -1:
                    # Try to extract JSON by finding matching closing brace
                    brace_count = 0
                    json_end = json_start
                    for i in range(json_start, len(full_content)):
                        if full_content[i] == '{':
                            brace_count += 1
                        elif full_content[i] == '}':
                            brace_count -= 1
                            if brace_count == 0:
                                json_end = i + 1
                                break

                    if brace_count == 0:
                        try:
                            json_str = full_content[json_start:json_end]
                            logger.info(f"Extracted JSON string: {json_str}")
                            animation_data = json.loads(json_str)
                            suggested_animation = AnimationSuggestion(
                                **animation_data)
                            logger.info(
                                f"Successfully parsed animation suggestion: {suggested_animation}")
                        except Exception as e:
                            logger.error(
                                f"Failed to parse animation suggestion: {e}")
                            logger.error(
                                f"JSON string that failed: {full_content[json_start:json_end]}")
            else:
                # Check if user asked for visualization but no marker was found
                last_user_msg = None
                last_user_msg_original = None
                for msg in reversed(chat_request.messages):
                    if msg.role == "user":
                        last_user_msg = msg.content.lower() if msg.content else ""
                        last_user_msg_original = msg.content if msg.content else ""
                        break

                visualization_keywords = ["visualize", "visualization", "show me", "show", "animate",
                                          "animation", "draw", "illustrate", "demonstrate", "graph", "plot", "diagram"]
                if last_user_msg and any(keyword in last_user_msg for keyword in visualization_keywords):
                    logger.warning(
                        f"User asked for visualization but Claude did not include ANIMATION_SUGGESTION marker. Creating fallback suggestion. User message: {last_user_msg[:100]}")

                    # Create a fallback animation suggestion based on the user's request
                    # Extract the concept from the user's message
                    description = last_user_msg_original or "mathematical concept"
                    # Remove common visualization request phrases to get the core concept
                    for keyword in visualization_keywords:
                        # Use case-insensitive replacement
                        description = re.sub(
                            re.escape(keyword), "", description, flags=re.IGNORECASE).strip()
                    # Clean up common phrases
                    description = re.sub(
                        r"\b(how to|how|the|a|an)\b", "", description, flags=re.IGNORECASE).strip()
                    # If description is too short or generic, use the full message or a default
                    if not description or len(description) < 3 or description.lower() in ["me", "it", "this", "that"]:
                        # Try to extract from the full message context or use a sensible default
                        if len(last_user_msg_original) > 10:
                            description = last_user_msg_original[:200]
                        else:
                            description = "mathematical concept visualization"

                    # Determine topic based on keywords in the message
                    topic = "math"  # default
                    if any(word in last_user_msg for word in ["pdf", "probability", "distribution", "statistic", "random", "conditional"]):
                        topic = "math"
                    elif any(word in last_user_msg for word in ["function", "graph", "plot", "curve", "derivative", "integral"]):
                        topic = "math"
                    elif any(word in last_user_msg for word in ["physics", "wave", "motion", "force", "velocity"]):
                        topic = "physics"
                    elif any(word in last_user_msg for word in ["algorithm", "sort", "search", "tree", "data structure"]):
                        topic = "cs"

                    # Create the animation suggestion
                    suggested_animation = AnimationSuggestion(
                        description=description[:200],  # Limit length
                        topic=topic
                    )
                    logger.info(
                        f"Created fallback animation suggestion: {suggested_animation}")

            # Remove the ANIMATION_SUGGESTION marker from the displayed message
            if marker_pos != -1:
                # Remove from marker to end of JSON object
                json_start = full_content.find('{', marker_pos)
                if json_start != -1:
                    brace_count = 0
                    json_end = json_start
                    for i in range(json_start, len(full_content)):
                        if full_content[i] == '{':
                            brace_count += 1
                        elif full_content[i] == '}':
                            brace_count -= 1
                            if brace_count == 0:
                                json_end = i + 1
                                break
                    if brace_count == 0:
                        clean_message = (
                            full_content[:marker_pos] + full_content[json_end:]).strip()
                    else:
                        clean_message = full_content[:marker_pos].strip()
                else:
                    clean_message = full_content[:marker_pos].strip()
            else:
                clean_message = full_content.strip()

            # Send final message with animation suggestion
            logger.info(
                f"Sending final response with suggestedAnimation: {suggested_animation is not None}")
            if suggested_animation:
                logger.info(
                    f"Animation suggestion details: {suggested_animation.model_dump()}")
            final_response = {
                "type": "done",
                "content": clean_message,
                "suggestedAnimation": suggested_animation.model_dump() if suggested_animation else None,
                "nodeId": f"node-{int(__import__('time').time() * 1000)}"
            }
            yield f"data: {json.dumps(final_response)}\n\n"

        except Exception as e:
            logger.error(
                f"Error in streaming chat endpoint: {e}", exc_info=True)
            error_response = {
                "type": "error",
                "content": f"Error: {str(e)}"
            }
            yield f"data: {json.dumps(error_response)}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Chat endpoint with Claude AI integration

    Args:
        request: Chat request with messages and branch path

    Returns:
        ChatResponse with AI message and optional animation suggestion

    Example:
        POST /chat
        {
            "messages": [
                {"role": "user", "content": "What is Brownian motion?"}
            ],
            "branchPath": []
        }
    """
    try:
        # Get Claude API key from environment
        claude_api_key = os.getenv("CLAUDE_API_KEY")

        if not claude_api_key:
            logger.warning("CLAUDE_API_KEY not set, using fallback response")
            # Fallback to stub response if no API key
            last_message = request.messages[-1].content
            return ChatResponse(
                message=ChatMessageResponse(
                    role="assistant",
                    content=f"I received your message: '{last_message}'\n\nCLAUDE_API_KEY not configured. Please add it to backend/.env"
                ),
                suggestedAnimation=None,
                nodeId=f"node-{int(__import__('time').time() * 1000)}"
            )

        # Initialize Anthropic client
        client = Anthropic(api_key=claude_api_key)

        # System prompt for Claude
        system_prompt = """You are an AI tutor for Mimir, an educational platform. Your role is to:

1. Provide clear, engaging explanations of educational concepts
2. Break down complex topics into understandable parts
3. Use analogies and examples when helpful

=== READING IMAGES AND EQUATIONS ===

When the user includes images (especially annotation canvases with handwritten or drawn content), carefully examine them:

1. **Mathematical Equations**: When reading equations from images, pay close attention to:
   - Numbers vs letters (e.g., "10" not "|D|", "0" not "O", "1" not "l" or "I")
   - Mathematical symbols (+, -, ×, ÷, =, <, >, ≤, ≥, etc.)
   - Subscripts and superscripts
   - Fractions and division signs
   - Parentheses, brackets, and braces

2. **OCR Accuracy**: Double-check your reading of mathematical content:
   - Read numbers carefully - distinguish between similar-looking characters
   - Verify mathematical operators are correct
   - If uncertain, describe what you see and ask for clarification

3. **Handwritten Content**: For handwritten equations or text:
   - Take extra care with character recognition
   - Consider context to help disambiguate ambiguous characters
   - When solving equations, use the exact equation as written in the image

Example: If you see "5x = 10" in an image, read it as exactly that - not "5x = |D|" or "5x = ID". The number "10" should be recognized as the digits one and zero, not letters or symbols.

=== ANIMATION SUGGESTIONS ===

CRITICAL INSTRUCTION: If the user's message contains ANY of these keywords or phrases, you MUST include an animation suggestion:
- "visualize", "visualization", "show me", "show", "animate", "animation", "draw", "illustrate", "demonstrate", "create an animation", "make an animation", "generate an animation"
- Any request to "see" something visually
- Any request for a "graph", "plot", "diagram", or visual representation

When the user explicitly requests a visualization (using any of the above keywords), you MUST append this exact marker at the END of your response:

ANIMATION_SUGGESTION: {"description": "brief description of what to animate", "topic": "math"}

DO NOT skip this marker if the user asks for visualization. Even if you're unsure how to visualize it, create a reasonable description and include the marker.

Animation suggestions are appropriate for:
- Mathematical functions, graphs, transformations (Brownian motion, random walks, matrix transformations, conditional PDFs, joint PDFs)
- Physics simulations (waves, collisions, motion)
- Geometric visualizations
- Data structures and algorithms
- Statistical concepts (distributions, probability, conditional probability)
- Any concept the user explicitly asks to visualize or animate

When the user explicitly requests a visualization, ALWAYS provide an animation suggestion. Do not skip it.

Example response with animation:
"Brownian motion describes the random movement of particles suspended in a fluid. Imagine a tiny pollen grain in water, constantly being bumped by water molecules from all directions. This creates an erratic, zigzag path that never repeats.

ANIMATION_SUGGESTION: {"description": "Brownian motion particle", "topic": "math"}"
"""

        # Convert messages to Anthropic format, filtering out empty messages
        anthropic_messages = []
        for idx, msg in enumerate(request.messages):
            # Skip messages with empty content (except final assistant message)
            is_final_assistant = (idx == len(
                request.messages) - 1 and msg.role == "assistant")

            # Check if content is empty - handle None, empty string, and whitespace-only strings
            content = msg.content if msg.content is not None else ""
            if isinstance(content, str):
                content = content.strip()
            content_empty = not content

            # Skip empty messages unless it's the final assistant message
            if content_empty and not is_final_assistant:
                logger.warning(
                    f"Skipping empty message at index {idx} (role: {msg.role}, content type: {type(msg.content)})")
                continue

            anthropic_messages.append({
                "role": msg.role,
                "content": content if not content_empty else ""
            })

        # Final validation: ensure no empty messages (except final assistant)
        validated_messages = []
        for idx, msg in enumerate(anthropic_messages):
            is_final = (idx == len(anthropic_messages) - 1)
            is_assistant = msg.get("role") == "assistant"
            msg_content = msg.get("content", "")
            has_content = msg_content and (isinstance(
                msg_content, str) and msg_content.strip())

            # Skip empty messages unless it's the final assistant message
            if not has_content and not (is_final and is_assistant):
                logger.warning(
                    f"Filtering out empty message at index {idx} after validation (role: {msg.get('role')})")
                continue

            validated_messages.append(msg)

        # Call Claude API
        # Use Sonnet 4.5 as default, but allow override via environment variable
        chat_model = os.getenv("CHAT_MODEL", "claude-sonnet-4-5")
        response = client.messages.create(
            model=chat_model,
            max_tokens=1024,
            system=system_prompt,
            messages=validated_messages
        )

        # Extract assistant message
        assistant_message = response.content[0].text

        # Parse animation suggestion from response
        suggested_animation = None
        # Find the ANIMATION_SUGGESTION marker
        marker_pos = assistant_message.find('ANIMATION_SUGGESTION:')
        logger.info(
            f"Looking for ANIMATION_SUGGESTION marker in response (length: {len(assistant_message)} chars)")
        if marker_pos != -1:
            logger.info(
                f"Found ANIMATION_SUGGESTION marker at position {marker_pos}")
            # Find the opening brace after the marker
            json_start = assistant_message.find('{', marker_pos)
            if json_start != -1:
                # Try to extract JSON by finding matching closing brace
                brace_count = 0
                json_end = json_start
                for i in range(json_start, len(assistant_message)):
                    if assistant_message[i] == '{':
                        brace_count += 1
                    elif assistant_message[i] == '}':
                        brace_count -= 1
                        if brace_count == 0:
                            json_end = i + 1
                            break

                if brace_count == 0:
                    try:
                        import json
                        json_str = assistant_message[json_start:json_end]
                        logger.info(f"Extracted JSON string: {json_str}")
                        animation_data = json.loads(json_str)
                        suggested_animation = AnimationSuggestion(
                            **animation_data)
                        logger.info(
                            f"Successfully parsed animation suggestion: {suggested_animation}")
                    except Exception as e:
                        logger.error(
                            f"Failed to parse animation suggestion: {e}")
                        logger.error(
                            f"JSON string that failed: {assistant_message[json_start:json_end]}")

        # Fallback: If user asked for visualization but Claude didn't provide marker, create one
        if suggested_animation is None:
            last_user_msg = None
            last_user_msg_original = None
            for msg in reversed(request.messages):
                if msg.role == "user":
                    last_user_msg = msg.content.lower() if msg.content else ""
                    last_user_msg_original = msg.content if msg.content else ""
                    break

            visualization_keywords = ["visualize", "visualization", "show me", "show", "animate",
                                      "animation", "draw", "illustrate", "demonstrate", "graph", "plot", "diagram"]
            if last_user_msg and any(keyword in last_user_msg for keyword in visualization_keywords):
                logger.warning(
                    f"User asked for visualization but Claude did not include ANIMATION_SUGGESTION marker. Creating fallback suggestion. User message: {last_user_msg[:100]}")

                # Create a fallback animation suggestion based on the user's request
                description = last_user_msg_original or "mathematical concept"
                # Remove common visualization request phrases to get the core concept
                for keyword in visualization_keywords:
                    # Use case-insensitive replacement
                    description = re.sub(
                        re.escape(keyword), "", description, flags=re.IGNORECASE).strip()
                # Clean up common phrases
                description = re.sub(
                    r"\b(how to|how|the|a|an)\b", "", description, flags=re.IGNORECASE).strip()
                # If description is too short or generic, use the full message or a default
                if not description or len(description) < 3 or description.lower() in ["me", "it", "this", "that"]:
                    # Try to extract from the full message context or use a sensible default
                    if len(last_user_msg_original) > 10:
                        description = last_user_msg_original[:200]
                    else:
                        description = "mathematical concept visualization"

                # Determine topic based on keywords in the message
                topic = "math"  # default
                if any(word in last_user_msg for word in ["pdf", "probability", "distribution", "statistic", "random", "conditional"]):
                    topic = "math"
                elif any(word in last_user_msg for word in ["function", "graph", "plot", "curve", "derivative", "integral"]):
                    topic = "math"
                elif any(word in last_user_msg for word in ["physics", "wave", "motion", "force", "velocity"]):
                    topic = "physics"
                elif any(word in last_user_msg for word in ["algorithm", "sort", "search", "tree", "data structure"]):
                    topic = "cs"

                # Create the animation suggestion
                suggested_animation = AnimationSuggestion(
                    description=description[:200],  # Limit length
                    topic=topic
                )
                logger.info(
                    f"Created fallback animation suggestion: {suggested_animation}")

        # Remove the ANIMATION_SUGGESTION marker from the displayed message
        if marker_pos != -1:
            # Remove from marker to end of JSON object
            json_start = assistant_message.find('{', marker_pos)
            if json_start != -1:
                brace_count = 0
                json_end = json_start
                for i in range(json_start, len(assistant_message)):
                    if assistant_message[i] == '{':
                        brace_count += 1
                    elif assistant_message[i] == '}':
                        brace_count -= 1
                        if brace_count == 0:
                            json_end = i + 1
                            break
                if brace_count == 0:
                    clean_message = (
                        assistant_message[:marker_pos] + assistant_message[json_end:]).strip()
                else:
                    clean_message = assistant_message[:marker_pos].strip()
            else:
                clean_message = assistant_message[:marker_pos].strip()
        else:
            clean_message = assistant_message.strip()

        return ChatResponse(
            message=ChatMessageResponse(
                role="assistant",
                content=clean_message
            ),
            suggestedAnimation=suggested_animation,
            nodeId=f"node-{int(__import__('time').time() * 1000)}"
        )

    except Exception as e:
        logger.error(f"Error in chat endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/study-tools/flashcards")
async def generate_flashcards(request: dict):
    """
    Generate flashcards from PDF text using Claude AI

    Args:
        request: dict with 'pdfText' field containing the PDF content

    Returns:
        JSON with array of flashcards (front/back pairs)
    """
    try:
        pdf_text = request.get('pdfText', '')
        if not pdf_text:
            raise HTTPException(status_code=400, detail="PDF text is required")

        # Get Claude API key from environment
        claude_api_key = os.getenv("CLAUDE_API_KEY")
        if not claude_api_key:
            raise HTTPException(
                status_code=500, detail="CLAUDE_API_KEY not configured")

        # Initialize Anthropic client
        client = Anthropic(api_key=claude_api_key)

        # Limit PDF text to avoid token limits (~20K characters)
        max_text_length = 20000
        if len(pdf_text) > max_text_length:
            pdf_text = pdf_text[:max_text_length] + "...(truncated)"

        # System prompt for flashcard generation
        system_prompt = """You are an expert educator creating flashcards from educational content.

Your task: Generate high-quality flashcards that help students learn and review key concepts.

Guidelines:
1. Create 8-12 flashcards covering the most important concepts
2. Front: A clear, concise question or prompt
3. Back: A focused answer with essential information
4. Focus on key definitions, concepts, formulas, and relationships
5. Vary question types: definitions, applications, examples, comparisons
6. Keep each card focused on ONE concept
7. Use clear, student-friendly language
8. Use LaTeX for mathematical notation:
   - Inline math: $equation$ (e.g., $E = mc^2$)
   - Display math: $$equation$$ (e.g., $$\\int_a^b f(x) dx$$)
   - Examples: $\\frac{a}{b}$, $\\sum_{i=1}^n$, $\\alpha$, $x^2$

Output format: Return ONLY a JSON array of flashcards, no other text.

Example output:
[
  {
    "front": "What is the derivative of $x^2$?",
    "back": "$2x$"
  },
  {
    "front": "Define photosynthesis",
    "back": "The process by which plants convert light energy into chemical energy stored in glucose"
  },
  {
    "front": "What is the quadratic formula?",
    "back": "$$x = \\\\frac{-b \\\\pm \\\\sqrt{b^2 - 4ac}}{2a}$$"
  }
]"""

        user_prompt = f"""Generate flashcards from this content:

{pdf_text}

Return a JSON array of flashcards with "front" and "back" fields."""

        # Call Claude API
        chat_model = os.getenv("CHAT_MODEL", "claude-sonnet-4-5")
        response = client.messages.create(
            model=chat_model,
            max_tokens=2048,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}]
        )

        # Extract response text
        response_text = response.content[0].text.strip()

        # Parse JSON (handle potential markdown code blocks)
        if response_text.startswith('```'):
            # Extract JSON from code block
            lines = response_text.split('\n')
            json_lines = []
            in_code_block = False
            for line in lines:
                if line.startswith('```'):
                    in_code_block = not in_code_block
                elif in_code_block:
                    json_lines.append(line)
            response_text = '\n'.join(json_lines)

        # Parse JSON response
        flashcards = json.loads(response_text)

        logger.info(f"Generated {len(flashcards)} flashcards")
        return {"flashcards": flashcards}

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse flashcards JSON: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to parse flashcards response")
    except Exception as e:
        logger.error(f"Error generating flashcards: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/study-tools/quiz")
async def generate_quiz(request: dict):
    """
    Generate quiz questions from PDF text using Claude AI

    Args:
        request: dict with 'pdfText' field containing the PDF content

    Returns:
        JSON with array of quiz questions (question, options, correctIndex)
    """
    try:
        pdf_text = request.get('pdfText', '')
        if not pdf_text:
            raise HTTPException(status_code=400, detail="PDF text is required")

        # Get Claude API key from environment
        claude_api_key = os.getenv("CLAUDE_API_KEY")
        if not claude_api_key:
            raise HTTPException(
                status_code=500, detail="CLAUDE_API_KEY not configured")

        # Initialize Anthropic client
        client = Anthropic(api_key=claude_api_key)

        # Limit PDF text to avoid token limits (~20K characters)
        max_text_length = 20000
        if len(pdf_text) > max_text_length:
            pdf_text = pdf_text[:max_text_length] + "...(truncated)"

        # System prompt for quiz generation
        system_prompt = """You are an expert educator creating quiz questions from educational content.

Your task: Generate multiple-choice quiz questions that test understanding of key concepts.

Guidelines:
1. Create 6-10 questions covering the most important concepts
2. Each question should have 4 answer options
3. Exactly one correct answer per question
4. Make distractors plausible but clearly incorrect
5. Test various levels: recall, comprehension, application
6. Questions should be clear and unambiguous
7. Answers should be concise
8. Use LaTeX for mathematical notation in questions and options:
   - Inline math: $equation$ (e.g., $E = mc^2$)
   - Examples: $x^2$, $\\frac{a}{b}$, $\\sum_{i=1}^n$, $\\alpha$

Output format: Return ONLY a JSON array of questions, no other text.

Example output:
[
  {
    "question": "What is the capital of France?",
    "options": ["London", "Paris", "Berlin", "Madrid"],
    "correctIndex": 1
  },
  {
    "question": "What is the derivative of $f(x) = x^3$?",
    "options": ["$3x^2$", "$x^2$", "$3x$", "$x^3$"],
    "correctIndex": 0
  }
]"""

        user_prompt = f"""Generate quiz questions from this content:

{pdf_text}

Return a JSON array of questions with "question", "options" (array of 4 strings), and "correctIndex" (0-3) fields."""

        # Call Claude API
        chat_model = os.getenv("CHAT_MODEL", "claude-sonnet-4-5")
        response = client.messages.create(
            model=chat_model,
            max_tokens=2048,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}]
        )

        # Extract response text
        response_text = response.content[0].text.strip()

        # Parse JSON (handle potential markdown code blocks)
        if response_text.startswith('```'):
            # Extract JSON from code block
            lines = response_text.split('\n')
            json_lines = []
            in_code_block = False
            for line in lines:
                if line.startswith('```'):
                    in_code_block = not in_code_block
                elif in_code_block:
                    json_lines.append(line)
            response_text = '\n'.join(json_lines)

        # Parse JSON response
        questions = json.loads(response_text)

        logger.info(f"Generated {len(questions)} quiz questions")
        return {"questions": questions}

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse quiz JSON: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to parse quiz response")
    except Exception as e:
        logger.error(f"Error generating quiz: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/study-tools/summary")
async def generate_summary(request: dict):
    """
    Generate a summary from PDF text using Claude AI

    Args:
        request: dict with 'pdfText' field containing the PDF content

    Returns:
        JSON with summary text
    """
    try:
        pdf_text = request.get('pdfText', '')
        if not pdf_text:
            raise HTTPException(status_code=400, detail="PDF text is required")

        # Get Claude API key from environment
        claude_api_key = os.getenv("CLAUDE_API_KEY")
        if not claude_api_key:
            raise HTTPException(
                status_code=500, detail="CLAUDE_API_KEY not configured")

        # Initialize Anthropic client
        client = Anthropic(api_key=claude_api_key)

        # Limit PDF text to avoid token limits (~30K characters for summary)
        max_text_length = 30000
        if len(pdf_text) > max_text_length:
            pdf_text = pdf_text[:max_text_length] + "...(truncated)"

        # System prompt for summary generation
        system_prompt = """You are an expert educator creating concise summaries of educational content.

Your task: Generate a clear, structured summary that captures the key concepts and main ideas.

Guidelines:
1. Start with a brief overview (1-2 sentences)
2. Break down into main topics with headers
3. Use bullet points for key concepts
4. Include important definitions, formulas, or principles
5. Highlight relationships between concepts
6. Keep it concise but comprehensive
7. Use clear, student-friendly language
8. Aim for 300-500 words

Output format: Plain text with markdown formatting (headers, bullet points)"""

        user_prompt = f"""Summarize this content:

{pdf_text}

Create a structured summary with main topics and key concepts."""

        # Call Claude API
        chat_model = os.getenv("CHAT_MODEL", "claude-sonnet-4-5")
        response = client.messages.create(
            model=chat_model,
            max_tokens=1500,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}]
        )

        # Extract response text
        summary = response.content[0].text.strip()

        logger.info(f"Generated summary ({len(summary)} characters)")
        return {"summary": summary}

    except Exception as e:
        logger.error(f"Error generating summary: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/study-tools/summary/stream")
async def generate_summary_stream(request: dict):
    """
    Generate a summary from PDF text using Claude AI with streaming

    Args:
        request: dict with 'pdfText' field containing the PDF content

    Returns:
        StreamingResponse with SSE format containing summary chunks
    """
    def generate():
        try:
            pdf_text = request.get('pdfText', '')
            if not pdf_text:
                error_response = {
                    "type": "error",
                    "content": "PDF text is required"
                }
                yield f"data: {json.dumps(error_response)}\n\n"
                return

            # Get Claude API key from environment
            claude_api_key = os.getenv("CLAUDE_API_KEY")
            if not claude_api_key:
                error_response = {
                    "type": "error",
                    "content": "CLAUDE_API_KEY not configured"
                }
                yield f"data: {json.dumps(error_response)}\n\n"
                return

            # Initialize Anthropic client
            client = Anthropic(api_key=claude_api_key)

            # Limit PDF text to avoid token limits (~30K characters for summary)
            max_text_length = 30000
            if len(pdf_text) > max_text_length:
                pdf_text = pdf_text[:max_text_length] + "...(truncated)"

            # Enhanced system prompt for summary generation
            system_prompt = """You are an expert educator creating comprehensive, well-structured summaries of educational content.

Your task: Generate a clear, engaging summary that helps students understand and retain the key concepts.

Guidelines:
1. **Opening Overview**: Start with 2-3 sentences capturing the document's main theme and purpose
2. **Hierarchical Structure**:
   - Use markdown headers (##, ###) to organize topics
   - Group related concepts together logically
   - Progress from foundational to advanced ideas
3. **Key Concepts**: For each major topic:
   - Provide clear, concise definitions
   - Include important formulas, equations, or principles
   - Use bullet points for lists and sub-concepts
   - Add examples where they clarify understanding
4. **Connections**: Explicitly highlight:
   - How concepts relate to each other
   - Prerequisites or dependencies between topics
   - Real-world applications or implications
5. **Visual Organization**:
   - Use **bold** for key terms and concepts
   - Use *italics* for emphasis
   - Keep paragraphs short (2-4 sentences)
6. **Comprehensiveness**: Aim for 400-600 words
   - Balance depth with clarity
   - Don't omit important details, but stay concise
   - Prioritize understanding over exhaustive coverage

Output format: Well-formatted markdown with LaTeX support:
- ## for main sections
- ### for subsections
- Bullet points for lists
- **Bold** for key terms
- LaTeX for mathematical expressions:
  * Inline math: $equation$ (e.g., $E = mc^2$)
  * Display math: $$equation$$ (e.g., $$\\int_a^b f(x) dx$$)
  * Use LaTeX for all formulas, equations, integrals, summations, matrices, etc.
  * Examples: $\\frac{a}{b}$, $\\sum_{i=1}^n$, $\\alpha$, $\\theta$, $\\nabla$

Remember: Your goal is to create a study resource that students can review to quickly grasp the material's core ideas and structure. Use LaTeX for all mathematical notation to ensure clarity and professionalism."""

            user_prompt = f"""Create a comprehensive, well-structured summary of the following educational content:

{pdf_text}

Focus on clarity, organization, and helping students understand the key concepts and their relationships."""

            # Stream from Claude API
            chat_model = os.getenv("CHAT_MODEL", "claude-sonnet-4-5")
            full_content = ""

            with client.messages.stream(
                model=chat_model,
                max_tokens=2048,
                system=system_prompt,
                messages=[{"role": "user", "content": user_prompt}]
            ) as stream:
                for text_block in stream.text_stream:
                    full_content += text_block
                    # Send each chunk as it arrives
                    chunk_response = {
                        "type": "chunk",
                        "content": text_block
                    }
                    yield f"data: {json.dumps(chunk_response)}\n\n"

            # Send final complete message
            logger.info(f"Generated summary ({len(full_content)} characters)")
            final_response = {
                "type": "done",
                "content": full_content
            }
            yield f"data: {json.dumps(final_response)}\n\n"

        except Exception as e:
            logger.error(
                f"Error in summary streaming endpoint: {e}", exc_info=True)
            error_response = {
                "type": "error",
                "content": f"Error: {str(e)}"
            }
            yield f"data: {json.dumps(error_response)}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.post("/study-tools/mindmap/stream")
async def generate_mindmap_stream(request: dict):
    """
    Generate a mind map from PDF text using Claude AI with adaptive node count

    Args:
        request: dict with:
          - pdfText: string (content)
          - scope: string (description of scope)
          - nodeCount: dict with min, max, levels (optional)

    Returns:
        StreamingResponse with SSE format containing mind map data
    """
    def generate():
        try:
            pdf_text = request.get('pdfText', '')
            scope = request.get('scope', 'full document')
            node_config = request.get('nodeCount', None)

            if not pdf_text:
                error_response = {
                    "type": "error",
                    "content": "PDF text is required"
                }
                yield f"data: {json.dumps(error_response)}\n\n"
                return

            # Calculate adaptive node count if not provided
            if not node_config:
                word_count = len(pdf_text.split())
                if word_count < 500:
                    node_config = {'min': 5, 'max': 10, 'levels': 2}
                elif word_count < 2000:
                    node_config = {'min': 10, 'max': 15, 'levels': 3}
                elif word_count < 5000:
                    node_config = {'min': 15, 'max': 20, 'levels': 4}
                else:
                    node_config = {'min': 20, 'max': 25, 'levels': 4}

            # Get Claude API key from environment
            claude_api_key = os.getenv("CLAUDE_API_KEY")
            if not claude_api_key:
                error_response = {
                    "type": "error",
                    "content": "CLAUDE_API_KEY not configured"
                }
                yield f"data: {json.dumps(error_response)}\n\n"
                return

            # Initialize Anthropic client
            client = Anthropic(api_key=claude_api_key)

            # Limit PDF text to avoid token limits
            max_text_length = 30000
            if len(pdf_text) > max_text_length:
                pdf_text = pdf_text[:max_text_length] + "...(truncated)"

            # System prompt for mind map generation with adaptive node count
            system_prompt = f"""You are an expert at creating interactive concept maps from educational content.

Your task: Generate a hierarchical mind map that visualizes the key concepts and their relationships.

**IMPORTANT: Adapt node count to content scope**
- Target nodes: {node_config['min']}-{node_config['max']} nodes
- Maximum levels: {node_config['levels']}
- If the content is focused on a small topic, use fewer nodes and levels
- If the content covers broad topics, use more nodes and deeper hierarchy
- Focus on quality over quantity - don't pad with unnecessary nodes

Guidelines:
1. **Hierarchical Structure**:
   - Level 0: Main concept/topic (1 node)
   - Level 1: Major subtopics ({max(1, node_config['min'] // 4)}-{node_config['max'] // 4} nodes)
   - Level 2: Key concepts under each subtopic
   - Level 3: Important details (only if levels >= 4)

2. **Node Types**:
   - concept: Main central idea (level 0)
   - topic: Major subject areas (level 1)
   - subtopic: Specific concepts (level 2)
   - detail: Specific facts, formulas, or examples (level 3)

3. **Edge Types**:
   - child: Hierarchical parent-child relationship
   - related: Concepts that are related but not hierarchical
   - prerequisite: Concept A must be understood before concept B
   - example: Concept illustrates or exemplifies another

4. **Constraints**:
   - Total nodes: {node_config['min']}-{node_config['max']} (scale to content size)
   - Maximum depth: {node_config['levels']} levels (0 to {node_config['levels'] - 1})
   - Each node needs a concise label (2-6 words)
   - Node descriptions are optional but helpful for detail nodes
   - Create edges that show meaningful relationships
   - Don't create unnecessary nodes just to hit the max count

Output format: JSON object with this exact structure:
{{
  "title": "Brief title for the mind map",
  "description": "One sentence describing the scope",
  "nodes": [
    {{
      "label": "Short node label",
      "description": "Optional detailed description",
      "nodeType": "concept|topic|subtopic|detail",
      "level": 0-{node_config['levels'] - 1}
    }}
  ],
  "edges": [
    {{
      "sourceNodeIndex": 0,
      "targetNodeIndex": 1,
      "label": "Optional relationship label",
      "edgeType": "child|related|prerequisite|example"
    }}
  ]
}}

IMPORTANT: Output ONLY valid JSON. No markdown code blocks, no explanations, just the JSON object."""

            user_prompt = f"""Create an interactive concept map for the following educational content.

Scope: {scope}

Content:
{pdf_text}

Generate a hierarchical mind map with {node_config['min']}-{node_config['max']} nodes that captures the key concepts and their relationships. Scale the complexity to match the content scope - use fewer nodes for focused topics, more for broad coverage."""

            # Call Claude API (non-streaming to get proper JSON)
            chat_model = os.getenv("CHAT_MODEL", "claude-sonnet-4-5")

            message = client.messages.create(
                model=chat_model,
                max_tokens=4096,
                system=system_prompt,
                messages=[{"role": "user", "content": user_prompt}]
            )

            # Extract JSON from response
            response_text = message.content[0].text.strip()

            # Remove markdown code blocks if present
            if response_text.startswith("```json"):
                response_text = response_text[7:]
            if response_text.startswith("```"):
                response_text = response_text[3:]
            if response_text.endswith("```"):
                response_text = response_text[:-3]
            response_text = response_text.strip()

            # Parse JSON
            mind_map_data = json.loads(response_text)

            # Validate structure
            if 'nodes' not in mind_map_data or 'edges' not in mind_map_data:
                raise ValueError("Invalid mind map structure: missing nodes or edges")

            logger.info(f"Generated mind map with {len(mind_map_data['nodes'])} nodes and {len(mind_map_data['edges'])} edges")

            # Send final response
            final_response = {
                "type": "done",
                "content": mind_map_data
            }
            yield f"data: {json.dumps(final_response)}\n\n"

        except json.JSONDecodeError as e:
            logger.error(f"JSON decode error in mindmap generation: {e}", exc_info=True)
            error_response = {
                "type": "error",
                "content": f"Failed to parse mind map JSON: {str(e)}"
            }
            yield f"data: {json.dumps(error_response)}\n\n"
        except Exception as e:
            logger.error(f"Error in mindmap streaming endpoint: {e}", exc_info=True)
            error_response = {
                "type": "error",
                "content": f"Error: {str(e)}"
            }
            yield f"data: {json.dumps(error_response)}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.post("/chat/generate-title")
async def generate_chat_title(request: dict):
    """
    Generate a concise chat title from conversation messages using Claude AI

    Args:
        request: dict with 'messages' array containing the first few messages

    Returns:
        JSON with generated title
    """
    try:
        messages = request.get('messages', [])
        if not messages:
            raise HTTPException(
                status_code=400, detail="Messages are required")

        # Get Claude API key from environment
        claude_api_key = os.getenv("CLAUDE_API_KEY")
        if not claude_api_key:
            raise HTTPException(
                status_code=500, detail="CLAUDE_API_KEY not configured")

        # Initialize Anthropic client
        client = Anthropic(api_key=claude_api_key)

        # Build conversation context from messages (limit to first 2-3 exchanges)
        conversation_context = ""
        for msg in messages[:6]:  # Max 3 exchanges (user + assistant pairs)
            role_label = "User" if msg.get('role') == 'user' else "Assistant"
            # Limit each message to 500 chars
            content = msg.get('content', '')[:500]
            conversation_context += f"{role_label}: {content}\n\n"

        # System prompt for title generation
        system_prompt = """You are an expert at creating concise, descriptive titles for conversations.

Your task: Generate a short, clear title (3-8 words) that captures the main topic or question of the conversation.

Guidelines:
1. Keep it brief (3-8 words maximum)
2. Use title case
3. Focus on the core topic or question
4. Be specific but concise
5. No quotation marks or punctuation at the end
6. Make it immediately understandable

Examples:
- "Understanding Brownian Motion"
- "Solving Quadratic Equations"
- "Python List Comprehensions"
- "Derivative of Exponential Functions"
- "Explaining Neural Networks"

Output: Just the title text, nothing else."""

        user_prompt = f"""Generate a concise title for this conversation:

{conversation_context}

Return only the title text (3-8 words), nothing else."""

        # Call Claude API with a smaller, faster model
        response = client.messages.create(
            model="claude-3-5-haiku-20241022",  # Use Haiku for fast title generation
            max_tokens=50,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}]
        )

        # Extract and clean title
        title = response.content[0].text.strip()

        # Remove any quotation marks that might have been added
        title = title.strip('"').strip("'")

        # Limit to reasonable length just in case
        if len(title) > 100:
            title = title[:100]

        logger.info(f"Generated chat title: {title}")
        return {"title": title}

    except Exception as e:
        logger.error(f"Error generating chat title: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    import os

    # Get port from environment or default to 8001
    port = int(os.getenv("PORT", 8001))

    logger.info(f"Starting Manim Worker on port {port}")
    uvicorn.run(
        "main:app",  # Use string import path instead of app object
        host="0.0.0.0",
        port=port,
        ws="auto",  # Auto-detect WebSocket implementation (more compatible)
        log_level="info",
        access_log=True  # Enable access logging to see all requests
    )
