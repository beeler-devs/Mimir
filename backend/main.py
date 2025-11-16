from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Request
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
from websocket_manager import websocket_manager

app = FastAPI(
    title="Mimir Manim Worker",
    description="Job-based animation rendering service using Manim",
    version="0.2.0"
)

# CORS middleware to allow requests from frontend
# Note: CORSMiddleware in FastAPI also handles WebSocket connections
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://localhost:3003", "http://localhost:3002"],  # Frontend URLs
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
                folder_names = [f.name for f in request.workspace_context.folders]
                context_parts.append(f"User is working in folder(s): {', '.join(folder_names)}")
            
            # Add instance information
            if request.workspace_context.instances:
                context_parts.append("\nCurrent workspace context includes:")
                # First instance is typically the active one
                for idx, inst in enumerate(request.workspace_context.instances):
                    is_active = idx == 0  # First instance is the active one
                    active_marker = " (CURRENTLY OPEN)" if is_active else ""
                    context_parts.append(f"\n- {inst.title} ({inst.type}){active_marker}:")
                    
                    if inst.type == "text" and inst.content:
                        context_parts.append(f"  Content: {inst.content[:500]}{'...' if len(inst.content) > 500 else ''}")
                    elif inst.type == "code" and inst.code:
                        context_parts.append(f"  Language: {inst.language}")
                        context_parts.append(f"  Code: {inst.code[:500]}{'...' if len(inst.code) > 500 else ''}")
                    elif inst.type == "annotate":
                        if inst.id in request.workspace_context.annotationImages:
                            context_parts.append(f"  [Annotation canvas image included]")
            
            if context_parts:
                student_context = "\n".join(context_parts)
        
        job_id = manim_service.create_job(
            description=request.description,
            topic=request.topic,
            student_context=student_context
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
    
    logger.info(f"Returning response: status={response.status}, video_url={response.video_url}")
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
        logger.info(f"[WebSocket] Registered in manager for job {job_id} (total connections: {len(websocket_manager.active_connections[job_id])})")
        
        # Send initial connection confirmation
        await websocket.send_json({
            "type": "connected",
            "job_id": job_id,
            "message": "WebSocket connected successfully"
        })
        logger.info(f"[WebSocket] Sent connection confirmation for job {job_id}")
        
        # Keep connection alive - wait for disconnect or messages
        # Use a simple loop that waits for messages or disconnect
        while True:
            try:
                # Wait for a message with a timeout
                # This keeps the connection alive and allows us to detect disconnects
                message = await asyncio.wait_for(websocket.receive(), timeout=30.0)
                
                if message.get("type") == "websocket.disconnect":
                    logger.info(f"[WebSocket] Client disconnected for job {job_id}")
                    break
                elif message.get("type") == "websocket.receive":
                    # Handle text messages if client sends any (optional)
                    if "text" in message:
                        data = message["text"]
                        logger.debug(f"[WebSocket] Received message from client for job {job_id}: {data}")
            except asyncio.TimeoutError:
                # No message received, but connection is still alive
                # Send a ping to keep connection alive and verify it's still open
                try:
                    await websocket.send_json({"type": "ping", "job_id": job_id})
                    logger.debug(f"[WebSocket] Sent ping to keep connection alive for job {job_id}")
                except Exception as ping_error:
                    # Connection is closed
                    logger.info(f"[WebSocket] Connection closed while sending ping for job {job_id}: {ping_error}")
                    break
            except WebSocketDisconnect:
                logger.info(f"[WebSocket] Disconnected for job {job_id}")
                break
            except Exception as receive_error:
                logger.warning(f"[WebSocket] Error receiving message for job {job_id}: {receive_error}")
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

@app.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    """
    Streaming chat endpoint with Claude AI integration
    Streams responses as they are generated using Server-Sent Events
    
    Args:
        request: Chat request with messages and branch path
    
    Returns:
        StreamingResponse with SSE format
    """
    def generate():
        try:
            # Get Claude API key from environment
            claude_api_key = os.getenv("CLAUDE_API_KEY")
            
            if not claude_api_key:
                logger.warning("CLAUDE_API_KEY not set, using fallback response")
                # Fallback to stub response if no API key
                last_message = request.messages[-1].content
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
            if request.workspaceContext:
                context_parts = []
                
                # Add folder information
                if request.workspaceContext.folders:
                    folder_names = [f.name for f in request.workspaceContext.folders]
                    context_parts.append(f"User is working in folder(s): {', '.join(folder_names)}")
                
                # Add instance information
                if request.workspaceContext.instances:
                    context_parts.append("\nCurrent workspace context includes:")
                    # First instance is typically the active one
                    for idx, inst in enumerate(request.workspaceContext.instances):
                        is_active = idx == 0  # First instance is the active one
                        active_marker = " (CURRENTLY OPEN)" if is_active else ""
                        context_parts.append(f"\n- {inst.title} ({inst.type}){active_marker}:")
                        
                        if inst.type == "text" and inst.content:
                            context_parts.append(f"  Content: {inst.content[:500]}{'...' if len(inst.content) > 500 else ''}")
                        elif inst.type == "code" and inst.code:
                            context_parts.append(f"  Language: {inst.language}")
                            context_parts.append(f"  Code: {inst.code[:500]}{'...' if len(inst.code) > 500 else ''}")
                        elif inst.type == "annotate":
                            if inst.id in request.workspaceContext.annotationImages:
                                context_parts.append(f"  [Annotation canvas image included below]")
                
                if context_parts:
                    context_description = "\n".join(context_parts) + "\n"
                    
                    # Log warning if context is very large
                    context_size = len(context_description)
                    if context_size > 50000:  # ~50KB
                        logger.warning(f"Large workspace context detected: {context_size} characters, {len(request.workspaceContext.instances)} instances")
            
            # System prompt for Claude
            system_prompt = f"""You are an AI tutor for Mimir, an educational platform. Your role is to:

1. Provide clear, engaging explanations of educational concepts
2. Break down complex topics into understandable parts
3. Use analogies and examples when helpful
4. Reference the user's workspace context when relevant to help them understand their work

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

{context_description if context_description else ""}

=== ANIMATION SUGGESTIONS ===

CRITICAL INSTRUCTION: If the user's message contains ANY of these keywords or phrases, you MUST include an animation suggestion:
- "visualize", "visualization", "show me", "show", "animate", "animation", "draw", "illustrate", "demonstrate", "create an animation", "make an animation", "generate an animation"
- Any request to "see" something visually
- Any request for a "graph", "plot", "diagram", or visual representation

When the user explicitly requests a visualization (using any of the above keywords), you MUST append this exact marker at the END of your response:

ANIMATION_SUGGESTION: {{"description": "brief description of what to animate", "topic": "math"}}

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

ANIMATION_SUGGESTION: {{"description": "Brownian motion particle", "topic": "math"}}"
"""
            
            # Convert messages to Anthropic format, including images if present
            anthropic_messages = []
            
            # Find the last user message index to attach images
            last_user_msg_idx = -1
            for i in range(len(request.messages) - 1, -1, -1):
                if request.messages[i].role == "user":
                    last_user_msg_idx = i
                    break
            
            for idx, msg in enumerate(request.messages):
                # Skip messages with empty content (except final assistant message)
                is_final_assistant = (idx == len(request.messages) - 1 and msg.role == "assistant")
                
                # Check if content is empty - handle None, empty string, and whitespace-only strings
                content = msg.content if msg.content is not None else ""
                if isinstance(content, str):
                    content = content.strip()
                content_empty = not content
                
                # Skip empty messages unless it's the final assistant message
                if content_empty and not is_final_assistant:
                    logger.warning(f"Skipping empty message at index {idx} (role: {msg.role}, content type: {type(msg.content)})")
                    continue
                
                # Attach images to the last user message (the current one being sent)
                if (idx == last_user_msg_idx and
                    request.workspaceContext and 
                    request.workspaceContext.annotationImages):
                    
                    # Only add text part if content is not empty
                    content_parts = []
                    if content and content.strip():
                        content_parts.append({"type": "text", "text": content})
                    
                    # Add annotation images with descriptions
                    for inst_id, image_base64 in request.workspaceContext.annotationImages.items():
                        # Find the instance for description
                        inst = next((i for i in request.workspaceContext.instances if i.id == inst_id), None)
                        if inst:
                            # Add text description before image
                            content_parts.append({
                                "type": "text",
                                "text": f"\n[Annotation canvas from '{inst.title}' instance:]"
                            })
                            
                            # Remove data:image/png;base64, prefix if present
                            image_data = image_base64.split(',')[1] if ',' in image_base64 else image_base64
                            
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
                        part.get("type") == "text" and part.get("text", "").strip() 
                        or part.get("type") == "image"
                        for part in msg_content
                    )
                else:
                    has_content = msg_content and (isinstance(msg_content, str) and msg_content.strip())
                
                # Skip empty messages unless it's the final assistant message
                if not has_content and not (is_final and is_assistant):
                    logger.warning(f"Filtering out empty message at index {idx} after validation (role: {msg.get('role')})")
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
            logger.info(f"Looking for ANIMATION_SUGGESTION marker in response (length: {len(full_content)} chars)")
            if marker_pos != -1:
                logger.info(f"Found ANIMATION_SUGGESTION marker at position {marker_pos}")
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
                            suggested_animation = AnimationSuggestion(**animation_data)
                            logger.info(f"Successfully parsed animation suggestion: {suggested_animation}")
                        except Exception as e:
                            logger.error(f"Failed to parse animation suggestion: {e}")
                            logger.error(f"JSON string that failed: {full_content[json_start:json_end]}")
            else:
                # Check if user asked for visualization but no marker was found
                last_user_msg = None
                last_user_msg_original = None
                for msg in reversed(request.messages):
                    if msg.role == "user":
                        last_user_msg = msg.content.lower() if msg.content else ""
                        last_user_msg_original = msg.content if msg.content else ""
                        break
                
                visualization_keywords = ["visualize", "visualization", "show me", "show", "animate", "animation", "draw", "illustrate", "demonstrate", "graph", "plot", "diagram"]
                if last_user_msg and any(keyword in last_user_msg for keyword in visualization_keywords):
                    logger.warning(f"User asked for visualization but Claude did not include ANIMATION_SUGGESTION marker. Creating fallback suggestion. User message: {last_user_msg[:100]}")
                    
                    # Create a fallback animation suggestion based on the user's request
                    # Extract the concept from the user's message
                    description = last_user_msg_original or "mathematical concept"
                    # Remove common visualization request phrases to get the core concept
                    for keyword in visualization_keywords:
                        # Use case-insensitive replacement
                        description = re.sub(re.escape(keyword), "", description, flags=re.IGNORECASE).strip()
                    # Clean up common phrases
                    description = re.sub(r"\b(how to|how|the|a|an)\b", "", description, flags=re.IGNORECASE).strip()
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
                    logger.info(f"Created fallback animation suggestion: {suggested_animation}")
            
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
                        clean_message = (full_content[:marker_pos] + full_content[json_end:]).strip()
                    else:
                        clean_message = full_content[:marker_pos].strip()
                else:
                    clean_message = full_content[:marker_pos].strip()
            else:
                clean_message = full_content.strip()
            
            # Send final message with animation suggestion
            logger.info(f"Sending final response with suggestedAnimation: {suggested_animation is not None}")
            if suggested_animation:
                logger.info(f"Animation suggestion details: {suggested_animation.model_dump()}")
            final_response = {
                "type": "done",
                "content": clean_message,
                "suggestedAnimation": suggested_animation.model_dump() if suggested_animation else None,
                "nodeId": f"node-{int(__import__('time').time() * 1000)}"
            }
            yield f"data: {json.dumps(final_response)}\n\n"
            
        except Exception as e:
            logger.error(f"Error in streaming chat endpoint: {e}", exc_info=True)
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
            is_final_assistant = (idx == len(request.messages) - 1 and msg.role == "assistant")
            
            # Check if content is empty - handle None, empty string, and whitespace-only strings
            content = msg.content if msg.content is not None else ""
            if isinstance(content, str):
                content = content.strip()
            content_empty = not content
            
            # Skip empty messages unless it's the final assistant message
            if content_empty and not is_final_assistant:
                logger.warning(f"Skipping empty message at index {idx} (role: {msg.role}, content type: {type(msg.content)})")
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
            has_content = msg_content and (isinstance(msg_content, str) and msg_content.strip())
            
            # Skip empty messages unless it's the final assistant message
            if not has_content and not (is_final and is_assistant):
                logger.warning(f"Filtering out empty message at index {idx} after validation (role: {msg.get('role')})")
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
        logger.info(f"Looking for ANIMATION_SUGGESTION marker in response (length: {len(assistant_message)} chars)")
        if marker_pos != -1:
            logger.info(f"Found ANIMATION_SUGGESTION marker at position {marker_pos}")
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
                        suggested_animation = AnimationSuggestion(**animation_data)
                        logger.info(f"Successfully parsed animation suggestion: {suggested_animation}")
                    except Exception as e:
                        logger.error(f"Failed to parse animation suggestion: {e}")
                        logger.error(f"JSON string that failed: {assistant_message[json_start:json_end]}")
        
        # Fallback: If user asked for visualization but Claude didn't provide marker, create one
        if suggested_animation is None:
            last_user_msg = None
            last_user_msg_original = None
            for msg in reversed(request.messages):
                if msg.role == "user":
                    last_user_msg = msg.content.lower() if msg.content else ""
                    last_user_msg_original = msg.content if msg.content else ""
                    break
            
            visualization_keywords = ["visualize", "visualization", "show me", "show", "animate", "animation", "draw", "illustrate", "demonstrate", "graph", "plot", "diagram"]
            if last_user_msg and any(keyword in last_user_msg for keyword in visualization_keywords):
                logger.warning(f"User asked for visualization but Claude did not include ANIMATION_SUGGESTION marker. Creating fallback suggestion. User message: {last_user_msg[:100]}")
                
                # Create a fallback animation suggestion based on the user's request
                description = last_user_msg_original or "mathematical concept"
                # Remove common visualization request phrases to get the core concept
                for keyword in visualization_keywords:
                    # Use case-insensitive replacement
                    description = re.sub(re.escape(keyword), "", description, flags=re.IGNORECASE).strip()
                # Clean up common phrases
                description = re.sub(r"\b(how to|how|the|a|an)\b", "", description, flags=re.IGNORECASE).strip()
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
                logger.info(f"Created fallback animation suggestion: {suggested_animation}")
        
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
                    clean_message = (assistant_message[:marker_pos] + assistant_message[json_end:]).strip()
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

