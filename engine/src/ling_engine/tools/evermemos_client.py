"""
EverMemOS 客户端 — 灵的长期记忆接口
将灵的每个动作（工具调用、对话、决策）写入 EverMemOS
支持用户隔离、角色上下文、记忆搜索召回
"""

import os
import asyncio
import aiohttp
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from loguru import logger

# EverMemOS API 地址（Docker 内网）
EVERMEMOS_URL = os.environ.get(
    "EVERMEMOS_URL", "http://evermemos-app:1995"
)
LING_USER_ID = "ling"
LING_OWNER_EMAIL = os.environ.get("LING_OWNER_EMAIL", "")

_session: Optional[aiohttp.ClientSession] = None
_session_lock = asyncio.Lock()


async def _get_session() -> aiohttp.ClientSession:
    global _session
    async with _session_lock:
        if _session is None or _session.closed:
            _session = aiohttp.ClientSession(
                connector=aiohttp.TCPConnector(limit=10),
                timeout=aiohttp.ClientTimeout(total=10),
            )
    return _session


# ---------------------------------------------------------------------------
# 1. 用户记忆上下文
# ---------------------------------------------------------------------------

@dataclass
class UserMemoryContext:
    """用户记忆上下文 — 决定写入 EverMemOS 时的 group_id 和记录详细度"""
    user_id: str
    username: str
    role: str           # "owner" | "admin" | "user" | "guest"
    is_owner: bool
    is_guest: bool
    conf_uid: str = ""  # 角色ID（跟哪个角色对话的）

    @property
    def group_id(self) -> str:
        if self.is_owner:
            return "owner"
        return f"user:{self.user_id}"

    @property
    def group_name(self) -> str:
        if self.is_owner:
            return f"owner:{self.username}"
        return f"user:{self.username}"

    @property
    def should_record(self) -> bool:
        # owner 永远记录，guest 跳过
        return self.is_owner or not self.is_guest


def resolve_user_context(
    client_uid: Optional[str] = None,
    user_id: Optional[str] = None,
    conf_uid: str = "",
) -> UserMemoryContext:
    """三级解析用户上下文

    优先级: client_uid → WebSocket 缓存 > UserContextManager(contextvars) > 参数兜底
    """
    resolved_id = None
    resolved_name = "unknown"
    resolved_email = ""
    resolved_roles: list = []

    # --- Level 1: WebSocket 缓存 ---
    if client_uid:
        try:
            from ..bff_integration.auth.websocket_user_cache import (
                websocket_user_cache,
            )
            cached = websocket_user_cache.get_user_for_client(client_uid)
            if cached:
                resolved_id = cached.user_id
                resolved_name = cached.username
                resolved_email = cached.email or ""
                resolved_roles = cached.roles or []
        except Exception:
            pass

    # --- Level 2: UserContextManager (contextvars) ---
    if not resolved_id:
        try:
            from ..bff_integration.auth.user_context import UserContextManager
            ctx = UserContextManager.get_current_user_context()
            if ctx:
                resolved_id = ctx.user_id
                resolved_name = ctx.username
                resolved_email = ctx.email or ""
                resolved_roles = ctx.roles or []
        except Exception:
            pass

    # --- Level 3: 参数兜底 ---
    if not resolved_id:
        resolved_id = user_id or "default_user"

    # --- 判断角色 ---
    is_owner = (
        "owner" in resolved_roles
        or (LING_OWNER_EMAIL and resolved_email == LING_OWNER_EMAIL)
    )
    is_guest = resolved_id.startswith("guest_") or resolved_id == "default_user"

    role = "owner" if is_owner else (
        "guest" if is_guest else (
            "admin" if "admin" in resolved_roles else "user"
        )
    )

    return UserMemoryContext(
        user_id=resolved_id,
        username=resolved_name,
        role=role,
        is_owner=is_owner,
        is_guest=is_guest,
        conf_uid=conf_uid,
    )


# ---------------------------------------------------------------------------
# 2. 写入 API
# ---------------------------------------------------------------------------

async def record_action(
    content: str,
    group_id: str = "actions",
    group_name: str = "",
    sender_name: str = "ling",
    max_retries: int = 1,
) -> bool:
    """将一条记录写入 EverMemOS（低层通用函数，含重试）"""
    session = await _get_session()
    payload = {
        "message_id": f"ling-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}",
        "create_time": datetime.now(timezone.utc).isoformat(),
        "sender": LING_USER_ID,
        "sender_name": sender_name,
        "content": content,
        "role": "assistant",
        "group_id": group_id,
        "group_name": group_name or group_id,
    }
    last_error = None
    for attempt in range(max_retries + 1):
        try:
            async with session.post(
                f"{EVERMEMOS_URL}/api/v1/memories",
                json=payload,
            ) as resp:
                if resp.status == 200:
                    logger.debug(f"[EverMemOS] 记录成功 [{group_id}]: {content[:60]}")
                    return True
                else:
                    body = await resp.text()
                    last_error = f"{resp.status}: {body[:200]}"
        except Exception as e:
            last_error = str(e)
        if attempt < max_retries:
            logger.info(f"[EverMemOS] 写入失败({last_error})，1秒后重试 ({attempt+1}/{max_retries})")
            await asyncio.sleep(1)
    logger.warning(f"[EverMemOS] 写入最终失败: {last_error}")
    return False


async def record_conversation(
    user_input: str,
    ling_response: str,
    user_id: str = "unknown",
    client_uid: Optional[str] = None,
    conf_uid: str = "",
) -> bool:
    """记录对话 — 按用户隔离 group_id"""
    ctx = resolve_user_context(client_uid=client_uid, user_id=user_id, conf_uid=conf_uid)

    if not ctx.should_record:
        logger.debug(f"[EverMemOS] 跳过 guest 对话记录: {ctx.user_id}")
        return False

    # 内容截断：owner 全文，普通用户截断
    if ctx.is_owner:
        u_text = user_input
        l_text = ling_response
    else:
        u_text = user_input[:500]
        l_text = ling_response[:500]

    # 元数据行 + 对话内容
    meta_line = f"[对话] char:{ctx.conf_uid or 'default'} | user:{ctx.user_id}({ctx.username})"
    content = f"{meta_line}\n用户: {u_text}\n灵: {l_text}"

    return await record_action(
        content,
        group_id=ctx.group_id,
        group_name=ctx.group_name,
    )


async def record_tool_call(
    tool_name: str,
    params: dict,
    result: str,
    success: bool = True,
    user_id: str = "unknown",
) -> bool:
    """记录工具调用 — 附带触发者 user_id"""
    status = "成功" if success else "失败"
    params_summary = str(params)[:200]
    result_summary = result[:300] if result else "(无结果)"

    content = (
        f"[工具调用] {tool_name} — {status} | 触发者:{user_id}\n"
        f"参数: {params_summary}\n"
        f"结果: {result_summary}"
    )
    return await record_action(content, group_id="actions", group_name="actions")


async def record_decision(description: str) -> bool:
    """记录决策"""
    content = f"[决策] {description}"
    return await record_action(content, group_id="decisions", group_name="decisions")


# ---------------------------------------------------------------------------
# 3. 搜索 / 读取 API
# ---------------------------------------------------------------------------

async def search_memories(
    query: str,
    group_id: Optional[str] = None,
    method: str = "keyword",
    top_k: int = 5,
) -> List[Dict[str, Any]]:
    """搜索 EverMemOS 记忆

    Args:
        query: 搜索关键词或语义描述
        group_id: 限定分组（如 "owner", "user:xxx"）
        method: 搜索方式 keyword / vector / hybrid / agentic
        top_k: 返回条数

    Returns:
        匹配结果列表，每项包含 content / group_id 等
    """
    try:
        session = await _get_session()
        params: Dict[str, Any] = {
            "query": query,
            "user_id": LING_USER_ID,
            "retrieve_method": method,
            "top_k": top_k,
        }
        if group_id:
            params["group_id"] = group_id

        async with session.get(
            f"{EVERMEMOS_URL}/api/v1/memories/search",
            params=params,
        ) as resp:
            if resp.status == 200:
                data = await resp.json()
                results = data if isinstance(data, list) else data.get("results", data.get("memories", []))
                logger.debug(f"[EverMemOS] 搜索命中 {len(results)} 条 (query={query[:30]}, group={group_id})")
                return results
            else:
                body = await resp.text()
                logger.warning(f"[EverMemOS] 搜索失败 {resp.status}: {body[:200]}")
                return []
    except Exception as e:
        logger.warning(f"[EverMemOS] 搜索连接失败: {e}")
        return []


async def search_user_memories(
    query: str,
    user_id: str,
    is_owner: bool = False,
    top_k: int = 3,
) -> List[Dict[str, Any]]:
    """搜索指定用户的记忆"""
    group_id = "owner" if is_owner else f"user:{user_id}"
    return await search_memories(query, group_id=group_id, top_k=top_k)


# ---------------------------------------------------------------------------
# 4. 灵魂系统高级搜索 API
# ---------------------------------------------------------------------------

async def search_foresight(
    query: str, user_id: str = "ling", top_k: int = 3, timeout: float = 1.0,
) -> List[Dict[str, Any]]:
    """搜索 EverMemOS 前瞻记忆 (foresight)"""
    return await _search_by_type(query, user_id, "foresight", top_k, timeout)


async def search_event_log(
    query: str, user_id: str = "ling", top_k: int = 3, timeout: float = 1.0,
) -> List[Dict[str, Any]]:
    """搜索 EverMemOS 原子事实 (event_log)"""
    return await _search_by_type(query, user_id, "event_log", top_k, timeout)


async def fetch_user_profile(
    user_id: str = "ling", group_id: Optional[str] = None, timeout: float = 2.0,
) -> Optional[Dict[str, Any]]:
    """获取 EverMemOS 用户画像 (profile)"""
    session = await _get_session()
    params: Dict[str, Any] = {"user_id": user_id, "memory_type": "profile"}
    if group_id:
        params["group_id"] = group_id
    try:
        async with session.get(
            f"{EVERMEMOS_URL}/api/v1/memories",
            params=params,
            timeout=aiohttp.ClientTimeout(total=timeout),
        ) as resp:
            if resp.status == 200:
                data = await resp.json()
                return data[0] if isinstance(data, list) and data else data
    except Exception as e:
        logger.debug(f"[Soul] Profile fetch failed: {e}")
    return None


async def _search_by_type(
    query: str, user_id: str, memory_type: str, top_k: int, timeout: float,
) -> List[Dict[str, Any]]:
    """内部: 按 memory_type 搜索"""
    session = await _get_session()
    params: Dict[str, Any] = {
        "query": query,
        "user_id": user_id,
        "memory_types": memory_type,
        "retrieve_method": "hybrid",
        "top_k": top_k,
    }
    try:
        async with session.get(
            f"{EVERMEMOS_URL}/api/v1/memories/search",
            params=params,
            timeout=aiohttp.ClientTimeout(total=timeout),
        ) as resp:
            if resp.status == 200:
                data = await resp.json()
                return data if isinstance(data, list) else data.get("results", data.get("memories", []))
    except Exception as e:
        logger.debug(f"[Soul] {memory_type} search failed: {e}")
    return []


# ---------------------------------------------------------------------------
# 5. 生命周期
# ---------------------------------------------------------------------------

async def close():
    """关闭 HTTP session"""
    global _session
    if _session and not _session.closed:
        await _session.close()
        _session = None
