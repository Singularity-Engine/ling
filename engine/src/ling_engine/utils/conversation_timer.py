"""
对话时间监视器

记录LLM对话的首次响应时间和总对话时间
"""

import time
from typing import Optional, Dict, Any
from loguru import logger
from dataclasses import dataclass
from contextlib import contextmanager


@dataclass
class ConversationTiming:
    """对话时间记录"""
    conversation_id: str
    user_id: str
    start_time: float
    first_response_time: Optional[float] = None
    end_time: Optional[float] = None

    @property
    def first_response_duration(self) -> Optional[float]:
        """首次响应时间（秒）"""
        if self.first_response_time:
            return self.first_response_time - self.start_time
        return None

    @property
    def total_duration(self) -> Optional[float]:
        """总对话时间（秒）"""
        if self.end_time:
            return self.end_time - self.start_time
        return None


class ConversationTimer:
    """对话时间监视器"""

    def __init__(self):
        self._active_conversations: Dict[str, ConversationTiming] = {}

    def start_conversation(self, conversation_id: str, user_id: str = "default_user") -> ConversationTiming:
        """开始计时一个对话

        Args:
            conversation_id: 对话唯一标识符
            user_id: 用户ID

        Returns:
            对话时间记录对象
        """
        current_time = time.time()

        timing = ConversationTiming(
            conversation_id=conversation_id,
            user_id=user_id,
            start_time=current_time
        )

        self._active_conversations[conversation_id] = timing

        logger.info(f"⏰ 对话计时开始: {conversation_id} (用户: {user_id})")
        return timing

    def mark_first_response(self, conversation_id: str) -> Optional[float]:
        """标记首次响应时间

        Args:
            conversation_id: 对话标识符

        Returns:
            首次响应耗时（秒），如果对话不存在则返回None
        """
        if conversation_id not in self._active_conversations:
            logger.warning(f"⚠️ 尝试标记不存在的对话首次响应: {conversation_id}")
            return None

        timing = self._active_conversations[conversation_id]

        if timing.first_response_time is not None:
            logger.debug(f"📍 对话 {conversation_id} 已标记过首次响应")
            return timing.first_response_duration

        timing.first_response_time = time.time()
        duration = timing.first_response_duration

        logger.info(f"🚀 首次响应时间: {conversation_id} - {duration:.3f}秒 (用户: {timing.user_id})")
        return duration

    def end_conversation(self, conversation_id: str) -> Optional[ConversationTiming]:
        """结束对话计时

        Args:
            conversation_id: 对话标识符

        Returns:
            完整的对话时间记录，如果对话不存在则返回None
        """
        if conversation_id not in self._active_conversations:
            logger.warning(f"⚠️ 尝试结束不存在的对话: {conversation_id}")
            return None

        timing = self._active_conversations.pop(conversation_id)
        timing.end_time = time.time()

        # 记录完整统计信息
        first_response_str = f"{timing.first_response_duration:.3f}秒" if timing.first_response_duration else "未记录"
        total_duration_str = f"{timing.total_duration:.3f}秒" if timing.total_duration else "未完成"

        logger.info(f"🏁 对话完成: {conversation_id}")
        logger.info(f"   👤 用户: {timing.user_id}")
        logger.info(f"   🚀 首次响应: {first_response_str}")
        logger.info(f"   ⌛ 总时长: {total_duration_str}")

        return timing

    def get_conversation_timing(self, conversation_id: str) -> Optional[ConversationTiming]:
        """获取当前对话的时间记录

        Args:
            conversation_id: 对话标识符

        Returns:
            对话时间记录，如果不存在则返回None
        """
        return self._active_conversations.get(conversation_id)

    def cleanup_stale_conversations(self, max_age_seconds: int = 3600) -> int:
        """清理超时的对话记录

        Args:
            max_age_seconds: 最大保留时间（秒），默认1小时

        Returns:
            清理的对话数量
        """
        current_time = time.time()
        stale_conversations = []

        for conv_id, timing in self._active_conversations.items():
            if current_time - timing.start_time > max_age_seconds:
                stale_conversations.append(conv_id)

        for conv_id in stale_conversations:
            timing = self._active_conversations.pop(conv_id)
            logger.warning(f"🧹 清理超时对话: {conv_id} (已运行: {current_time - timing.start_time:.1f}秒)")

        return len(stale_conversations)

    @contextmanager
    def time_conversation(self, conversation_id: str, user_id: str = "default_user"):
        """上下文管理器：自动管理对话计时

        Args:
            conversation_id: 对话标识符
            user_id: 用户ID

        Example:
            with timer.time_conversation("conv_123", "user_456"):
                # 对话处理代码
                timer.mark_first_response("conv_123")  # 在首次响应时调用
                # 更多处理...
            # 自动结束计时
        """
        timing = self.start_conversation(conversation_id, user_id)
        try:
            yield timing
        finally:
            self.end_conversation(conversation_id)

    def get_active_conversation_count(self) -> int:
        """获取当前活跃对话数量"""
        return len(self._active_conversations)

    def get_statistics(self) -> Dict[str, Any]:
        """获取当前统计信息"""
        active_count = len(self._active_conversations)

        # 计算平均等待时间（对于还没有首次响应的对话）
        current_time = time.time()
        pending_conversations = []
        for timing in self._active_conversations.values():
            if timing.first_response_time is None:
                pending_conversations.append(current_time - timing.start_time)

        avg_pending_time = sum(pending_conversations) / len(pending_conversations) if pending_conversations else 0

        return {
            "active_conversations": active_count,
            "pending_first_response": len(pending_conversations),
            "average_pending_time": avg_pending_time
        }


# 全局实例
conversation_timer = ConversationTimer()