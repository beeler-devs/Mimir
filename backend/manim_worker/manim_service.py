"""
Manim rendering service with job queue and Supabase Storage integration
"""

from typing import Dict, Any
import uuid
import logging
import tempfile
import os
import importlib.util
from pathlib import Path
import asyncio
from concurrent.futures import ThreadPoolExecutor
from supabase import create_client, Client
from manim import config, tempconfig
from models import JobStatus
from manim_worker.scenes import select_scene  # Keep for future use
from manim_worker.enhanced_codegen import generate_and_validate_manim_scene
from dotenv import load_dotenv
import base64
import time
from PIL import Image
import io

# Import hybrid caching and template systems
from manim_worker.semantic_cache import semantic_cache
from manim_worker.template_classifier import template_classifier

# Load environment variables from .env file
# Load from backend directory (parent of manim_worker)
env_path = Path(__file__).parent.parent / '.env'

# Debug: Show what path we're trying to load
import sys
print(f"🔍 Looking for .env at: {env_path}", file=sys.stderr)
print(f"🔍 File exists: {env_path.exists()}", file=sys.stderr)

result = load_dotenv(dotenv_path=env_path, verbose=True, override=True)
print(f"🔍 load_dotenv returned: {result}", file=sys.stderr)

# Debug: Check if env vars are loaded
if os.getenv("SUPABASE_URL"):
    print(f"✅ Environment loaded: SUPABASE_URL={os.getenv('SUPABASE_URL')}", file=sys.stderr)
else:
    print(f"❌ SUPABASE_URL not found in environment", file=sys.stderr)
    print(f"❌ .env file contents:", file=sys.stderr)
    if env_path.exists():
        with open(env_path, 'r') as f:
            print(f.read(), file=sys.stderr)

logger = logging.getLogger(__name__)

# Import websocket manager (lazy import to avoid circular dependencies)
def get_websocket_manager():
    """Get the websocket manager instance"""
    try:
        from websocket_manager import websocket_manager
        return websocket_manager
    except ImportError:
        return None

class ManimService:
    def __init__(self):
        self.jobs: Dict[str, Dict[str, Any]] = {}
        self.output_dir = Path(tempfile.gettempdir()) / "manim_jobs"
        self.output_dir.mkdir(exist_ok=True)

        # Thread pool for rendering (optimized: increased from 2 to 4 workers)
        # This allows parallel processing of multiple animation requests
        max_workers = int(os.getenv("MANIM_MAX_WORKERS", "4"))
        self.executor = ThreadPoolExecutor(max_workers=max_workers)
        logger.info(f"Initialized ThreadPoolExecutor with {max_workers} workers")

        # Simple in-memory cache for similar animations (concept -> video_url)
        # This helps avoid re-rendering identical or very similar concepts
        self.animation_cache: Dict[str, str] = {}
        self.cache_enabled = os.getenv("MANIM_CACHE_ENABLED", "true").lower() == "true"
        logger.info(f"Animation caching: {'enabled' if self.cache_enabled else 'disabled'}")
        
        # Supabase client
        # Check for SUPABASE_URL first, then fall back to NEXT_PUBLIC_SUPABASE_URL
        # (NEXT_PUBLIC_ prefix is for frontend, but backend can use it too)
        supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        self.bucket_name = os.getenv("SUPABASE_BUCKET_NAME", "animations")
        
        logger.info("=" * 70)
        logger.info("SUPABASE INITIALIZATION DEBUG")
        logger.info("=" * 70)
        
        # Check both environment variable names
        supabase_url_direct = os.getenv("SUPABASE_URL")
        supabase_url_public = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        
        logger.info(f"SUPABASE_URL (direct) present: {bool(supabase_url_direct)}")
        logger.info(f"NEXT_PUBLIC_SUPABASE_URL present: {bool(supabase_url_public)}")
        
        if supabase_url:
            logger.info(f"Using Supabase URL: {supabase_url[:50]}... (truncated)")
            if supabase_url_direct:
                logger.info("  Source: SUPABASE_URL")
            elif supabase_url_public:
                logger.info("  Source: NEXT_PUBLIC_SUPABASE_URL (fallback)")
        else:
            logger.error("✗ SUPABASE_URL environment variable is NOT SET")
            logger.error("   Checked: SUPABASE_URL and NEXT_PUBLIC_SUPABASE_URL")
            logger.error("   Please add SUPABASE_URL to backend/.env file")
        
        logger.info(f"SUPABASE_SERVICE_ROLE_KEY present: {bool(supabase_key)}")
        if supabase_key:
            logger.info(f"SUPABASE_SERVICE_ROLE_KEY length: {len(supabase_key)} characters")
        else:
            logger.warning("SUPABASE_SERVICE_ROLE_KEY environment variable is NOT SET")
        
        logger.info(f"SUPABASE_BUCKET_NAME: {self.bucket_name}")
        logger.info("=" * 70)
        
        if supabase_url and supabase_key:
            try:
                logger.info("Attempting to create Supabase client...")
                self.supabase: Client = create_client(supabase_url, supabase_key)
                logger.info("✓ Supabase client initialized successfully")
                
                # Test bucket access
                try:
                    logger.info(f"Testing access to bucket '{self.bucket_name}'...")
                    buckets = self.supabase.storage.list_buckets()
                    bucket_names = [b.name for b in buckets]
                    logger.info(f"Available buckets: {bucket_names}")
                    
                    if self.bucket_name not in bucket_names:
                        logger.error(f"⚠️  Bucket '{self.bucket_name}' NOT FOUND in available buckets!")
                        logger.error(f"   Available buckets: {bucket_names}")
                        logger.error(f"   Please create the bucket '{self.bucket_name}' in Supabase dashboard")
                    else:
                        logger.info(f"✓ Bucket '{self.bucket_name}' found and accessible")
                except Exception as bucket_test_error:
                    logger.error(f"Failed to test bucket access: {bucket_test_error}", exc_info=True)
                    
            except Exception as e:
                logger.error(f"✗ Failed to initialize Supabase client: {e}", exc_info=True)
                self.supabase = None
        else:
            logger.warning("⚠️  Supabase credentials not provided, storage upload disabled")
            logger.warning("   Videos will use local paths instead of Supabase URLs")
            self.supabase = None
    
    def _get_cache_key(self, description: str, student_context: str | None = None) -> str:
        """
        Generate a cache key for an animation request

        Args:
            description: Animation description
            student_context: Optional student context

        Returns:
            Cache key string
        """
        # Normalize the description for caching (lowercase, strip whitespace)
        normalized = description.lower().strip()
        if student_context:
            normalized += "|" + student_context.lower().strip()
        return normalized

    def create_job(self, description: str, topic: str, student_context: str | None = None) -> str:
        """
        Create a new animation job using hybrid pipeline:
        1. Exact cache (instant)
        2. Semantic cache (fast similarity matching)
        3. Template matching (fast parameter extraction + validation)
        4. Full generation (slow but flexible)

        Args:
            description: Animation description
            topic: Topic category (math, cs, etc.)
            student_context: Optional context about the student's current work

        Returns:
            job_id: Unique identifier for this job
        """
        job_id = str(uuid.uuid4())

        logger.info("=" * 70)
        logger.info(f"JOB {job_id}: Hybrid pipeline starting")
        logger.info(f"Description: {description[:60]}...")
        logger.info("=" * 70)

        # ===== LAYER 1: Exact Cache =====
        cached_video_url = None
        if self.cache_enabled:
            cache_key = self._get_cache_key(description, student_context)
            cached_video_url = self.animation_cache.get(cache_key)
            if cached_video_url:
                logger.info(f"✓ LAYER 1: Exact cache HIT")
                logger.info(f"  Returning cached video instantly")
                logger.info("=" * 70)
                self.jobs[job_id] = {
                    "status": JobStatus.DONE,
                    "description": description,
                    "topic": topic,
                    "student_context": student_context,
                    "video_url": cached_video_url,
                    "error": None,
                    "cache_layer": "exact"
                }
                return job_id
            else:
                logger.info(f"✗ LAYER 1: Exact cache MISS")

        # ===== LAYER 2: Semantic Cache =====
        if semantic_cache.enabled:
            semantic_match = semantic_cache.find_similar(description, student_context)
            if semantic_match:
                cached_desc, similarity, video_url = semantic_match
                logger.info(f"✓ LAYER 2: Semantic cache HIT (similarity: {similarity:.3f})")
                logger.info(f"  Returning semantically similar video")
                logger.info("=" * 70)
                self.jobs[job_id] = {
                    "status": JobStatus.DONE,
                    "description": description,
                    "topic": topic,
                    "student_context": student_context,
                    "video_url": video_url,
                    "error": None,
                    "cache_layer": "semantic",
                    "semantic_similarity": similarity
                }
                return job_id
            else:
                logger.info(f"✗ LAYER 2: Semantic cache MISS")
        else:
            logger.info(f"⊘ LAYER 2: Semantic cache disabled")

        # ===== LAYER 3: Template Matching =====
        if template_classifier.enabled:
            template_match = template_classifier.classify(description, student_context)
            if template_match and template_match.confidence >= template_classifier.confidence_threshold:
                logger.info(f"✓ LAYER 3: Template match found")
                logger.info(f"  Template: {template_match.template.template_id}")
                logger.info(f"  Confidence: {template_match.confidence:.3f}")
                logger.info(f"  Using template-based generation")
                logger.info("=" * 70)

                # Create job and start template-based rendering
                self.jobs[job_id] = {
                    "status": JobStatus.PENDING,
                    "description": description,
                    "topic": topic,
                    "student_context": student_context,
                    "video_url": None,
                    "error": None,
                    "generation_mode": "template",
                    "template_id": template_match.template.template_id,
                    "template_confidence": template_match.confidence
                }

                # Start template-based rendering in background
                self.executor.submit(
                    self._render_job_from_template,
                    job_id, description, topic, student_context,
                    template_match
                )
                return job_id
            else:
                if template_match:
                    logger.info(f"✗ LAYER 3: Template match too low confidence ({template_match.confidence:.3f})")
                else:
                    logger.info(f"✗ LAYER 3: No template match")
        else:
            logger.info(f"⊘ LAYER 3: Template matching disabled")

        # ===== LAYER 4: Full Generation (Fallback) =====
        logger.info(f"→ LAYER 4: Using full LLM generation (fallback)")
        logger.info("=" * 70)

        self.jobs[job_id] = {
            "status": JobStatus.PENDING,
            "description": description,
            "topic": topic,
            "student_context": student_context,
            "video_url": None,
            "error": None,
            "generation_mode": "full_llm"
        }

        # Start full rendering in background
        self.executor.submit(self._render_job, job_id, description, topic, student_context)

        logger.info(f"Created job {job_id}: {description}")
        return job_id
    
    def get_job_status(self, job_id: str) -> Dict[str, Any]:
        """
        Get the status of a render job
        
        Args:
            job_id: Job identifier
        
        Returns:
            Job status dictionary
        """
        if job_id not in self.jobs:
            return {"status": "not_found"}
        
        return self.jobs[job_id]
    
    async def _send_progress(self, job_id: str, phase: str, message: str, percentage: int):
        """Send progress update via WebSocket"""
        ws_manager = get_websocket_manager()
        if ws_manager and ws_manager.has_connections(job_id):
            await ws_manager.send_message(job_id, {
                "type": "progress",
                "job_id": job_id,
                "phase": phase,
                "message": message,
                "percentage": percentage
            })
    
    async def _send_frame(self, job_id: str, frame_number: int, frame_data: bytes):
        """Send a frame via WebSocket"""
        ws_manager = get_websocket_manager()
        if ws_manager and ws_manager.has_connections(job_id):
            # Encode frame as base64
            frame_base64 = base64.b64encode(frame_data).decode('utf-8')
            await ws_manager.send_message(job_id, {
                "type": "frame",
                "job_id": job_id,
                "frame_number": frame_number,
                "data": frame_base64,
                "timestamp": int(time.time() * 1000)
            })
    
    async def _extract_and_stream_frames(self, job_id: str, video_path: Path, loop: asyncio.AbstractEventLoop):
        """Extract frames from video and stream them via WebSocket"""
        logger.info("=" * 70)
        logger.info(f"FRAME EXTRACTION STARTING FOR JOB {job_id}")
        logger.info("=" * 70)
        logger.info(f"Video path: {video_path}")
        logger.info(f"Video exists: {video_path.exists()}")
        
        ws_manager = get_websocket_manager()
        logger.info(f"WebSocket manager: {ws_manager}")
        
        if not ws_manager:
            logger.warning("WebSocket manager not available, skipping frame extraction")
            return
            
        has_connections = ws_manager.has_connections(job_id)
        logger.info(f"WebSocket connections active for job {job_id}: {has_connections}")
        
        if not has_connections:
            logger.warning(f"No WebSocket connections for job {job_id}, skipping frame extraction")
            return
        
        try:
            import subprocess
            import cv2
            
            logger.info("OpenCV imported successfully")
            
            # Use OpenCV to extract frames
            cap = cv2.VideoCapture(str(video_path))
            if not cap.isOpened():
                logger.error(f"Failed to open video file: {video_path}")
                return
            
            frame_rate = cap.get(cv2.CAP_PROP_FPS)
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

            frame_number = 0
            # Optimize frame interval based on target streaming FPS
            # Default: stream at 30fps, but can be configured via env var
            target_stream_fps = int(os.getenv("MANIM_STREAM_FPS", "30"))
            frame_interval = max(1, int(frame_rate / target_stream_fps))
            
            logger.info(f"Video opened successfully:")
            logger.info(f"  Total frames: {total_frames}")
            logger.info(f"  Frame rate: {frame_rate} fps")
            logger.info(f"  Frame interval: {frame_interval} (streaming at ~30fps)")
            logger.info(f"Starting frame extraction and streaming...")
            
            while True:
                ret, frame = cap.read()
                if not ret:
                    break
                
                # Only send every Nth frame to maintain ~30 fps streaming
                if frame_number % frame_interval == 0:
                    # Encode frame as JPEG (smaller than PNG)
                    _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                    frame_data = buffer.tobytes()
                    
                    # Send frame via WebSocket
                    loop.run_until_complete(self._send_frame(job_id, frame_number, frame_data))
                    
                    # Log every 30th frame
                    if frame_number % 30 == 0:
                        logger.info(f"Sent frame {frame_number}/{total_frames} via WebSocket")
                    
                    # Update progress
                    progress = 80 + int((frame_number / total_frames) * 15)  # 80-95%
                    if frame_number % 10 == 0:  # Update every 10 frames
                        loop.run_until_complete(self._send_progress(job_id, "rendering", f"Streaming frame {frame_number}/{total_frames}", progress))
                
                frame_number += 1
            
            cap.release()
            
            # Send completion message
            loop.run_until_complete(ws_manager.send_message(job_id, {
                "type": "complete",
                "job_id": job_id,
                "total_frames": frame_number
            }))
            
            logger.info(f"Finished streaming {frame_number} frames for job {job_id}")
            
        except ImportError:
            # OpenCV not available, try using ffmpeg
            logger.warning("OpenCV not available, trying ffmpeg for frame extraction")
            loop.run_until_complete(self._extract_frames_ffmpeg(job_id, video_path, loop))
        except Exception as e:
            logger.error(f"Error extracting frames: {e}", exc_info=True)
    
    async def _extract_frames_ffmpeg(self, job_id: str, video_path: Path, loop: asyncio.AbstractEventLoop):
        """Extract frames using ffmpeg (fallback if OpenCV not available)"""
        try:
            import subprocess
            
            # Use ffmpeg to extract frames
            # This is a simplified version - in production, you'd want more robust frame extraction
            logger.warning("FFmpeg frame extraction not fully implemented, skipping frame streaming")
            # TODO: Implement ffmpeg-based frame extraction if needed
            
        except Exception as e:
            logger.error(f"Error in ffmpeg frame extraction: {e}", exc_info=True)
    
    def _render_job_from_template(
        self,
        job_id: str,
        description: str,
        topic: str,
        student_context: str | None,
        template_match
    ):
        """
        Render animation using a template

        Args:
            job_id: Job identifier
            description: Animation description
            topic: Topic category
            student_context: Optional student context
            template_match: TemplateMatch object with template and parameters
        """
        # Create async wrapper for progress updates
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        try:
            # Update status to running
            self.jobs[job_id]["status"] = JobStatus.RUNNING
            logger.info(f"Starting template-based render for job {job_id}")
            logger.info(f"Template: {template_match.template.template_id}")

            # Send initial progress
            loop.run_until_complete(self._send_progress(job_id, "template_rendering", "Using template...", 10))

            # Create job-specific directory
            job_dir = self.output_dir / job_id
            job_dir.mkdir(exist_ok=True)

            # Render template with parameters
            logger.info(f"Rendering template with parameters: {template_match.parameters}")
            code = template_match.template.render(template_match.parameters)

            # Write code to file
            scene_path = job_dir / "template_scene.py"
            with open(scene_path, 'w', encoding='utf-8') as f:
                f.write(code)

            logger.info(f"Template code written to {scene_path}")
            loop.run_until_complete(self._send_progress(job_id, "template_rendering", "Template code generated", 30))

            # Import and verify the scene
            spec = importlib.util.spec_from_file_location("template_scene", scene_path)
            if spec is None or spec.loader is None:
                raise ValueError(f"Failed to create module spec from {scene_path}")

            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)

            if not hasattr(module, 'GeneratedScene'):
                raise AttributeError("Template did not generate GeneratedScene class")

            scene_class = module.GeneratedScene
            logger.info(f"Successfully imported GeneratedScene from template")

            # Send progress: starting rendering
            loop.run_until_complete(self._send_progress(job_id, "rendering", "Rendering animation...", 50))

            # Configure Manim and render
            with tempconfig({
                "quality": "high_quality",
                "preview": False,
                "output_file": "out",
                "media_dir": str(job_dir),
                "video_dir": str(job_dir),
                "pixel_height": 1080,
                "pixel_width": 1920,
                "frame_rate": 30,
            }):
                scene = scene_class()
                scene.render()

            loop.run_until_complete(self._send_progress(job_id, "rendering", "Rendering complete", 80))

            # Find output video
            video_path = self._find_output_video(job_dir)

            if not video_path or not video_path.exists():
                raise FileNotFoundError(f"Output video not found in {job_dir}")

            logger.info(f"Template render complete: {video_path}")

            # Extract and stream frames
            loop.run_until_complete(self._extract_and_stream_frames(job_id, video_path, loop))

            # Upload to Supabase or use local path
            if self.supabase:
                video_url = self._upload_to_supabase(job_id, video_path)
                self.jobs[job_id]["video_url"] = video_url
            else:
                fallback_url = f"/local/{job_id}/out.mp4"
                self.jobs[job_id]["video_url"] = fallback_url

            # Update status
            self.jobs[job_id]["status"] = JobStatus.DONE

            # Cache the result in both caches
            if self.cache_enabled:
                cache_key = self._get_cache_key(description, student_context)
                self.animation_cache[cache_key] = self.jobs[job_id]["video_url"]
                logger.info(f"Cached template result (exact cache)")

            if semantic_cache.enabled:
                semantic_cache.add(description, self.jobs[job_id]["video_url"], student_context)
                logger.info(f"Cached template result (semantic cache)")

            # Send completion
            ws_manager = get_websocket_manager()
            if ws_manager and ws_manager.has_connections(job_id):
                loop.run_until_complete(ws_manager.send_message(job_id, {
                    "type": "complete",
                    "job_id": job_id,
                    "video_url": self.jobs[job_id].get("video_url"),
                }))

            logger.info(f"Template job {job_id} completed successfully")

        except Exception as e:
            logger.error(f"Error rendering template job {job_id}: {e}", exc_info=True)
            self.jobs[job_id]["status"] = JobStatus.ERROR
            self.jobs[job_id]["error"] = str(e)

            # Send error message
            ws_manager = get_websocket_manager()
            if ws_manager:
                loop.run_until_complete(ws_manager.send_message(job_id, {
                    "type": "error",
                    "job_id": job_id,
                    "error": str(e)
                }))
        finally:
            loop.close()

    def _render_job(self, job_id: str, description: str, topic: str, student_context: str | None = None):
        """
        Render a Manim animation job (runs in thread pool)
        
        Args:
            job_id: Job identifier
            description: Animation description
            topic: Topic category
            student_context: Optional context about the student's current work
        """
        # Create async wrapper for progress updates
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            # Update status to running
            self.jobs[job_id]["status"] = JobStatus.RUNNING
            logger.info(f"Starting render for job {job_id}")
            
            # Send initial progress
            loop.run_until_complete(self._send_progress(job_id, "code_generation", "Starting code generation...", 0))
            
            # Create job-specific directory
            job_dir = self.output_dir / job_id
            job_dir.mkdir(exist_ok=True)
            
            # Generate and validate Manim code using Claude
            logger.info(f"Generating Manim code for job {job_id}")
            
            # Create progress callback for code generation
            def progress_callback(phase: str, message: str, percentage: int):
                loop.run_until_complete(self._send_progress(job_id, phase, message, percentage))
            
            validated_code = generate_and_validate_manim_scene(
                description, 
                student_context,
                progress_callback=progress_callback
            )
            loop.run_until_complete(self._send_progress(job_id, "code_generation", "Code generation complete", 50))
            
            # Write validated code to file
            scene_path = job_dir / "generated_scene.py"
            with open(scene_path, 'w', encoding='utf-8') as f:
                f.write(validated_code)
            
            logger.info(f"Code validated and written to {scene_path}")
            
            # Verify the code contains GeneratedScene class before importing
            with open(scene_path, 'r', encoding='utf-8') as f:
                code_content = f.read()
                if 'class GeneratedScene' not in code_content:
                    raise ValueError(
                        f"Generated code does not contain 'class GeneratedScene'. "
                        f"Code preview: {code_content[:500]}..."
                    )
            
            # Dynamically import the GeneratedScene class
            try:
                spec = importlib.util.spec_from_file_location("generated_scene", scene_path)
                if spec is None or spec.loader is None:
                    raise ValueError(f"Failed to create module spec from {scene_path}")
                
                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)
                
                # Verify the class exists
                if not hasattr(module, 'GeneratedScene'):
                    # Log what's actually in the module
                    available_attrs = [attr for attr in dir(module) if not attr.startswith('_')]
                    raise AttributeError(
                        f"Module 'generated_scene' does not have 'GeneratedScene' attribute. "
                        f"Available attributes: {available_attrs}. "
                        f"Code preview: {code_content[:500]}..."
                    )
                
                scene_class = module.GeneratedScene
                logger.info(f"Successfully imported GeneratedScene class from {scene_path}")
                
            except Exception as e:
                logger.error(f"Failed to import GeneratedScene: {e}")
                logger.error(f"Generated code content:\n{code_content}")
                raise
            
            # NOTE: Keeping select_scene() code for future use, but currently using codegen path
            # Old code (commented for reference):
            # scene_class = select_scene(description, topic)
            
            # Send progress: starting rendering
            loop.run_until_complete(self._send_progress(job_id, "rendering", "Starting animation rendering...", 50))
            
            # Configure Manim with high quality settings
            with tempconfig({
                "quality": "high_quality",  # Changed from medium_quality to high_quality
                "preview": False,
                "output_file": "out",
                "media_dir": str(job_dir),
                "video_dir": str(job_dir),
                "pixel_height": 1080,  # Changed from 720 to 1080 (Full HD)
                "pixel_width": 1920,   # Changed from 1280 to 1920 (Full HD)
                "frame_rate": 30,
            }):
                # Render the scene
                scene = scene_class()
                scene.render()
            
            loop.run_until_complete(self._send_progress(job_id, "rendering", "Rendering complete, extracting frames...", 80))
            
            # Find the output video
            video_path = self._find_output_video(job_dir)
            
            if not video_path or not video_path.exists():
                raise FileNotFoundError(f"Output video not found in {job_dir}")
            
            logger.info(f"Render complete for job {job_id}: {video_path}")
            logger.info(f"Video file exists: {video_path.exists()}")
            logger.info(f"Video file size: {video_path.stat().st_size / (1024*1024):.2f} MB")
            
            # Extract and stream frames from video
            logger.info(f"About to extract frames from: {video_path}")
            logger.info(f"File exists: {video_path.exists()}")
            if video_path.exists():
                logger.info(f"File size: {video_path.stat().st_size / (1024*1024):.2f} MB")
            loop.run_until_complete(self._extract_and_stream_frames(job_id, video_path, loop))
            
            # Upload to Supabase Storage
            logger.info("=" * 70)
            logger.info(f"UPLOAD DECISION FOR JOB {job_id}")
            logger.info("=" * 70)
            logger.info(f"Supabase client available: {self.supabase is not None}")
            
            if self.supabase:
                logger.info("✓ Supabase client is available, attempting upload...")
                video_url = self._upload_to_supabase(job_id, video_path)
                logger.info(f"Upload result URL: {video_url}")
                self.jobs[job_id]["video_url"] = video_url
            else:
                logger.warning("⚠️  Supabase client is NOT available")
                logger.warning("   Using local path fallback (this will cause 404 errors in frontend)")
                # Fallback: use local path (for development)
                fallback_url = f"/local/{job_id}/out.mp4"
                logger.warning(f"   Fallback URL: {fallback_url}")
                self.jobs[job_id]["video_url"] = fallback_url
            logger.info("=" * 70)
            
            # Update status to done
            self.jobs[job_id]["status"] = JobStatus.DONE

            # Cache the successful result if caching is enabled
            if self.cache_enabled and self.jobs[job_id].get("video_url"):
                cache_key = self._get_cache_key(description, student_context)
                self.animation_cache[cache_key] = self.jobs[job_id]["video_url"]
                logger.info(f"Cached animation result (exact cache): {description[:50]}...")
                logger.info(f"Exact cache now contains {len(self.animation_cache)} entries")

            # Also add to semantic cache
            if semantic_cache.enabled and self.jobs[job_id].get("video_url"):
                semantic_cache.add(description, self.jobs[job_id]["video_url"], student_context)
                logger.info(f"Cached animation result (semantic cache)")
                stats = semantic_cache.get_stats()
                logger.info(f"Semantic cache now contains {stats['size']} entries")

            # Send completion message via WebSocket
            ws_manager = get_websocket_manager()
            if ws_manager and ws_manager.has_connections(job_id):
                loop.run_until_complete(ws_manager.send_message(job_id, {
                    "type": "complete",
                    "job_id": job_id,
                    "video_url": self.jobs[job_id].get("video_url"),
                }))

            logger.info(f"Job {job_id} completed successfully")
            
        except Exception as e:
            logger.error(f"Error rendering job {job_id}: {e}", exc_info=True)
            self.jobs[job_id]["status"] = JobStatus.ERROR
            self.jobs[job_id]["error"] = str(e)
            
            # Send error message via WebSocket
            ws_manager = get_websocket_manager()
            if ws_manager:
                loop.run_until_complete(ws_manager.send_message(job_id, {
                    "type": "error",
                    "job_id": job_id,
                    "error": str(e)
                }))
        finally:
            # Clean up event loop
            loop.close()
    
    def _find_output_video(self, job_dir: Path) -> Path:
        """
        Find the output video file in the job directory
        
        Args:
            job_dir: Job output directory
        
        Returns:
            Path to output video
        """
        logger.info("=" * 70)
        logger.info(f"SEARCHING FOR VIDEO IN: {job_dir}")
        logger.info("=" * 70)
        logger.info(f"Job directory exists: {job_dir.exists()}")
        
        if job_dir.exists():
            logger.info(f"Job directory contents:")
            for item in job_dir.iterdir():
                logger.info(f"  - {item.name} ({'DIR' if item.is_dir() else 'FILE'})")
        
        # Manim creates a subdirectory structure
        # Try common patterns
        patterns = [
            job_dir / "out.mp4",
            job_dir / "videos" / "out.mp4",
            job_dir / "videos" / "720p30" / "out.mp4",
            job_dir / "videos" / "1080p60" / "out.mp4",
        ]
        
        logger.info(f"Checking {len(patterns)} common patterns...")
        for i, pattern in enumerate(patterns, 1):
            logger.info(f"  Pattern {i}: {pattern}")
            logger.info(f"    Exists: {pattern.exists()}")
            if pattern.exists():
                logger.info(f"✓ Found video at: {pattern}")
                logger.info("=" * 70)
                return pattern
        
        # Search recursively
        logger.info("No video found in common patterns, searching recursively...")
        mp4_files = list(job_dir.rglob("*.mp4"))
        logger.info(f"Found {len(mp4_files)} MP4 files recursively:")
        for mp4_file in mp4_files:
            logger.info(f"  - {mp4_file}")
        
        if mp4_files:
            selected = mp4_files[0]
            logger.info(f"✓ Using first found video: {selected}")
            logger.info("=" * 70)
            return selected
        
        logger.error("✗ No video file found in job directory!")
        logger.info("=" * 70)
        return None
    
    def _upload_to_supabase(self, job_id: str, video_path: Path) -> str:
        """
        Upload video to Supabase Storage
        
        Args:
            job_id: Job identifier
            video_path: Path to video file
        
        Returns:
            Public URL of uploaded video
        """
        logger.info("=" * 70)
        logger.info(f"SUPABASE UPLOAD STARTING FOR JOB {job_id}")
        logger.info("=" * 70)
        logger.info(f"Video path: {video_path}")
        logger.info(f"Video path exists: {video_path.exists()}")
        
        if not video_path.exists():
            logger.error(f"✗ Video file does not exist at: {video_path}")
            logger.info("=" * 70)
            return f"/local/{job_id}/out.mp4"
        
        try:
            # Read video file
            logger.info("Reading video file...")
            file_size = video_path.stat().st_size
            logger.info(f"File size: {file_size} bytes ({file_size / (1024*1024):.2f} MB)")
            
            with open(video_path, "rb") as f:
                video_data = f.read()
            
            logger.info(f"Video data read: {len(video_data)} bytes")
            
            # Upload to Supabase Storage
            storage_path = f"{job_id}/out.mp4"
            logger.info(f"Storage path: {storage_path}")
            logger.info(f"Bucket name: {self.bucket_name}")
            
            logger.info("Attempting upload to Supabase Storage...")
            upload_response = self.supabase.storage.from_(self.bucket_name).upload(
                storage_path,
                video_data,
                file_options={"content-type": "video/mp4", "upsert": "true"}
            )
            logger.info(f"Upload response: {upload_response}")
            logger.info("✓ Upload successful!")
            
            # Get public URL
            logger.info("Getting public URL...")
            public_url = self.supabase.storage.from_(self.bucket_name).get_public_url(storage_path)
            logger.info(f"✓ Public URL: {public_url}")
            
            # Verify the file exists
            try:
                logger.info("Verifying uploaded file exists...")
                files = self.supabase.storage.from_(self.bucket_name).list(path=job_id)
                logger.info(f"Files in {job_id}/ directory: {files}")
                logger.info("✓ File verification successful")
            except Exception as verify_error:
                logger.warning(f"Could not verify file (non-critical): {verify_error}")
            
            logger.info("=" * 70)
            logger.info(f"✓ Upload complete! URL: {public_url}")
            logger.info("=" * 70)
            return public_url
            
        except Exception as e:
            logger.error("=" * 70)
            logger.error(f"✗ UPLOAD FAILED FOR JOB {job_id}")
            logger.error("=" * 70)
            logger.error(f"Error type: {type(e).__name__}")
            logger.error(f"Error message: {str(e)}")
            logger.error(f"Full traceback:", exc_info=True)
            logger.error("=" * 70)
            logger.warning(f"Falling back to local path: /local/{job_id}/out.mp4")
            # Return local path as fallback
            return f"/local/{job_id}/out.mp4"

# Global service instance
manim_service = ManimService()
