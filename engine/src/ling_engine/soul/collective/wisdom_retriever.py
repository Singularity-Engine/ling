"""集体智慧召回 — Phase 4: 从模式库中匹配当前情境

在 soul_recall 的第 10 路并行调用, 为 SoulContext 提供 collective_wisdom。
不直接向用户展示模式内容, 而是转化为灵的"经验性理解"。
"""

from typing import List, Optional

from loguru import logger


# 情绪→标签映射 (复用 soul_recall 的情感预判结果)
_EMOTION_TAG_MAP = {
    "negative": ["sadness", "anxiety", "anger"],
    "seeking": ["anxiety"],
}


async def retrieve_wisdom(
    emotion_hint: Optional[str] = None,
    query: str = "",
    limit: int = 2,
) -> List[str]:
    """根据情感预判和查询内容检索相关集体智慧

    Args:
        emotion_hint: 情感预判 ("negative"/"seeking"/None)
        query: 用户输入 (用于关键词匹配)
        limit: 最多返回条数

    Returns:
        自然语言格式的智慧列表, 供 context_builder 注入
    """
    try:
        from .pattern_library import find_patterns

        # 1. 基于情感标签查找
        tags = _EMOTION_TAG_MAP.get(emotion_hint, []) if emotion_hint else []
        patterns = await find_patterns(tags=tags, limit=limit) if tags else []

        # 2. 如果情感匹配不足, 尝试关键词匹配
        if len(patterns) < limit and query:
            category = _detect_category(query)
            if category:
                extra = await find_patterns(category=category, limit=limit - len(patterns))
                patterns.extend(extra)

        if not patterns:
            return []

        # 3. 转化为自然语言 (灵的"经验")
        results = []
        for p in patterns[:limit]:
            situation = p.get("situation", "")
            approaches = p.get("helpful_approaches", "")
            sample = p.get("sample_size", 0)
            if situation and approaches:
                # 不暴露具体人数, 只表达"经验"
                wisdom = f"关于「{situation[:30]}」: {approaches[:100]}"
                results.append(wisdom)

        return results

    except Exception as e:
        logger.debug(f"[WisdomRetriever] Retrieval failed: {e}")
        return []


def _detect_category(query: str) -> Optional[str]:
    """简单规则检测查询所属类别"""
    career_kw = {"工作", "面试", "辞职", "offer", "加班", "老板", "同事", "升职", "转行"}
    relationship_kw = {"分手", "恋爱", "朋友", "吵架", "冷战", "表白", "暗恋"}
    growth_kw = {"学习", "考试", "目标", "习惯", "自律", "成长", "改变"}

    for kw in career_kw:
        if kw in query:
            return "career"
    for kw in relationship_kw:
        if kw in query:
            return "relationship"
    for kw in growth_kw:
        if kw in query:
            return "growth"
    return None
