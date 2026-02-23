"""
EverMemOS 客户端 — 灵的长期记忆接口
将灵的每个动作（工具调用、对话、决策）写入 EverMemOS
"""

import os
import asyncio
import aiohttp
from datetime import datetime, timezone
from typing import Optional
from loguru import logger

# EverMemOS API 地址（Docker 内网）
EVERMEMOS_URL = os.environ.get(
    "EVERMEMOS_URL", "http://evermemos-app:1995"
)
LING_USER_ID = "ling"
LING_GROUP_DEFAULT = "actions"

_session: Optional[aiohttp.ClientSession] = None


async def _get_session() -> aiohttp.ClientSession:
    global _session
    if _session is None or _session.closed:
        _session = aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=10)
        )
    return _session


async def record_action(
    content: str,
    group_id: str = LING_GROUP_DEFAULT,
    sender_name: str = "ling",
) -> bool:
    """
    将一条动作记录写入 EverMemOS

    Args:
        content: 记录内容（自然语言描述）
        group_id: 分组（actions / conversations / decisions）
        sender_name: 发送者名称

    Returns:
        是否写入成功
    """
    try:
        session = await _get_session()
        payload = {
            "messages": [
                {
                    "message_id": f"ling-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}",
                    "create_time": datetime.now(timezone.utc).isoformat(),
                    "sender": LING_USER_ID,
                    "sender_name": sender_name,
                    "content": content,
                    "role": "assistant",
                    "group_id": group_id,
                    "group_name": group_id,
                }
            ]
        }
        async with session.post(
            f"{EVERMEMOS_URL}/api/v1/memories",
            json=payload,
        ) as resp:
            if resp.status == 200:
                logger.debug(f"[EverMemOS] 记录成功: {content[:60]}")
                return True
            else:
                body = await resp.text()
                logger.warning(f"[EverMemOS] 写入失败 {resp.status}: {body[:200]}")
                return False
    except Exception as e:
        logger.warning(f"[EverMemOS] 连接失败: {e}")
        return False


async def record_tool_call(
    tool_name: str,
    params: dict,
    result: str,
    success: bool = True,
):
    """记录工具调用"""
    status = "成功" if success else "失败"
    # 参数摘要，避免过长
    params_summary = str(params)[:200]
    result_summary = result[:300] if result else "(无结果)"

    content = (
        f"[工具调用] {tool_name} — {status}\n"
        f"参数: {params_summary}\n"
        f"结果: {result_summary}"
    )
    await record_action(content, group_id="actions")


async def record_conversation(
    user_input: str,
    ling_response: str,
    user_id: str = "unknown",
):
    """记录对话"""
    content = (
        f"[对话] 用户({user_id}): {user_input[:200]}\n"
        f"灵的回复: {ling_response[:300]}"
    )
    await record_action(content, group_id="conversations")


async def record_decision(description: str):
    """记录决策"""
    content = f"[决策] {description}"
    await record_action(content, group_id="decisions")


async def close():
    """关闭 HTTP session"""
    global _session
    if _session and not _session.closed:
        await _session.close()
        _session = None
