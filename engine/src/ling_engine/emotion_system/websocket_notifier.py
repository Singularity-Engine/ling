import json
from typing import Optional
from fastapi import WebSocket
from loguru import logger

class WebSocketNotifier:
    """Handles WebSocket notifications for emotion system"""
    
    def __init__(self):
        """Initialize WebSocket notifier"""
        pass
        
    async def notify_affinity_update(
        self,
        websocket: WebSocket,
        affinity: int,
        level: str,
        character_id: Optional[str] = None,
        user_id: Optional[str] = None
    ) -> None:
        """Send affinity update notification
        
        Args:
            websocket: WebSocket connection
            affinity: Current affinity value
            level: Affinity level (low/medium/high)
            character_id: Optional character identifier
            user_id: Optional user identifier
        """
        try:
            await websocket.send_text(json.dumps({
                "type": "affinity-update",
                "affinity": affinity,
                "level": level,
                "character_id": character_id,
                "user_id": user_id
            }))
            logger.debug(f"Sent affinity update: {affinity} ({level})")
        except Exception as e:
            logger.error(f"Failed to send affinity update: {e}")
            
    async def notify_affinity_milestone(
        self,
        websocket: WebSocket,
        milestone: int,
        character_id: Optional[str] = None,
        user_id: Optional[str] = None
    ) -> None:
        """Send affinity milestone notification
        
        Args:
            websocket: WebSocket connection
            milestone: Milestone value reached
            character_id: Optional character identifier
            user_id: Optional user identifier
        """
        try:
            await websocket.send_text(json.dumps({
                "type": "affinity-milestone",
                "milestone": milestone,
                "message": f"Reached affinity milestone: {milestone}!",
                "character_id": character_id,
                "user_id": user_id
            }))
            logger.debug(f"Sent milestone notification: {milestone}")
        except Exception as e:
            logger.error(f"Failed to send milestone notification: {e}")
            
    async def notify_emotion_expression(
        self,
        websocket: WebSocket,
        expression: str,
        intensity: float,
        character_id: Optional[str] = None
    ) -> None:
        """Send emotion expression notification
        
        Args:
            websocket: WebSocket connection
            expression: Expression name
            intensity: Expression intensity (0.0-1.0)
            character_id: Optional character identifier
        """
        try:
            await websocket.send_text(json.dumps({
                "type": "emotion-expression",
                "expression": expression,
                "intensity": intensity,
                "character_id": character_id
            }))
            logger.debug(f"Sent expression notification: {expression} ({intensity:.2f})")
        except Exception as e:
            logger.error(f"Failed to send expression notification: {e}")
            
    async def notify_error(
        self,
        websocket: WebSocket,
        error: str
    ) -> None:
        """Send error notification
        
        Args:
            websocket: WebSocket connection
            error: Error message
        """
        try:
            await websocket.send_text(json.dumps({
                "type": "emotion-error",
                "error": error
            }))
            logger.error(f"Sent error notification: {error}")
        except Exception as e:
            logger.error(f"Failed to send error notification: {e}") 