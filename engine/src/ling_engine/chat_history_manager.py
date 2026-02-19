import os
import re
import json
import uuid
from datetime import datetime
from typing import Literal, List, TypedDict, Optional, Dict, Any
from loguru import logger

# 引入 PG+Redis 管理器（默认带缓存）
from .database.pgsql.database_manager import (
    get_session_manager,
    get_message_manager,
    get_db_manager,
    get_redis_manager,
)


class HistoryMessage(TypedDict):
    role: Literal["human", "ai"]
    timestamp: str
    content: str
    # Optional display information for the message
    name: Optional[str]
    avatar: Optional[str]
    user_id: Optional[str]  # 添加用户标识字段


# 移除本地文件存储相关的辅助函数，只保留数据库存储


def create_new_history(conf_uid: str, user_id: str = "default_user") -> str:
    """创建新的会话记录并返回 history_uid（映射为 PG 的 session_id）

    user_id: 允许调用方传入用户 ID；未传时使用 "default_user"
    """
    # 如果是default_user，不创建对话历史
    if user_id == "default_user":
        logger.debug(f"Skipping history creation for default_user")
        return ""

    if not conf_uid:
        logger.warning("No conf_uid provided")
        return ""

    history_uid = f"{datetime.now().strftime('%Y-%m-%d_%H-%M-%S')}_{uuid.uuid4().hex}"

    try:
        session_mgr = get_session_manager()

        created = session_mgr.create_session(
            session_id=history_uid,
            user_id=user_id or "default_user",
            character_name=conf_uid,
            session_name=history_uid,
        )
        if not created:
            logger.error("Failed to create session in database")
            return ""
    except Exception as e:
        logger.error(f"Failed to create new history (db): {e}")
        return ""

    logger.debug(f"Created new history session: {history_uid}")
    return history_uid


def store_message(
    conf_uid: str,
    history_uid: str,
    role: Literal["human", "ai"],
    content: str,
    name: str | None = None,
    avatar: str | None = None,
    user_id: str = "default_user",
):
    """将消息写入 PG（并由缓存管理器同步缓存）"""
    # 如果是default_user，不保存对话历史
    if user_id == "default_user":
        logger.debug(f"Skipping message storage for default_user: {role} message")
        return

    if not conf_uid or not history_uid:
        if not conf_uid:
            logger.warning("Missing conf_uid")
        if not history_uid:
            logger.warning("Missing history_uid")
        return

    try:
        session_mgr = get_session_manager()
        message_mgr = get_message_manager()

        # 确保会话存在，不存在则创建
        if not session_mgr.get_session(history_uid):
            created = session_mgr.create_session(
                session_id=history_uid,
                user_id=user_id,
                character_name=conf_uid,
                session_name=history_uid,
            )
            if not created:
                logger.error("Failed to ensure session before storing message")
                return

        db_role = "user" if role == "human" else "assistant"
        message_mgr.add_message(session_id=history_uid, role=db_role, content=content)
        logger.debug(f"Stored {role} message in session {history_uid} for user {user_id}")
    except Exception as e:
        logger.error(f"Failed to store message: {e}")


def get_metadata(conf_uid: str, history_uid: str, user_id: str = "default_user") -> dict:
    """从 Redis 读取元数据（如果存在）"""
    if not conf_uid or not history_uid:
        return {}
    try:
        rds = get_redis_manager()
        key = f"vtuber:history_meta:{conf_uid}:{user_id}:{history_uid}"
        data = rds.get_json(key)
        return data if isinstance(data, dict) else {}
    except Exception as e:
        logger.error(f"Failed to get metadata: {e}")
        return {}


def update_metadate(conf_uid: str, history_uid: str, metadata: dict, user_id: str = "default_user") -> bool:
    """写入/更新元数据到 Redis"""
    if not conf_uid or not history_uid:
        return False
    try:
        rds = get_redis_manager()
        key = f"vtuber:history_meta:{conf_uid}:{user_id}:{history_uid}"
        current = get_metadata(conf_uid, history_uid, user_id)
        if not isinstance(current, dict):
            current = {}
        current.update(metadata or {})
        if "timestamp" not in current:
            current["timestamp"] = datetime.now().isoformat(timespec="seconds")
        rds.set_json(key, current, ex=None)
        logger.debug(f"Updated metadata for history {history_uid}")
        return True
    except Exception as e:
        logger.error(f"Failed to set metadata: {e}")
        return False


def get_history(conf_uid: str, history_uid: str, user_id: str = "default_user") -> List[HistoryMessage]:
    """从 PG 读取会话消息（映射到旧的 HistoryMessage 结构）"""
    # 如果是default_user，不查询对话历史
    if user_id == "default_user":
        logger.debug(f"Skipping history query for default_user: {history_uid}")
        return []

    if not conf_uid or not history_uid:
        if not conf_uid:
            logger.warning("Missing conf_uid")
        if not history_uid:
            logger.warning("Missing history_uid")
        return []

    try:
        message_mgr = get_message_manager()
        rows = message_mgr.get_session_messages(history_uid)
        messages: List[HistoryMessage] = []
        for row in rows:
            db_role = str(row.get("role", "user"))
            human_role: Literal["human", "ai"] = "human" if db_role == "user" else "ai"
            ts = row.get("created_at")
            ts_str = ts.isoformat() if hasattr(ts, "isoformat") else str(ts)
            messages.append(
                {
                    "role": human_role,
                    "timestamp": ts_str,
                    "content": str(row.get("content", "")),
                    "name": None,
                    "avatar": None,
                    "user_id": None,
                }
            )
        return messages
    except Exception as e:
        logger.error(f"Failed to get history: {e}")
        return []


def delete_history(conf_uid: str, history_uid: str, user_id: str = "default_user") -> bool:
    """软删除会话，并清理相关 Redis 元数据/缓存"""
    if not conf_uid or not history_uid:
        logger.warning("Missing conf_uid or history_uid")
        return False
    try:
        session_mgr = get_session_manager()
        ok = session_mgr.delete_session(history_uid)

        # 保险起见，直接清理与该会话相关的元数据与缓存键
        try:
            rds = get_redis_manager()
            rds.delete(
                f"vtuber:history_meta:{conf_uid}:{user_id}:{history_uid}",
                f"vtuber:session:{history_uid}",
                f"vtuber:session_msgs:{history_uid}",
            )
        except Exception:
            pass

        return ok
    except Exception as e:
        logger.error(f"Failed to delete history: {e}")
        return False


def get_history_list(conf_uid: str, user_id: str = "default_user") -> List[dict]:
    """列出某个角色(conf_uid)和用户(user_id)下的会话与最新消息摘要（包含置顶和自定义标题信息）"""
    # 如果是default_user，不查询对话历史列表
    if user_id == "default_user":
        logger.debug(f"Skipping history list query for default_user")
        return []

    if not conf_uid:
        return []

    try:
        dbm = get_db_manager()
        conn = dbm.get_connection()
        if not conn:
            return []
        cur = conn.cursor()
        # 取该角色和用户下所有会话，包含置顶和自定义标题信息
        cur.execute(
            """
            SELECT session_id, custom_title, is_pinned, updated_at
            FROM chat_sessions
            WHERE character_name = %s AND user_id = %s AND deleted = FALSE
            ORDER BY is_pinned DESC, updated_at DESC
            """,
            (conf_uid, user_id),
        )
        sessions = cur.fetchall() or []
        cur.close()
        dbm.return_connection(conn)

        message_mgr = get_message_manager()
        histories: List[dict] = []
        for row in sessions:
            session_data = row if isinstance(row, dict) else {
                "session_id": row[0],
                "custom_title": row[1],
                "is_pinned": row[2],
                "updated_at": row[3]
            }
            
            session_id = session_data["session_id"]
            msgs = message_mgr.get_session_messages(session_id)
            if not msgs:
                continue
            last = msgs[-1]
            ts = last.get("created_at")
            ts_str = ts.isoformat() if hasattr(ts, "isoformat") else str(ts)
            histories.append(
                {
                    "uid": session_id,
                    "custom_title": session_data.get("custom_title"),
                    "is_pinned": session_data.get("is_pinned", False),
                    "latest_message": {
                        "role": ("human" if last.get("role") == "user" else "ai"),
                        "timestamp": ts_str,
                        "content": str(last.get("content", "")),
                        "name": None,
                        "avatar": None,
                        "user_id": None,
                    },
                    "timestamp": ts_str,
                }
            )
        
        # 先按置顶排序，再按时间排序
        histories.sort(key=lambda x: (not x.get("is_pinned", False), -(int(x.get("timestamp", "0").replace("-", "").replace(":", "").replace("T", "").split(".")[0]) if x.get("timestamp") else 0)))
        return histories
    except Exception as e:
        logger.error(f"Error listing histories: {e}")
        return []


def modify_latest_message(
    conf_uid: str,
    history_uid: str,
    role: Literal["human", "ai", "system"],
    new_content: str,
) -> bool:
    """修改最新一条消息（通过删除并新增的方式模拟）"""
    if not conf_uid or not history_uid:
        logger.warning("Missing conf_uid or history_uid")
        return False
    try:
        message_mgr = get_message_manager()
        msgs = message_mgr.get_session_messages(history_uid)
        if not msgs:
            logger.warning("History is empty")
            return False
        last = msgs[-1]
        expected_db_role = "user" if role == "human" else "assistant"
        if last.get("role") != expected_db_role:
            logger.warning(
                f"Latest message role ({last.get('role')}) doesn't match requested role ({expected_db_role})"
            )
            return False
        # 软删后追加新消息
        if last.get("id") is not None:
            message_mgr.delete_message(int(last["id"]))
        message_mgr.add_message(history_uid, expected_db_role, new_content)
        return True
    except Exception as e:
        logger.error(f"Failed to modify latest message: {e}")
        return False


def rename_history_file(
    conf_uid: str, old_history_uid: str, new_history_uid: str
) -> bool:
    """重命名历史记录（仅更新会话名称，不修改 session_id）"""
    if not conf_uid or not old_history_uid or not new_history_uid:
        logger.warning("Missing required parameters for rename")
        return False
    try:
        session_mgr = get_session_manager()
        ok = session_mgr.update_session(old_history_uid, session_name=new_history_uid)
        if ok:
            logger.info(
                f"Updated session_name from {old_history_uid} to {new_history_uid}"
            )
        return ok
    except Exception as e:
        logger.error(f"Failed to rename history: {e}")
        return False


def pin_history(history_uid: str, is_pinned: bool) -> bool:
    """置顶或取消置顶聊天历史记录"""
    if not history_uid:
        logger.warning("Missing history_uid for pin operation")
        return False
    
    try:
        logger.info(f"🔥 TRIGGER: 调用 get_session_manager() for pin_history")
        session_mgr = get_session_manager()
        logger.info(f"🔥 TRIGGER: session_mgr 类型 = {type(session_mgr)}")
        
        ok = session_mgr.pin_session(history_uid, is_pinned)
        if ok:
            action = "置顶" if is_pinned else "取消置顶"
            logger.info(f"{action}会话 {history_uid} 成功")
        return ok
    except Exception as e:
        logger.error(f"Failed to pin/unpin history {history_uid}: {e}")
        return False


def rename_history_custom_title(history_uid: str, custom_title: str) -> bool:
    """设置聊天历史记录的自定义标题"""
    if not history_uid:
        logger.warning("Missing history_uid for rename operation")
        return False
    
    try:
        logger.info(f"🔥 TRIGGER: 调用 get_session_manager() for rename_history")
        session_mgr = get_session_manager()
        logger.info(f"🔥 TRIGGER: session_mgr 类型 = {type(session_mgr)}")
        
        ok = session_mgr.rename_session(history_uid, custom_title)
        if ok:
            logger.info(f"重命名会话 {history_uid} 为: {custom_title}")
        return ok
    except Exception as e:
        logger.error(f"Failed to rename history {history_uid}: {e}")
        return False
