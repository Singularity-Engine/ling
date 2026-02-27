"""
敏感内容过滤 — 两级保护

NEVER_STORE: 绝对不存储（密码、金融、API 密钥、第三方秘密）
STORE_WITH_CAUTION: 可以存储但脱敏/降低详细度（医疗诊断）
"""

import re
from typing import Literal

# Level 1: 绝对禁止存储
NEVER_STORE_PATTERNS = [
    r'密码[是为:].*\S+',           # 密码相关
    r'password\s*[:=]\s*\S+',
    r'信用卡|银行卡号|CVV',          # 金融
    r'\b\d{13,19}\b',              # 卡号格式
    r'(?:他|她|别人)说.*(?:不要告诉|秘密)',  # 第三方秘密
    r'(?:api[_\s]?key|secret[_\s]?key|access[_\s]?token)\s*[:=]\s*\S+',  # API 密钥
]

# Level 2: 可存储但需脱敏（用户分享的健康状况是关系加深的信号，不应完全忽略）
CAUTION_PATTERNS = [
    r'诊断.*(?:癌|抑郁|HIV|艾滋)',    # 医疗诊断
    r'(?:确诊|检查出).*(?:疾病|病)',    # 医疗确诊
]

_never_compiled = [re.compile(p, re.IGNORECASE) for p in NEVER_STORE_PATTERNS]
_caution_compiled = [re.compile(p, re.IGNORECASE) for p in CAUTION_PATTERNS]


def check_sensitivity(text: str) -> Literal["safe", "caution", "block"]:
    """三级检查: safe=可存储, caution=可存储但需脱敏, block=禁止存储"""
    if not text:
        return "safe"
    if any(p.search(text) for p in _never_compiled):
        return "block"
    if any(p.search(text) for p in _caution_compiled):
        return "caution"
    return "safe"


def contains_sensitive(text: str) -> bool:
    """检查文本是否包含不应存储的敏感信息（仅 NEVER_STORE 级别）

    医疗诊断已降级为 STORE_WITH_CAUTION，不再完全阻止。
    用 check_sensitivity() 获取细粒度结果。
    """
    return check_sensitivity(text) == "block"
