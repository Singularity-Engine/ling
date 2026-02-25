"""输入校验工具。"""

import re
from typing import Any

USER_ID_PATTERN = re.compile(r"^[\w\-.:]{1,128}$")


def is_valid_user_id(user_id: Any) -> bool:
    """校验 user_id 是否为安全的字符串标识。"""
    return isinstance(user_id, str) and bool(USER_ID_PATTERN.fullmatch(user_id))
