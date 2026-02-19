"""
多用户管理模块
提供三重标识符(user_id + client_uid + session_id)的安全多用户会话管理

🔒 最安全方法（强烈推荐，避免消息混乱）：
```python
from .multi_user import register_safe_session, get_safe_session_context, cleanup_safe_connection

# 在WebSocket连接时
session_info = register_safe_session(websocket, client_uid, conf_uid)

# 在消息处理时
session_context = get_safe_session_context(client_uid)

# 在断开连接时
cleanup_safe_connection(client_uid)
```

标准方法（与现有系统集成）：
```python
from .multi_user import register_user_session, get_session_context, cleanup_user_connection

# 在WebSocket连接时
session_info = register_user_session(websocket, client_uid, conf_uid)

# 在消息处理时
session_context = get_session_context(client_uid)

# 在断开连接时
cleanup_user_connection(client_uid)
```
"""

# 🔒 最安全API - 三重标识符方案（推荐）
from .safe_session_plugin import (
    SafeUserSessionPlugin,
    get_safe_session_plugin,
    register_safe_session,
    get_safe_session_context,
    save_safe_message,
    cleanup_safe_connection
)

# 新版API - 与现有history_uid系统集成
from .existing_session_plugin import (
    UserSessionPlugin,
    get_user_session_plugin,
    register_user_session,
    get_session_context,
    save_user_message,
    cleanup_user_connection
)

# 旧版API - 通用多用户组件（向后兼容）
from .user_state import UserState, UserStateManager, ConversationSession, SessionManager
from .user_session_manager import UserSessionManager
from .user_aware_agent import UserAwareAgentWrapper
from .multi_user_plugin import (
    MultiUserSessionPlugin,
    get_multi_user_session_plugin,
    register_session_websocket,
    # get_session_context,  # 与新版冲突，使用别名
    get_session_info,
    cleanup_session,
    update_session_interaction,
    # 向后兼容别名
    MultiUserPlugin,
    get_multi_user_plugin,
    register_user_websocket,
    get_user_context,
    cleanup_user_session
)

__all__ = [
    # 🔒 最安全API - 三重标识符方案（强烈推荐）
    "SafeUserSessionPlugin",
    "get_safe_session_plugin",
    "register_safe_session",
    "get_safe_session_context",
    "save_safe_message",
    "cleanup_safe_connection",

    # 推荐API - 与现有系统集成
    "UserSessionPlugin",
    "get_user_session_plugin",
    "register_user_session",
    "get_session_context",
    "save_user_message",
    "cleanup_user_connection",

    # 向后兼容API
    "MultiUserPlugin",
    "get_multi_user_plugin",
    "register_user_websocket",
    "get_user_context",
    "cleanup_user_session",

    # 底层组件（高级用户使用）
    "UserState",
    "ConversationSession",
    "UserStateManager",
    "SessionManager",
    "UserSessionManager",
    "UserAwareAgentWrapper",

    # 新版通用组件
    "MultiUserSessionPlugin",
    "get_multi_user_session_plugin",
    "register_session_websocket",
    "get_session_info",
    "cleanup_session",
    "update_session_interaction"
]