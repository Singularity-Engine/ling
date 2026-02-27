"""
对话内情绪突变检测 — 规则式 <5ms

设计:
- 6 类情绪 (happy/sad/anxious/angry/low/seeking) + neutral
- 区分 sad/anxious/angry 的不同回应策略
- OrderedDict + TTL + maxsize 防内存泄漏
- 懒清理: 每 10 次调用清理一次
- 单例工厂模式
"""

from collections import OrderedDict
import time
from typing import Optional


# OrderedDict + TTL + maxsize 替代裸 dict
_MAX_TRACKED = 500
_TTL_SECONDS = 3600

_conversation_emotions: OrderedDict = OrderedDict()   # {user_id: [emotion_label, ...]}
_conversation_timestamps: OrderedDict = OrderedDict()  # {user_id: last_access_time}
_cleanup_counter = 0


def _lazy_cleanup():
    """每 10 次调用清理一次，不在每次热路径上遍历"""
    global _cleanup_counter
    _cleanup_counter += 1
    if _cleanup_counter % 10 != 0:
        return
    now = time.monotonic()
    expired = [k for k, v in _conversation_timestamps.items() if now - v > _TTL_SECONDS]
    for k in expired:
        _conversation_emotions.pop(k, None)
        _conversation_timestamps.pop(k, None)
    while len(_conversation_emotions) > _MAX_TRACKED:
        oldest = next(iter(_conversation_emotions))
        _conversation_emotions.pop(oldest)
        _conversation_timestamps.pop(oldest, None)


_in_conv_tracker: Optional["InConversationTracker"] = None


def get_in_conversation_tracker() -> "InConversationTracker":
    """单例工厂"""
    global _in_conv_tracker
    if _in_conv_tracker is None:
        _in_conv_tracker = InConversationTracker()
    return _in_conv_tracker


def reset_in_conversation_tracker_for_testing():
    """测试辅助: 清空对话内状态并重置单例。"""
    global _in_conv_tracker, _cleanup_counter
    _conversation_emotions.clear()
    _conversation_timestamps.clear()
    _cleanup_counter = 0
    _in_conv_tracker = None


class InConversationTracker:
    """对话内情绪突变检测 — 规则式 <5ms"""

    # 区分 sad/anxious/angry（不同回应策略）
    # 🧬: 多字词直接匹配；单字词需要消歧（检查前后字符）
    SIGNALS = {
        "happy": ["哈哈", "太好了", "开心", "终于", "成功", "耶", "棒"],
        "sad": ["难过", "伤心", "想哭", "心痛", "失落"],
        "anxious": ["焦虑", "压力", "紧张", "担心", "害怕", "忐忑"],
        "angry": ["好烦", "真烦", "烦死", "生气", "愤怒", "气死", "受不了"],
        "low": ["唉", "好累", "真累", "累死", "崩溃", "不开心", "郁闷"],
        "seeking": ["怎么办", "不知道", "纠结", "迷茫", "帮帮我"],
    }
    # 需要消歧的单字关键词 + 排除组合词
    _AMBIGUOUS = {
        "烦": {"麻烦", "烦请", "烦劳", "不胜其烦"},  # "烦" 在这些词中不是情绪
        "累": {"积累", "累计", "累积", "连累", "牵累"},  # "累" 在这些词中不是情绪
    }

    # 情绪极性分组 (用于突变检测)
    POSITIVE = {"happy"}
    NEGATIVE = {"sad", "anxious", "angry", "low"}

    def track(self, message: str, user_id: str) -> Optional[str]:
        """每条消息跑一次 (<5ms)，检测情绪突变"""
        _lazy_cleanup()
        current = self._detect(message)
        history = _conversation_emotions.get(user_id, [])

        history.append(current)
        _conversation_emotions[user_id] = history[-10:]
        _conversation_timestamps[user_id] = time.monotonic()

        if len(history) < 2:
            return None

        previous = history[-2]
        # 突变检测 — 带具体情绪类型的提示
        if previous in self.POSITIVE and current in self.NEGATIVE:
            hint_map = {
                "sad": "用户情绪转为伤感，注意倾听和陪伴",
                "anxious": "用户变得焦虑，先认可感受再提供帮助",
                "angry": "用户情绪激动，避免说教，先共情",
                "low": "用户情绪低落，温和关心",
            }
            return hint_map.get(current, "用户情绪从积极转为消极，注意倾听和共情")
        if previous in self.NEGATIVE and current == "seeking":
            return "用户从消极升级为寻求帮助，温和提供建议"
        if previous in self.NEGATIVE | {"seeking"} and current in self.POSITIVE:
            return "用户情绪好转了，可以轻松回应"
        return None

    def _detect(self, message: str) -> str:
        """检测消息的主要情绪

        🧬: 多字词直接匹配；对容易误判的单字词做消歧检查。
        """
        for emotion, keywords in self.SIGNALS.items():
            for kw in keywords:
                if kw in message:
                    return emotion
        # 🧬: 消歧单字关键词 (只有上面多字词没匹配到才检查)
        for ambig_kw, exclusions in self._AMBIGUOUS.items():
            if ambig_kw in message:
                if not any(exc in message for exc in exclusions):
                    # "烦" 不在排除组合词中 → 是真实情绪
                    if ambig_kw == "烦":
                        return "angry"
                    elif ambig_kw == "累":
                        return "low"
        return "neutral"

    def reset(self, user_id: str):
        """对话结束时重置"""
        _conversation_emotions.pop(user_id, None)
        _conversation_timestamps.pop(user_id, None)
