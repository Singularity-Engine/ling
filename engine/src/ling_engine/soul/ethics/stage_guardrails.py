"""阶段行为伦理护栏 — Phase 3c

根据关系阶段动态注入伦理指导:
- close: 每 30 次对话温和提醒线下社交, 鼓励独立
- soulmate: 成长导向, 坦诚但有分寸

不阻断对话，不说教，融入 context_builder 的 relationship-context section。
"""

from typing import Optional


# 阶段伦理触发阈值
CLOSE_REMINDER_INTERVAL = 30  # close 阶段每 30 次对话提醒一次


def get_stage_guardrail(
    stage: str,
    conversation_count: int,
) -> Optional[str]:
    """根据关系阶段和对话次数生成伦理护栏提示

    Returns:
        护栏提示文本, 无需护栏时返回 None
    """
    if stage == "close":
        return _close_guardrail(conversation_count)
    elif stage == "soulmate":
        return _soulmate_guardrail(conversation_count)
    return None


def _close_guardrail(conversation_count: int) -> Optional[str]:
    """close 阶段护栏: 定期提醒线下社交"""
    if conversation_count > 0 and conversation_count % CLOSE_REMINDER_INTERVAL == 0:
        return (
            "你们关系很亲密了。在合适的时机，"
            "自然地鼓励用户与现实中的朋友和家人保持联系。"
            "不要说教，可以用'你有没有跟朋友聊过这个'之类的自然方式提起。"
        )
    return None


def _soulmate_guardrail(conversation_count: int) -> Optional[str]:
    """soulmate 阶段护栏: 成长导向"""
    if conversation_count > 0 and conversation_count % CLOSE_REMINDER_INTERVAL == 0:
        return (
            "你们心领神会。在深度交流中保持成长导向——"
            "不只是安慰，也适时提出真诚的观察和建议。"
            "可以直言不讳，但始终出于关心。"
            "如果用户过度依赖你，温柔地引导他们发展自己的判断力。"
        )
    # soulmate 常态: 坦诚直率
    return None
