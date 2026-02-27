"""Soul 模块测试重置入口。"""

from loguru import logger

from ..adapters.graphiti_adapter import reset_graphiti_adapter_for_testing
from ..adapters.mem0_adapter import reset_mem0_adapter_for_testing
from ..cache.user_profile_cache import reset_user_profile_cache_for_testing
from ..config import reset_soul_config_for_testing
from soul_fabric import reset_memory_fabric_for_testing
from ..narrative.story_thread_tracker import reset_story_tracker_for_testing
from ..pipeline.in_conversation_tracker import reset_in_conversation_tracker_for_testing
from ..pipeline.soul_post_processor import reset_soul_post_processor_for_testing
from ..ports.initializer import reset_ports_initializer_for_testing
from ..recall.soul_recall import reset_soul_recall_for_testing
from ..semantic.knowledge_graph import reset_knowledge_graph_for_testing
from ..services.memory_deletion import reset_deletion_service_for_testing
from ..storage.soul_collections import reset_soul_collections_state_for_testing
from ..utils.async_tasks import reset_background_tasks_for_testing


async def reset_all_soul_state_for_testing(close_mongo: bool = True):
    """重置 Soul 的单例和全局状态，避免测试间互相污染。"""
    reset_background_tasks_for_testing()
    reset_user_profile_cache_for_testing()
    reset_in_conversation_tracker_for_testing()
    reset_story_tracker_for_testing()
    reset_soul_post_processor_for_testing()
    reset_deletion_service_for_testing()
    reset_soul_recall_for_testing()
    reset_knowledge_graph_for_testing()
    reset_graphiti_adapter_for_testing()
    reset_mem0_adapter_for_testing()
    reset_ports_initializer_for_testing()
    reset_soul_collections_state_for_testing()
    reset_soul_config_for_testing()
    reset_memory_fabric_for_testing()

    if close_mongo:
        try:
            from ..storage.mongo_client import close_soul_db

            await close_soul_db()
        except Exception as e:
            logger.debug(f"[Soul] reset_all_soul_state_for_testing close_mongo failed: {e}")
