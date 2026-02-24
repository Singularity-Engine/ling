"""
记忆重建 — 根据时间距离 + 情感标签重建记忆

重要约束: 本类只在召回时临时重建记忆文本，
不修改 MongoDB/EverMemOS 中的原始记忆。原始记忆永远保持不变。
"""

from typing import List, Optional


class MemoryReconstructor:
    """记忆重建 — 近期保留细节，远期用情感+关键词概括"""

    def reconstruct(
        self,
        memory: str,
        days_ago: int = 0,
        emotion_label: str = "",
        trigger_keywords: Optional[List[str]] = None,
    ) -> str:
        """重建记忆 — 近期保留细节，远期用情感+关键词概括。返回重建后的文本副本。"""
        if days_ago > 90:
            return self._distant(memory, emotion_label, trigger_keywords or [])
        elif days_ago > 30:
            return self._moderate(memory)
        return memory

    def _distant(self, memory: str, emotion_label: str, keywords: List[str]) -> str:
        """远期记忆 — 从情感标签+关键词重建，不是简单截断"""
        if emotion_label or keywords:
            parts = []
            if emotion_label and emotion_label != "neutral":
                emotion_map = {
                    "joy": "开心", "sadness": "伤感", "anxiety": "焦虑",
                    "excitement": "兴奋", "anger": "不满",
                }
                parts.append(f"当时的情绪是{emotion_map.get(emotion_label, emotion_label)}")
            if keywords:
                parts.append(f"涉及{'、'.join(keywords[:3])}")
            if parts:
                first_sentence = memory.split("。")[0][:40] if "。" in memory else memory[:40]
                return f"{first_sentence}... ({', '.join(parts)})"
        # fallback: 截取首句
        if len(memory) > 60:
            first_sentence = memory.split("。")[0][:60] if "。" in memory else memory[:60]
            return first_sentence + "..."
        return memory

    def _moderate(self, memory: str) -> str:
        """中期记忆 — 保留前两句"""
        sentences = memory.split("。")
        if len(sentences) > 2:
            return "。".join(sentences[:2]) + "..."
        if len(memory) > 120:
            return memory[:120] + "..."
        return memory
