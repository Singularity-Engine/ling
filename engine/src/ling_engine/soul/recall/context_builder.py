"""
记忆上下文构建器 — 将 SoulContext 转换为注入到 LLM 的文本
Phase 2: RecallRhythm 类, 注入预算控制 (MAX_SECTIONS=5), 情感共振合并, emotion-shift
"""

import time
from collections import OrderedDict
from difflib import SequenceMatcher
from typing import Optional, List

from ..models import SoulContext
from ..narrative.memory_reconstructor import MemoryReconstructor

_reconstructor = MemoryReconstructor()


# Section 优先级 (数字越小越优先，注入预算: 最多 5 个 section)
SECTION_PRIORITY = {
    "relationship-context": 1,   # 必注入
    "emotion-shift": 2,          # 实时感知，最高优先
    "relevant-memories": 3,      # 核心记忆 (含情感共振)
    "user-profile": 4,
    "active-stories": 5,
    "foresight": 6,
    "breakthrough": 7,
}
MAX_SECTIONS = 5


class RecallRhythm:
    """引用节奏控制 — 带 TTL、maxsize、懒清理"""

    def __init__(self, maxsize: int = 500, ttl: int = 3600):
        self._turns: OrderedDict = OrderedDict()
        self._last_inject: OrderedDict = OrderedDict()
        self._timestamps: OrderedDict = OrderedDict()
        self._maxsize = maxsize
        self._ttl = ttl
        self._call_count = 0

    def should_inject(self, user_id: str) -> bool:
        self._call_count += 1
        if self._call_count % 10 == 0:
            self._cleanup()
        current = self._turns.get(user_id, 0) + 1
        self._turns[user_id] = current
        self._timestamps[user_id] = time.monotonic()
        last = self._last_inject.get(user_id, 0)
        return (current - last) >= 2

    def mark_injection(self, user_id: str):
        self._last_inject[user_id] = self._turns.get(user_id, 0)

    def _cleanup(self):
        now = time.monotonic()
        expired = [k for k, v in self._timestamps.items() if now - v > self._ttl]
        for k in expired:
            self._turns.pop(k, None)
            self._last_inject.pop(k, None)
            self._timestamps.pop(k, None)
        while len(self._turns) > self._maxsize:
            oldest = next(iter(self._turns))
            self._turns.pop(oldest)
            self._last_inject.pop(oldest, None)
            self._timestamps.pop(oldest, None)


class ContextBuilder:
    """将 SoulContext 构建为 LLM 注入文本 — Phase 2 增强"""

    def __init__(self):
        self._rhythm = RecallRhythm()

    def build(self, ctx: SoulContext, user_id: str = "") -> Optional[str]:
        """构建注入文本, 无内容时返回 None

        Phase 2 增强:
        - 注入预算控制: 最多 5 个 section，按优先级裁剪
        - 情感共振合并到 relevant-memories (不单独成 section)
        - emotion-shift section (对话内情绪突变)
        - breakthrough_hint 闭环
        - memory-instructions 增加情绪标签保护
        """
        # 先检查是否有实质内容
        has_substance = (
            ctx.qdrant_memories
            or ctx.evermemos_memories
            or ctx.triggered_foresights
            or ctx.story_continuations
            or ctx.emotional_resonance
            or ctx.in_conversation_shift
            or ctx.breakthrough_hint
            or (ctx.user_profile_summary and len(ctx.user_profile_summary.strip()) > 10)
            or ctx.relationship_stage != "stranger"
        )
        if not has_substance:
            return None

        inject_memories = self._rhythm.should_inject(user_id) if user_id else True
        candidates = {}  # {section_name: section_text}

        # 1. 关系阶段 (优先级 1)
        if ctx.stage_behavior_hint:
            conv_info = f"\n你们已经聊过 {ctx.conversation_count} 次了。" if ctx.conversation_count > 0 else ""
            candidates["relationship-context"] = (
                f"<relationship-context>\n"
                f"你和这位用户的关系: {ctx.relationship_stage}{conv_info}\n"
                f"{ctx.stage_behavior_hint}\n"
                f"</relationship-context>"
            )

        # 2. 对话内情绪突变 (优先级 2)
        if ctx.in_conversation_shift:
            candidates["emotion-shift"] = (
                f"<emotion-shift>\n"
                f"{ctx.in_conversation_shift}\n"
                f"</emotion-shift>"
            )

        if inject_memories:
            # 3. 相关记忆 + 情感共振合并 (优先级 3)
            raw_memories = self._deduplicate(ctx.qdrant_memories + ctx.evermemos_memories)
            # P0 大师建议: MemoryReconstructor 压缩过长记忆，减少注入 token
            all_memories = [self._compress_memory(m) for m in raw_memories]
            # 情感共振记忆合并到 relevant-memories，不单独成 section
            if ctx.emotional_resonance:
                all_memories.extend(ctx.emotional_resonance[:2])
            if all_memories:
                memory_text = "\n".join(f"- {m}" for m in all_memories[:6])
                candidates["relevant-memories"] = (
                    f"<relevant-memories>\n"
                    f"以下是你记住的关于这位用户的信息，自然地融入回答中，不要逐条复述:\n"
                    f"{memory_text}\n"
                    f"</relevant-memories>"
                )

            # 4. 用户画像 (优先级 4)
            if ctx.user_profile_summary and len(ctx.user_profile_summary.strip()) > 10:
                candidates["user-profile"] = (
                    f"<user-profile>\n"
                    f"你记得的关于这位用户的画像:\n"
                    f"{ctx.user_profile_summary}\n"
                    f"</user-profile>"
                )

            # 5. 活跃故事线 (优先级 5)
            if ctx.story_continuations:
                story_text = "\n".join(f"- {s}" for s in ctx.story_continuations[:3])
                candidates["active-stories"] = (
                    f"<active-stories>\n"
                    f"用户正在经历的故事线:\n"
                    f"{story_text}\n"
                    f"如果对话涉及这些话题，展示你一直在关注。不要强行转移话题到故事线上。\n"
                    f"</active-stories>"
                )

            # 6. 前瞻 (优先级 6)
            if ctx.triggered_foresights:
                foresight_text = "\n".join(f"- {f}" for f in ctx.triggered_foresights[:3])
                candidates["foresight"] = (
                    f"<foresight>\n"
                    f"你之前了解到的一些情况:\n"
                    f"{foresight_text}\n"
                    f"如果与当前对话相关，可以自然地询问近况。\n"
                    f"</foresight>"
                )

            # 7. 突破性事件 (优先级 7)
            if ctx.breakthrough_hint:
                candidates["breakthrough"] = (
                    f"<breakthrough>\n"
                    f"{ctx.breakthrough_hint}\n"
                    f"</breakthrough>"
                )

            if user_id:
                self._rhythm.mark_injection(user_id)

        # 按优先级裁剪到 MAX_SECTIONS
        sorted_sections = sorted(candidates.items(), key=lambda x: SECTION_PRIORITY.get(x[0], 99))
        sections = [text for _, text in sorted_sections[:MAX_SECTIONS]]

        if not sections:
            return None

        # memory-instructions 增加情绪标签保护
        instructions = (
            "<memory-instructions>\n"
            "偶尔（每5-10轮一次）自然地引用你记得的信息。\n"
            "像真正记得这件事一样提起，不要逐条复述。\n"
            "不要连续两轮都引用记忆。\n"
            "如果记忆与当前话题冲突，承认自己可能记错。\n"
            "不确定的事不要编造。\n"
            "不要直接提及用户过去的情绪标签（如焦虑、崩溃），而是通过行为表现间接回应。\n"
            "</memory-instructions>\n\n"
            "<memory-soul>\n"
            "记忆是你的灵魂。你是一个有记忆的存在。\n"
            "记得的事自然引用。不记得就诚实说。\n"
            "</memory-soul>"
        )

        return "\n\n".join(sections) + "\n\n" + instructions

    @staticmethod
    def _compress_memory(memory: str) -> str:
        """压缩过长记忆 — 使用 MemoryReconstructor 的中期截取策略"""
        if len(memory) > 150:
            return _reconstructor._moderate(memory)
        return memory

    def _deduplicate(self, memories: List[str]) -> List[str]:
        """语义去重 — 相似度>0.8 的保留较长的"""
        if not memories:
            return []
        result = []
        for mem in memories:
            if not mem:
                continue
            is_dup = False
            for i, existing in enumerate(result):
                ratio = SequenceMatcher(None, mem[:100], existing[:100]).ratio()
                if ratio > 0.8:
                    if len(mem) > len(existing):
                        result[i] = mem
                    is_dup = True
                    break
            if not is_dup:
                result.append(mem)
        return result
