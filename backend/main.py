from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from models import HealthResponse, JobRequest, JobResponse, ChatRequest, ChatResponse, ChatMessageResponse, AnimationSuggestion
from manim_worker.manim_service import manim_service
import logging
import os
import re
import json
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

app = FastAPI(
    title="Mimir Manim Worker",
    description="Job-based animation rendering service using Manim",
    version="0.2.0"
)

# CORS middleware to allow requests from frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://localhost:3003"],  # Frontend URLs
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Health check endpoint
    Returns the service status
    """
    return HealthResponse(status="ok", version="0.2.0")

@app.post("/jobs", response_model=JobResponse)
async def create_job(request: JobRequest):
    """
    Create a new animation rendering job
    
    Args:
        request: Job request with description and topic
    
    Returns:
        JobResponse with job_id and initial status
    
    Example:
        POST /jobs
        {
            "description": "Visualize Brownian motion",
            "topic": "math"
        }
    """
    try:
        job_id = manim_service.create_job(
            description=request.description,
            topic=request.topic
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
    job_status = manim_service.get_job_status(job_id)
    
    if job_status.get("status") == "not_found":
        raise HTTPException(status_code=404, detail="Job not found")
    
    return JobResponse(
        job_id=job_id,
        status=job_status["status"],
        video_url=job_status.get("video_url"),
        error=job_status.get("error"),
    )

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
            
            # System prompt for Claude
            system_prompt = """You are an AI tutor for Mimir, an educational platform. Your role is to:

1. Provide clear, engaging explanations of educational concepts
2. Break down complex topics into understandable parts
3. Use analogies and examples when helpful

When explaining concepts that would benefit from visualization (mathematical functions, physics simulations, data structures, geometric concepts), append a special marker at the END of your response:

ANIMATION_SUGGESTION: {"description": "brief description of what to animate", "topic": "math"}

Only suggest animations for truly visual concepts like:
- Mathematical functions, graphs, transformations (Brownian motion, random walks, matrix transformations)
- Physics simulations (waves, collisions, motion)
- Geometric visualizations

Do NOT suggest animations for abstract discussions, definitions, or text-based explanations.

Example response with animation:
"Brownian motion describes the random movement of particles suspended in a fluid. Imagine a tiny pollen grain in water, constantly being bumped by water molecules from all directions. This creates an erratic, zigzag path that never repeats.

ANIMATION_SUGGESTION: {"description": "Brownian motion particle", "topic": "math"}"
"""
            
            # Convert messages to Anthropic format
            anthropic_messages = [
                {"role": msg.role, "content": msg.content}
                for msg in request.messages
            ]
            
            # Stream from Claude API
            full_content = ""
            with client.messages.stream(
                model="claude-3-5-haiku-20241022",
                max_tokens=1024,
                system=system_prompt,
                messages=anthropic_messages
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
            animation_match = re.search(r'ANIMATION_SUGGESTION:\s*(\{[^}]+\})', full_content)
            
            if animation_match:
                try:
                    animation_data = json.loads(animation_match.group(1))
                    suggested_animation = AnimationSuggestion(**animation_data)
                except Exception as e:
                    logger.error(f"Failed to parse animation suggestion: {e}")
            
            # Remove the ANIMATION_SUGGESTION marker from the displayed message
            clean_message = re.sub(r'\n*ANIMATION_SUGGESTION:\s*\{[^}]+\}\s*', '', full_content).strip()
            
            # Send final message with animation suggestion
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

When explaining concepts that would benefit from visualization (mathematical functions, physics simulations, data structures, geometric concepts), append a special marker at the END of your response:

ANIMATION_SUGGESTION: {"description": "brief description of what to animate", "topic": "math"}

Only suggest animations for truly visual concepts like:
- Mathematical functions, graphs, transformations (Brownian motion, random walks, matrix transformations)
- Physics simulations (waves, collisions, motion)
- Geometric visualizations

Do NOT suggest animations for abstract discussions, definitions, or text-based explanations.

Example response with animation:
"Brownian motion describes the random movement of particles suspended in a fluid. Imagine a tiny pollen grain in water, constantly being bumped by water molecules from all directions. This creates an erratic, zigzag path that never repeats.

ANIMATION_SUGGESTION: {"description": "Brownian motion particle", "topic": "math"}"
"""
        
        # Convert messages to Anthropic format
        anthropic_messages = [
            {"role": msg.role, "content": msg.content}
            for msg in request.messages
        ]
        
        # Call Claude API
        response = client.messages.create(
            model="claude-3-5-haiku-20241022",
            max_tokens=1024,
            system=system_prompt,
            messages=anthropic_messages
        )
        
        # Extract assistant message
        assistant_message = response.content[0].text
        
        # Parse animation suggestion from response
        suggested_animation = None
        animation_match = re.search(r'ANIMATION_SUGGESTION:\s*(\{[^}]+\})', assistant_message)
        
        if animation_match:
            try:
                import json
                animation_data = json.loads(animation_match.group(1))
                suggested_animation = AnimationSuggestion(**animation_data)
            except Exception as e:
                logger.error(f"Failed to parse animation suggestion: {e}")
        
        # Remove the ANIMATION_SUGGESTION marker from the displayed message
        clean_message = re.sub(r'\n*ANIMATION_SUGGESTION:\s*\{[^}]+\}\s*', '', assistant_message).strip()
        
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
    uvicorn.run(app, host="0.0.0.0", port=port)

