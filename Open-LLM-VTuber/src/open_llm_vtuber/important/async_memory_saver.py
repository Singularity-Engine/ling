"""
异步内存保存模块
使用线程池执行同步操作，避免阻塞主线程
"""
import asyncio
import concurrent.futures
from typing import Optional
from .memories import save_memory as save_memory_sync


class AsyncMemorySaver:
    """异步内存保存器"""
    
    def __init__(self, max_workers: int = 2):
        """
        初始化异步内存保存器
        
        Args:
            max_workers: 线程池最大工作线程数
        """
        self._executor = concurrent.futures.ThreadPoolExecutor(max_workers=max_workers)
    
    async def save_memory_async(self, content: str, user_id: str = None) -> Optional[bool]:
        """
        异步保存记忆，不阻塞主线程
        
        Args:
            content: 要保存的内容
            user_id: 用户ID，如果不提供将从上下文获取
            
        Returns:
            保存结果，True表示成功，False表示失败，None表示内容不重要
        """
        try:
            # 如果没有提供user_id，尝试从用户上下文获取
            if not user_id:
                try:
                    from ..bff_integration.auth.user_context import UserContextManager
                    user_id = UserContextManager.get_current_user_id()
                    if not user_id:
                        user_id = "default_user"
                except Exception as e:
                    user_id = "default_user"
                    
            
            # 在线程池中执行同步的保存操作
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                self._executor, 
                save_memory_sync, 
                content, 
                user_id
            )
            return result
        except Exception as e:
            
            return False
    
    def close(self):
        """关闭线程池"""
        if self._executor:
            self._executor.shutdown(wait=False)


# 全局异步内存保存器实例
_async_memory_saver = AsyncMemorySaver()


async def save_memory_async(content: str, user_id: str = None) -> Optional[bool]:
    """
    异步保存记忆的便捷函数
    
    Args:
        content: 要保存的内容
        user_id: 用户ID，如果不提供将从上下文获取
        
    Returns:
        保存结果
    """
    
    return await _async_memory_saver.save_memory_async(content, user_id)


def cleanup_async_memory_saver():
    """清理异步内存保存器"""
    global _async_memory_saver
    if _async_memory_saver:
        _async_memory_saver.close()