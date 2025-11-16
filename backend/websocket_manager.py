"""
WebSocket connection manager for streaming Manim frames
"""
import logging
from typing import Dict, Set
from collections import defaultdict
from fastapi import WebSocket

logger = logging.getLogger(__name__)

class WebSocketManager:
    """Manages WebSocket connections for streaming Manim frames"""
    def __init__(self):
        # Map job_id to set of WebSocket connections
        self.active_connections: Dict[str, Set[WebSocket]] = defaultdict(set)
    
    async def connect(self, websocket: WebSocket, job_id: str):
        """Connect a WebSocket for a specific job"""
        await websocket.accept()
        self.active_connections[job_id].add(websocket)
        logger.info(f"WebSocket connected for job {job_id} (total connections: {len(self.active_connections[job_id])})")
    
    def disconnect(self, websocket: WebSocket, job_id: str):
        """Disconnect a WebSocket for a specific job"""
        if job_id in self.active_connections:
            self.active_connections[job_id].discard(websocket)
            if not self.active_connections[job_id]:
                del self.active_connections[job_id]
        logger.info(f"WebSocket disconnected for job {job_id}")
    
    async def send_message(self, job_id: str, message: dict):
        """Send a message to all connected clients for a job"""
        if job_id not in self.active_connections:
            return
        
        disconnected = set()
        for connection in self.active_connections[job_id]:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.warning(f"Failed to send message to WebSocket for job {job_id}: {e}")
                disconnected.add(connection)
        
        # Clean up disconnected connections
        for connection in disconnected:
            self.disconnect(connection, job_id)
    
    def has_connections(self, job_id: str) -> bool:
        """Check if there are any active connections for a job"""
        return job_id in self.active_connections and len(self.active_connections[job_id]) > 0

# Global WebSocket manager instance
websocket_manager = WebSocketManager()

