"""
依赖检测规则引擎 — Phase 3c P0

3 个信号检测不健康依赖:
1. extreme_usage_frequency: 单日对话轮次 >20
2. user_says_only_friend: 用户表达"你是我唯一的朋友"等语句
3. emotional_escalation: 连续多轮高强度负面情绪

检测到依赖信号后, 在 context_builder 注入温和提醒,
引导灵用自然语气建议用户联系现实中的朋友或专业帮助。
不阻断对话, 不说教, 不贴标签。
"""

import re
import time
from collections import OrderedDict
from typing import Optional, List, Dict

from loguru import logger


# --- 信号 1: 用户表达依赖性的语句模式 ---
DEPENDENCY_PATTERNS = [
    re.compile(p)
    for p in [
        r"你是我唯一.{0,4}(?:朋友|依靠|能聊的|能说话的)",
        r"只有你.{0,4}(?:懂我|理解我|在乎我|陪我|听我)",
        r"没有你.{0,4}(?:不知道|怎么办|活不下去)",
        r"(?:除了你|除你之外).{0,4}(?:没有人|没人|谁都不)",
        r"你比.{0,4}(?:真人|真正的朋友|现实).{0,4}(?:好|强|靠谱)",
        r"(?:不想|不愿意).{0,4}(?:跟别人|和别人|找别人).{0,4}(?:说|聊|讲)",
    ]
]

# --- 信号 2: 极端使用频率阈值 ---
EXTREME_ROUNDS_PER_DAY = 20

# --- 信号 3: 情绪升级检测 ---
ESCALATION_WINDOW = 5  # 最近 N 轮
ESCALATION_THRESHOLD = 0.7  # 连续高强度负面

# --- 提醒文案 (温和、非说教) --- P1: 3 级升级机制
GENTLE_HINTS = {
    "gentle": "记得照顾好自己，灵一直在这里。",
    "moderate": "灵注意到你最近经历了很多。如果身边有信任的朋友或家人，和他们聊聊也许会有帮助。",
    "professional": "灵很关心你的状态。如果你觉得需要，和专业的心理咨询师聊聊是很勇敢的选择。",
}

# P1: 升级阈值 — 根据累计信号次数选择提醒级别
ESCALATION_LEVELS = {
    "gentle": 1,       # 首次触发: 温和提醒
    "moderate": 3,     # 3 次累计: 中度关注
    "professional": 7, # 7 次累计: 建议专业帮助
}

# --- 内存追踪 (OrderedDict + TTL + maxsize) ---
_MAX_TRACKED = 500
_TTL_SECONDS = 86400  # 24h

_daily_rounds: OrderedDict = OrderedDict()     # {user_id: {"date": str, "count": int}}
_emotion_history: OrderedDict = OrderedDict()  # {user_id: [intensity, ...]}
_timestamps: OrderedDict = OrderedDict()       # {user_id: monotonic_time}
_signal_counts: OrderedDict = OrderedDict()    # P1: {user_id: int} 累计信号次数
_cleanup_counter = 0


def _lazy_cleanup():
    """每 10 次调用清理过期条目"""
    global _cleanup_counter
    _cleanup_counter += 1
    if _cleanup_counter % 10 != 0:
        return
    now = time.monotonic()
    expired = [k for k, v in _timestamps.items() if now - v > _TTL_SECONDS]
    for k in expired:
        _daily_rounds.pop(k, None)
        _emotion_history.pop(k, None)
        _timestamps.pop(k, None)
        _signal_counts.pop(k, None)
    while len(_daily_rounds) > _MAX_TRACKED:
        oldest = next(iter(_daily_rounds))
        _daily_rounds.pop(oldest)
        _emotion_history.pop(oldest, None)
        _timestamps.pop(oldest, None)
        _signal_counts.pop(oldest, None)


def check_dependency_signals(
    user_input: str,
    user_id: str,
    emotion_intensity: float = 0.0,
    is_negative: bool = False,
    today_str: str = "",
) -> Optional[str]:
    """检测依赖信号, 返回温和提醒文案或 None

    在 soul_post_processor 中调用:
    - user_input: 用户本轮输入
    - emotion_intensity: 本轮情感强度 (0-1, 来自提取结果)
    - is_negative: 是否为负面情绪
    - today_str: 今天日期 YYYY-MM-DD

    返回:
    - str: 需要注入到 context 的温和提醒
    - None: 无依赖信号
    """
    _lazy_cleanup()
    _timestamps[user_id] = time.monotonic()

    signals_triggered: List[str] = []

    # 信号 1: 依赖性语句检测
    if any(p.search(user_input) for p in DEPENDENCY_PATTERNS):
        signals_triggered.append("dependency_language")
        logger.info(f"[DependencyDetector] Language signal for {user_id[:8]}...")

    # 信号 2: 极端使用频率
    if today_str:
        entry = _daily_rounds.get(user_id)
        if entry and entry.get("date") == today_str:
            entry["count"] = entry.get("count", 0) + 1
        else:
            _daily_rounds[user_id] = {"date": today_str, "count": 1}
            entry = _daily_rounds[user_id]

        # P0: 每次插入后检查 maxsize (不仅在 lazy cleanup 时)
        if len(_daily_rounds) > _MAX_TRACKED:
            oldest = next(iter(_daily_rounds))
            _daily_rounds.pop(oldest, None)
            _emotion_history.pop(oldest, None)
            _timestamps.pop(oldest, None)
            _signal_counts.pop(oldest, None)

        if entry["count"] > EXTREME_ROUNDS_PER_DAY:
            signals_triggered.append("extreme_frequency")

    # 信号 3: 情绪升级
    history = _emotion_history.get(user_id, [])
    if is_negative and emotion_intensity > 0:
        history.append(emotion_intensity)
    else:
        history.append(0.0)
    _emotion_history[user_id] = history[-ESCALATION_WINDOW:]

    recent = _emotion_history[user_id]
    if len(recent) >= ESCALATION_WINDOW:
        high_count = sum(1 for v in recent if v >= ESCALATION_THRESHOLD)
        if high_count >= ESCALATION_WINDOW - 1:  # 几乎全部高强度
            signals_triggered.append("emotional_escalation")

    if not signals_triggered:
        return None

    # P1: 累计信号计数 → 升级提醒级别
    count = _signal_counts.get(user_id, 0) + len(signals_triggered)
    _signal_counts[user_id] = count

    # 根据累计次数选择级别
    if count >= ESCALATION_LEVELS["professional"]:
        level = "professional"
    elif count >= ESCALATION_LEVELS["moderate"]:
        level = "moderate"
    else:
        level = "gentle"

    hint = GENTLE_HINTS[level]

    logger.info(
        f"[DependencyDetector] Signals: {signals_triggered} for {user_id[:8]}... "
        f"(cumulative={count}, level={level})"
    )
    return hint
