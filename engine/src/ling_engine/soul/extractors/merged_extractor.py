"""
合并 LLM 提取器 — 单次 LLM 调用提取情感+重要度+故事信号+关系信号
修复: run_in_executor 避免阻塞事件循环, Pydantic 验证, 规则降级
"""

import asyncio
import json
import threading
from typing import Optional
from loguru import logger
from pydantic import ValidationError

from ..models import ExtractionResult, EmotionAnnotation, ImportanceScore

# OpenAI client 单例 — 双重检查锁，线程安全
_openai_lock = threading.Lock()
_openai_client = None


def _get_openai_client():
    """获取 OpenAI client 单例 (线程安全)"""
    global _openai_client
    if _openai_client is None:
        with _openai_lock:
            if _openai_client is None:
                from openai import OpenAI
                import os
                _openai_client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY", ""))
    return _openai_client


EXTRACTION_PROMPT = """你是灵的记忆分析系统。分析以下对话，提取结构化信息。

用户说: {user_input}
灵回复: {ai_response}

请用 JSON 格式返回:
{{
  "emotion": {{
    "user_emotion": "joy|sadness|anxiety|excitement|anger|neutral",
    "emotion_intensity": 0.0-1.0,
    "emotional_trajectory": "rising|falling|stable",
    "ling_recommended_tone": "温暖|共情|轻松|认真|鼓励|neutral",
    "trigger_keywords": ["关键词"],
    "is_emotional_peak": false
  }},
  "importance": {{
    "score": 0.0-1.0,
    "emotional": 0.0-1.0,
    "novelty": 0.0-1.0,
    "personal": 0.0-1.0,
    "actionable": 0.0-1.0,
    "summary": "一句话摘要"
  }},
  "relationship_signals": [
    {{"signal": "信号类型", "weight": 1.0-5.0, "evidence": "依据"}}
  ],
  "story_update": {{
    "title": "故事线标题(如有进行中的话题，如求职、学习新技能等)",
    "update_type": "new|continue|resolve|null",
    "details": "发生了什么变化",
    "arc_position": "setup|rising|climax|falling|resolution",
    "expected_next": "预计下一步(如果能推断)"
  }}
}}

importance.score 计算规则:
- emotional × 0.40 (情感是记忆编码的主要驱动力)
- novelty × 0.15
- personal × 0.25
- actionable × 0.10
- recency × 0.10 (固定为 1.0，因为是当前对话)

分数锚点示例:
- 问天气 = 0.1
- 分享今天吃了什么 = 0.2
- 分享心情 = 0.5
- 讨论重要决定 = 0.7
- 重大人生事件(毕业、分手、入职) = 0.9

关系信号类型: user_shared_vulnerability(5.0), deep_emotional_exchange(4.0),
personal_story_sharing(3.5), seeking_advice(3.0), casual_chat(1.0),
humor_exchange(2.0), gratitude_expression(2.5), daily_check_in(1.5)

如果对话没有涉及任何进行中的故事线话题，story_update 可以为 null。
故事线示例: 求职面试过程、学习新技能、搬家计划、人际关系变化等。"""


def _sync_extract(user_input: str, ai_response: str, model: str) -> Optional[dict]:
    """同步 LLM 调用 — 在线程池中执行"""
    try:
        client = _get_openai_client()
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "你是一个 JSON 结构化数据提取器。只返回 JSON，不要其他内容。"},
                {"role": "user", "content": EXTRACTION_PROMPT.format(
                    user_input=user_input[:500],
                    ai_response=ai_response[:500],
                )},
            ],
            temperature=0,
            max_tokens=800,
            response_format={"type": "json_object"},
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        logger.warning(f"[Soul] LLM extraction failed: {e}")
        return None


def _rule_based_fallback(user_input: str, ai_response: str) -> ExtractionResult:
    """规则式降级提取 — LLM 失败时使用"""

    # 情感关键词匹配
    NEGATIVE_KW = {"唉", "烦", "累", "难过", "焦虑", "压力", "崩溃", "不开心", "郁闷", "想死", "绝望"}
    POSITIVE_KW = {"太好了", "终于", "成功了", "开心", "高兴", "棒", "赞"}
    SEEKING_KW = {"怎么办", "不知道", "纠结", "迷茫", "帮帮我"}

    user_lower = user_input.lower()
    emotion = "neutral"
    intensity = 0.3
    tone = "neutral"

    for kw in NEGATIVE_KW:
        if kw in user_lower:
            emotion = "sadness"
            intensity = 0.6
            tone = "共情"
            break
    for kw in POSITIVE_KW:
        if kw in user_lower:
            emotion = "joy"
            intensity = 0.6
            tone = "轻松"
            break
    for kw in SEEKING_KW:
        if kw in user_lower:
            emotion = "anxiety"
            intensity = 0.5
            tone = "温暖"
            break

    # 问句检测
    is_question = user_input.strip().endswith("?") or user_input.strip().endswith("？")

    # 重要度 — 基于长度、情感、是否是问句
    emotional_score = intensity
    novelty_score = 0.3
    personal_score = 0.5 if len(user_input) > 50 else 0.2
    actionable_score = 0.4 if is_question else 0.1
    recency_score = 1.0

    importance_score = (
        emotional_score * 0.40
        + novelty_score * 0.15
        + personal_score * 0.25
        + actionable_score * 0.10
        + recency_score * 0.10
    )

    # 关系信号
    signals = []
    if emotion in ("sadness", "anxiety"):
        signals.append({"signal": "user_shared_vulnerability", "weight": 3.0, "evidence": "用户表达了负面情绪"})
    elif is_question:
        signals.append({"signal": "seeking_advice", "weight": 2.0, "evidence": "用户在寻求建议"})
    else:
        signals.append({"signal": "casual_chat", "weight": 1.0, "evidence": "日常对话"})

    summary = user_input[:60] + ("..." if len(user_input) > 60 else "")

    return ExtractionResult(
        emotion=EmotionAnnotation(
            user_id="",
            user_emotion=emotion,
            emotion_intensity=intensity,
            ling_recommended_tone=tone,
        ),
        importance=ImportanceScore(
            user_id="",
            score=round(importance_score, 2),
            emotional=emotional_score,
            novelty=novelty_score,
            personal=personal_score,
            actionable=actionable_score,
            recency=recency_score,
            summary=summary,
        ),
        relationship_signals=signals,
    )


async def extract_all(
    user_input: str,
    ai_response: str,
    model: str = "gpt-4o-mini",
) -> Optional[ExtractionResult]:
    """单次 LLM 提取 — 通过 run_in_executor 避免阻塞事件循环"""
    loop = asyncio.get_event_loop()
    raw_json = await loop.run_in_executor(None, _sync_extract, user_input, ai_response, model)

    if raw_json is None:
        return _rule_based_fallback(user_input, ai_response)

    # Pydantic 验证
    try:
        # 解析嵌套结构
        emotion_data = raw_json.get("emotion")
        importance_data = raw_json.get("importance")
        signals = raw_json.get("relationship_signals", [])
        story_update = raw_json.get("story_update")

        emotion = EmotionAnnotation(user_id="", **emotion_data) if emotion_data else None
        importance = ImportanceScore(user_id="", **importance_data) if importance_data else None

        # story_update: null/None 表示无故事线更新
        if story_update and not story_update.get("title"):
            story_update = None

        return ExtractionResult(
            emotion=emotion,
            importance=importance,
            relationship_signals=signals,
            story_update=story_update,
        )
    except (ValidationError, TypeError, KeyError) as e:
        logger.warning(f"[Soul] Extraction validation failed: {e}")
        return _rule_based_fallback(user_input, ai_response)
