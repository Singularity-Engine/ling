"""
Emotion and affinity system for Open LLM VTuber.
This module provides functionality for managing character emotions and user affinity.
"""

from .affinity_storage import PgRedisAffinityStorage
from .emotion_manager import EmotionManager, EmotionConfig
from .emotion_analyzer import EmotionAnalyzer, EmotionAnalysis
from .expression_manager import ExpressionManager
from .websocket_notifier import WebSocketNotifier
from .emotional_agent import EmotionalBasicMemoryAgent

__all__ = [
    'PgRedisAffinityStorage',
    'EmotionManager',
    'EmotionConfig',
    'EmotionAnalyzer',
    'EmotionAnalysis',
    'ExpressionManager',
    'WebSocketNotifier',
    'EmotionalBasicMemoryAgent'
] 