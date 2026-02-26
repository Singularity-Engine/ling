"""输入校验工具。"""

import re
from typing import Any

USER_ID_PATTERN = re.compile(r"^[\w\-.:]{1,128}$")

_ANONYMOUS_PREFIXES = ("client_", "ws_", "anonymous_")
_ANONYMOUS_IDS = frozenset({"default_user", "unknown", "guest", "anonymous"})


def is_valid_user_id(user_id: Any) -> bool:
    """校验 user_id 是否为安全的字符串标识。"""
    return isinstance(user_id, str) and bool(USER_ID_PATTERN.fullmatch(user_id))


def is_authenticated_user_id(user_id: Any) -> bool:
    """校验 user_id 是否为已认证用户（排除匿名/临时 ID）。

    匿名 ID 格式: "default_user", "client_xxx", "ws_xxx", "anonymous" 等。
    这些 ID 无法持久关联到真实用户，不应写入或召回记忆。
    """
    if not is_valid_user_id(user_id):
        return False
    uid = user_id.strip().lower()
    if uid in _ANONYMOUS_IDS:
        return False
    for prefix in _ANONYMOUS_PREFIXES:
        if uid.startswith(prefix):
            return False
    return True
