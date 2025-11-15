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
from manim_worker.codegen import generate_and_validate_manim_scene
from dotenv import load_dotenv

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

class ManimService:
    def __init__(self):
        self.jobs: Dict[str, Dict[str, Any]] = {}
        self.output_dir = Path(tempfile.gettempdir()) / "manim_jobs"
        self.output_dir.mkdir(exist_ok=True)
        
        # Thread pool for rendering
        self.executor = ThreadPoolExecutor(max_workers=2)
        
        # Supabase client
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        self.bucket_name = os.getenv("SUPABASE_BUCKET_NAME", "animations")
        
        if supabase_url and supabase_key:
            try:
                self.supabase: Client = create_client(supabase_url, supabase_key)
                logger.info("Supabase client initialized")
            except Exception as e:
                logger.error(f"Failed to initialize Supabase client: {e}")
                self.supabase = None
        else:
            logger.warning("Supabase credentials not provided, storage upload disabled")
            self.supabase = None
    
    def create_job(self, description: str, topic: str, student_context: str | None = None) -> str:
        """
        Create a new animation job
        
        Args:
            description: Animation description
            topic: Topic category (math, cs, etc.)
            student_context: Optional context about the student's current work
        
        Returns:
            job_id: Unique identifier for this job
        """
        job_id = str(uuid.uuid4())
        
        self.jobs[job_id] = {
            "status": JobStatus.PENDING,
            "description": description,
            "topic": topic,
            "student_context": student_context,
            "video_url": None,
            "error": None,
        }
        
        # Start rendering in background
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
    
    def _render_job(self, job_id: str, description: str, topic: str, student_context: str | None = None):
        """
        Render a Manim animation job (runs in thread pool)
        
        Args:
            job_id: Job identifier
            description: Animation description
            topic: Topic category
            student_context: Optional context about the student's current work
        """
        try:
            # Update status to running
            self.jobs[job_id]["status"] = JobStatus.RUNNING
            logger.info(f"Starting render for job {job_id}")
            
            # Create job-specific directory
            job_dir = self.output_dir / job_id
            job_dir.mkdir(exist_ok=True)
            
            # Generate and validate Manim code using Claude
            logger.info(f"Generating Manim code for job {job_id}")
            validated_code = generate_and_validate_manim_scene(description, student_context)
            
            # Write validated code to file
            scene_path = job_dir / "generated_scene.py"
            with open(scene_path, 'w', encoding='utf-8') as f:
                f.write(validated_code)
            
            logger.info(f"Code validated and written to {scene_path}")
            
            # Dynamically import the GeneratedScene class
            spec = importlib.util.spec_from_file_location("generated_scene", scene_path)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            scene_class = module.GeneratedScene
            
            # NOTE: Keeping select_scene() code for future use, but currently using codegen path
            # Old code (commented for reference):
            # scene_class = select_scene(description, topic)
            
            # Configure Manim
            with tempconfig({
                "quality": "medium_quality",
                "preview": False,
                "output_file": "out",
                "media_dir": str(job_dir),
                "video_dir": str(job_dir),
                "pixel_height": 720,
                "pixel_width": 1280,
                "frame_rate": 30,
            }):
                # Render the scene
                scene = scene_class()
                scene.render()
            
            # Find the output video
            video_path = self._find_output_video(job_dir)
            
            if not video_path or not video_path.exists():
                raise FileNotFoundError(f"Output video not found in {job_dir}")
            
            logger.info(f"Render complete for job {job_id}: {video_path}")
            
            # Upload to Supabase Storage
            if self.supabase:
                video_url = self._upload_to_supabase(job_id, video_path)
                self.jobs[job_id]["video_url"] = video_url
            else:
                # Fallback: use local path (for development)
                self.jobs[job_id]["video_url"] = f"/local/{job_id}/out.mp4"
            
            # Update status to done
            self.jobs[job_id]["status"] = JobStatus.DONE
            logger.info(f"Job {job_id} completed successfully")
            
        except Exception as e:
            logger.error(f"Error rendering job {job_id}: {e}", exc_info=True)
            self.jobs[job_id]["status"] = JobStatus.ERROR
            self.jobs[job_id]["error"] = str(e)
    
    def _find_output_video(self, job_dir: Path) -> Path:
        """
        Find the output video file in the job directory
        
        Args:
            job_dir: Job output directory
        
        Returns:
            Path to output video
        """
        # Manim creates a subdirectory structure
        # Try common patterns
        patterns = [
            job_dir / "out.mp4",
            job_dir / "videos" / "out.mp4",
            job_dir / "videos" / "720p30" / "out.mp4",
            job_dir / "videos" / "1080p60" / "out.mp4",
        ]
        
        for pattern in patterns:
            if pattern.exists():
                return pattern
        
        # Search recursively
        mp4_files = list(job_dir.rglob("*.mp4"))
        if mp4_files:
            return mp4_files[0]
        
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
        try:
            # Read video file
            with open(video_path, "rb") as f:
                video_data = f.read()
            
            # Upload to Supabase Storage
            storage_path = f"{job_id}/out.mp4"
            
            self.supabase.storage.from_(self.bucket_name).upload(
                storage_path,
                video_data,
                file_options={"content-type": "video/mp4"}
            )
            
            # Get public URL
            public_url = self.supabase.storage.from_(self.bucket_name).get_public_url(storage_path)
            
            logger.info(f"Uploaded video for job {job_id} to Supabase: {public_url}")
            return public_url
            
        except Exception as e:
            logger.error(f"Failed to upload to Supabase: {e}")
            # Return local path as fallback
            return f"/local/{job_id}/out.mp4"

# Global service instance
manim_service = ManimService()
