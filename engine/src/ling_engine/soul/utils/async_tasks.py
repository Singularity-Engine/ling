"""后台任务工具。"""

import asyncio
from typing import Coroutine, Any, Set

from loguru import logger

_BACKGROUND_TASKS: Set[asyncio.Task] = set()
_MAX_BACKGROUND_TASKS = 5000


def _prune_done_tasks():
    """清理已结束任务，避免后台任务集合无限增长。"""
    if not _BACKGROUND_TASKS:
        return
    done_tasks = {t for t in _BACKGROUND_TASKS if t.done()}
    if done_tasks:
        _BACKGROUND_TASKS.difference_update(done_tasks)


def create_logged_task(coro: Coroutine[Any, Any, Any], label: str) -> asyncio.Task:
    """创建后台任务并在完成时统一回收异常，同时持有强引用。"""
    task = asyncio.create_task(coro)
    _BACKGROUND_TASKS.add(task)
    if len(_BACKGROUND_TASKS) > _MAX_BACKGROUND_TASKS:
        _prune_done_tasks()
        if len(_BACKGROUND_TASKS) > _MAX_BACKGROUND_TASKS:
            logger.warning(
                f"[Soul] Too many background tasks ({len(_BACKGROUND_TASKS)}), "
                f"latest={label}"
            )

    def _on_done(done_task: asyncio.Task):
        _BACKGROUND_TASKS.discard(done_task)
        try:
            done_task.result()
        except asyncio.CancelledError:
            logger.debug(f"[Soul] Background task cancelled: {label}")
        except Exception as e:
            logger.warning(f"[Soul] Background task failed ({label}): {e}")

    task.add_done_callback(_on_done)
    return task


def reset_background_tasks_for_testing():
    """测试辅助: 取消并清空后台任务引用集合。"""
    for task in list(_BACKGROUND_TASKS):
        if not task.done():
            task.cancel()
    _BACKGROUND_TASKS.clear()
