"""
用户感知Agent包装器
为现有Agent添加多用户状态隔离能力
"""

import copy
from typing import Dict, Any, Optional
from loguru import logger

from .user_state import UserState


class UserAwareAgentWrapper:
    """Agent包装器，为现有Agent添加用户状态隔离"""

    def __init__(self, base_agent):
        """
        包装现有Agent，使其支持多用户状态隔离

        Args:
            base_agent: 原始Agent实例
        """
        self.base_agent = base_agent
        self.user_contexts: Dict[str, Dict[str, Any]] = {}  # user_id -> agent_state
        self.current_user_id: Optional[str] = None
        self._original_state = None  # 保存原始状态

    def switch_to_user(self, user_id: str, user_state: UserState = None) -> None:
        """
        切换到指定用户的上下文

        Args:
            user_id: 用户ID
            user_state: 用户状态对象
        """
        # 保存当前用户的状态
        if self.current_user_id and hasattr(self.base_agent, 'get_state'):
            try:
                current_state = self.base_agent.get_state()
                self.user_contexts[self.current_user_id] = current_state
                logger.debug(f"💾 保存用户 {self.current_user_id} 的Agent状态")
            except Exception as e:
                logger.warning(f"保存用户状态失败: {e}")

        # 切换到新用户
        self.current_user_id = user_id

        # 恢复新用户的状态
        if user_id in self.user_contexts:
            if hasattr(self.base_agent, 'set_state'):
                try:
                    self.base_agent.set_state(self.user_contexts[user_id])
                    logger.debug(f"🔄 恢复用户 {user_id} 的Agent状态")
                except Exception as e:
                    logger.warning(f"恢复用户状态失败: {e}")
        else:
            # 新用户，创建初始状态
            if hasattr(self.base_agent, 'reset_state'):
                try:
                    self.base_agent.reset_state()
                    logger.debug(f"🆕 为新用户 {user_id} 创建初始Agent状态")
                except Exception as e:
                    logger.warning(f"重置Agent状态失败: {e}")

        logger.debug(f"🔀 Agent已切换到用户 {user_id} 的上下文")

    async def get_response(self, user_input: str, user_id: str = None, user_state: UserState = None, **kwargs):
        """
        获取响应，自动处理用户上下文切换

        Args:
            user_input: 用户输入
            user_id: 用户ID
            user_state: 用户状态
            **kwargs: 其他参数

        Returns:
            Agent响应
        """
        # 如果指定了用户ID且与当前不同，则切换上下文
        if user_id and user_id != self.current_user_id:
            self.switch_to_user(user_id, user_state)

        # 调用原始Agent
        try:
            if hasattr(self.base_agent, 'get_response'):
                response = await self.base_agent.get_response(user_input, **kwargs)
            elif hasattr(self.base_agent, '__call__'):
                response = await self.base_agent(user_input, **kwargs)
            else:
                raise AttributeError("Agent没有get_response或__call__方法")

            # 更新用户状态中的对话历史
            if user_state:
                user_state.add_conversation("user", user_input)
                user_state.add_conversation("assistant", str(response))

            return response

        except Exception as e:
            logger.error(f"Agent响应失败: {e}")
            raise

    def get_user_conversation_history(self, user_id: str, limit: int = 10) -> list:
        """获取用户的对话历史"""
        if user_id in self.user_contexts:
            # 尝试从Agent状态中获取历史
            state = self.user_contexts[user_id]
            if isinstance(state, dict) and 'conversation_history' in state:
                return state['conversation_history'][-limit:]
        return []

    def clear_user_context(self, user_id: str) -> None:
        """清理指定用户的上下文"""
        if user_id in self.user_contexts:
            del self.user_contexts[user_id]
            logger.info(f"🗑️ 清理用户 {user_id} 的Agent上下文")

    def get_active_users(self) -> list:
        """获取有活跃上下文的用户列表"""
        return list(self.user_contexts.keys())

    def __getattr__(self, name):
        """代理其他方法到原始Agent"""
        return getattr(self.base_agent, name)


def wrap_agent_for_multi_user(agent) -> UserAwareAgentWrapper:
    """
    便捷函数：将现有Agent包装为多用户感知的Agent

    Args:
        agent: 现有Agent实例

    Returns:
        UserAwareAgentWrapper: 包装后的Agent
    """
    return UserAwareAgentWrapper(agent)