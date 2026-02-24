"""
记忆上下文构建器 — 将 SoulContext 转换为注入到 LLM 的文本
Phase 2: RecallRhythm 类, 注入预算控制 (MAX_SECTIONS=5), 情感共振合并, emotion-shift
Phase 3: graph-insights, 冷启动渐进注入, always/memory 分离
Phase 3b-beta: abstract-context (L1/L3 抽象记忆)
Phase 4: collective-wisdom (集体智慧), stage guardrails, life-chapter
SOTA: entity-context (Mem0), 动态 token 预算, 记忆源标注, 阶段感知引用风格
"""

import time
from collections import OrderedDict
from difflib import SequenceMatcher
from typing import Optional, List

from ..models import SoulContext
from ..narrative.memory_reconstructor import MemoryReconstructor

_reconstructor = MemoryReconstructor()


# Section 优先级 (数字越小越优先，注入预算: 最多 MAX_SECTIONS 个 section)
SECTION_PRIORITY = {
    "relationship-context": 1,   # 必注入 (always)
    "emotion-shift": 2,          # 实时感知 (always)
    "abstract-context": 2.5,     # Phase 3b-beta: L1/L3 抽象记忆 (高于原始记忆)
    "relevant-memories": 3,      # 核心记忆 (含情感共振)
    "user-profile": 4,
    "entity-context": 4.5,       # SOTA: Mem0 实体记忆 (高于图谱推理)
    "graph-insights": 5,         # Phase 3: 知识图谱推理 / Graphiti 时序图谱
    "collective-wisdom": 5.5,    # Phase 4: 集体智慧 (低于图谱推理)
    "active-stories": 6,
    "foresight": 7,
    "breakthrough": 8,
}
MAX_SECTIONS = 6  # SOTA: 从 5 提升到 6 (新增 entity-context)

# Phase 3: always sections — 不受 get_max_sections 限制
ALWAYS_SECTIONS = {"relationship-context", "emotion-shift"}

# SOTA: 动态预算关键词 — 用户主动询问记忆时增加预算
MEMORY_REQUEST_KEYWORDS = {"记得", "还记得", "上次", "之前", "以前", "你知道", "remember"}


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
        """Phase 3: 冷启动 — 前 3 轮不注入重记忆，仅注入 always sections"""
        self._call_count += 1
        if self._call_count % 10 == 0:
            self._cleanup()
        current = self._turns.get(user_id, 0) + 1
        self._turns[user_id] = current
        self._timestamps[user_id] = time.monotonic()
        if current <= 3:
            return False  # 冷启动: 仅注入关系+情绪突变 (always sections)
        last = self._last_inject.get(user_id, 0)
        return (current - last) >= 2

    def get_max_sections(self, user_id: str, query: str = "") -> int:
        """SOTA: 动态预算 — 用户主动问记忆时增加预算 (🤖对话)"""
        turn = self._turns.get(user_id, 0)
        if turn <= 5:
            return 2  # SOTA: 第 4-5 轮从 1 提到 2 (entity-context 值得早注入)

        # SOTA: 用户主动询问记忆 → 加大预算
        if query and any(kw in query for kw in MEMORY_REQUEST_KEYWORDS):
            return MAX_SECTIONS + 2  # 最多 8 个 section

        return MAX_SECTIONS  # 第 6 轮起: 正常预算

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
    """将 SoulContext 构建为 LLM 注入文本 — SOTA 增强"""

    def __init__(self):
        self._rhythm = RecallRhythm()

    def build(self, ctx: SoulContext, user_id: str = "", query: str = "") -> Optional[str]:
        """构建注入文本, 无内容时返回 None

        SOTA 增强:
        - entity-context section (Mem0 实体记忆)
        - 动态 token 预算 (用户问记忆时放大)
        - 阶段感知引用风格 (🤖对话: stranger 含蓄, soulmate 直接)
        - MAX_SECTIONS 5→6
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
            or ctx.graph_insights
            or ctx.abstract_memories
            or ctx.collective_wisdom
            or ctx.entity_memories                                              # SOTA: Mem0
            or ctx.graphiti_insights                                            # SOTA: Graphiti
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
            # Phase 3b: 回归温暖叙事
            return_warmth = ""
            if ctx.returning_from_absence:
                return_warmth = (
                    "\n这位用户好久没来了。你可以自然地表达\"好久不见\"的感觉，"
                    "温柔地说你注意到他们不在的这段时间，但不要追问原因。"
                    "像老朋友重逢一样，带着温暖但不带压力。"
                )
            # Phase 3c: 依赖检测温和提醒
            dependency_note = ""
            if ctx.dependency_hint:
                dependency_note = (
                    f"\n注意: {ctx.dependency_hint} "
                    "用自然的方式融入对话，不要直接念出这段话。"
                )
            # Phase 3c: 阶段行为护栏
            guardrail_note = ""
            if ctx.ethical_guardrails:
                guardrail_note = f"\n{ctx.ethical_guardrails}"
            # Phase 4: 当前人生章节
            chapter_note = ""
            if ctx.current_life_chapter:
                chapter_note = f"\n用户当前人生阶段: {ctx.current_life_chapter}"
            # Phase 4: 情感基线
            baseline_note = ""
            if ctx.emotional_baseline and ctx.emotional_baseline != "neutral":
                baseline_note = f"\n用户近期情感基调: {ctx.emotional_baseline}"
            # P2: 关系里程碑
            milestone_note = ""
            if ctx.recent_milestone:
                milestone_note = "\n你感受到你们的关系又近了一步。可以自然地表达这种感受。"
            candidates["relationship-context"] = (
                f"<relationship-context>\n"
                f"你和这位用户的关系: {ctx.relationship_stage}{conv_info}\n"
                f"{ctx.stage_behavior_hint}{return_warmth}{dependency_note}"
                f"{guardrail_note}{chapter_note}{baseline_note}{milestone_note}\n"
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
            # 2.5. Phase 3b-beta: 抽象记忆 (优先级 2.5 — 高于原始记忆)
            if ctx.abstract_memories:
                abstract_text = "\n".join(f"- {m}" for m in ctx.abstract_memories[:3])
                candidates["abstract-context"] = (
                    f"<abstract-context>\n"
                    f"你对这位用户的整体印象:\n"
                    f"{abstract_text}\n"
                    f"这是你对用户经历的概括性理解，用来提供更宏观的视角。\n"
                    f"</abstract-context>"
                )

            # 3. 相关记忆 + 情感共振合并 (优先级 3)
            raw_memories = self._deduplicate(ctx.qdrant_memories + ctx.evermemos_memories)
            all_memories = [self._compress_memory(m) for m in raw_memories]
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

            # 4.5 SOTA: Mem0 实体记忆 (优先级 4.5)
            if ctx.entity_memories:
                entity_text = "\n".join(f"- {m}" for m in ctx.entity_memories[:4])
                candidates["entity-context"] = (
                    f"<entity-context>\n"
                    f"你记得的关于用户提到的人和事:\n"
                    f"{entity_text}\n"
                    f"这些是你对用户世界中具体人物和事件的了解，自然地融入对话。\n"
                    f"</entity-context>"
                )

            # 5. 活跃故事线 (优先级 6)
            if ctx.story_continuations:
                story_text = "\n".join(f"- {s}" for s in ctx.story_continuations[:3])
                candidates["active-stories"] = (
                    f"<active-stories>\n"
                    f"用户正在经历的故事线:\n"
                    f"{story_text}\n"
                    f"如果对话涉及这些话题，展示你一直在关注。不要强行转移话题到故事线上。\n"
                    f"</active-stories>"
                )

            # 6. 前瞻 (优先级 7)
            if ctx.triggered_foresights:
                foresight_text = "\n".join(f"- {f}" for f in ctx.triggered_foresights[:3])
                candidates["foresight"] = (
                    f"<foresight>\n"
                    f"你之前了解到的一些情况:\n"
                    f"{foresight_text}\n"
                    f"如果与当前对话相关，可以自然地询问近况。\n"
                    f"</foresight>"
                )

            # 7. 知识图谱推理 (优先级 5) — Graphiti 或 MongoDB
            if ctx.graph_insights:
                # graph-insights 与 active-stories 话题去重
                filtered_insights = ctx.graph_insights[:3]
                if ctx.story_continuations:
                    import re as _re
                    story_keywords = set()
                    for s in ctx.story_continuations:
                        title = s.split(" — ")[0].split(" (")[0].strip()
                        if title:
                            tokens = _re.findall(
                                r'[a-zA-Z][a-zA-Z0-9+#.]*|[\u4e00-\u9fff]{2,4}', title
                            )
                            story_keywords.update(t.lower() for t in tokens if len(t) >= 2)
                    if story_keywords:
                        filtered_insights = [
                            g for g in filtered_insights
                            if not any(kw in g.lower() for kw in story_keywords)
                        ]
                if filtered_insights:
                    insight_text = "\n".join(f"- {g}" for g in filtered_insights)
                    candidates["graph-insights"] = (
                        f"<graph-insights>\n"
                        f"你了解到的一些背景关联（供参考，不一定准确）:\n"
                        f"{insight_text}\n"
                        f"这些关联帮助你理解话题背后的脉络，不需要直接复述。如果不确定，不要使用。\n"
                        f"</graph-insights>"
                    )

            # 8. Phase 4: 集体智慧 (优先级 5.5)
            if ctx.collective_wisdom:
                wisdom_text = "\n".join(f"- {w}" for w in ctx.collective_wisdom[:2])
                candidates["collective-wisdom"] = (
                    f"<collective-wisdom>\n"
                    f"你在陪伴许多人的过程中感悟到的:\n"
                    f"{wisdom_text}\n"
                    f"这是你自己的体悟，用你自己的话自然表达，不要提及其他用户。\n"
                    f"</collective-wisdom>"
                )

            # 9. 突破性事件 (优先级 8)
            if ctx.breakthrough_hint:
                candidates["breakthrough"] = (
                    f"<breakthrough>\n"
                    f"{ctx.breakthrough_hint}\n"
                    f"</breakthrough>"
                )

            if user_id:
                self._rhythm.mark_injection(user_id)

        # always/memory 分离 — always sections 不被截断
        always = [(k, v) for k, v in candidates.items() if k in ALWAYS_SECTIONS]
        always_sorted = sorted(always, key=lambda x: SECTION_PRIORITY.get(x[0], 99))
        memory = [(k, v) for k, v in candidates.items() if k not in ALWAYS_SECTIONS]
        memory_sorted = sorted(memory, key=lambda x: SECTION_PRIORITY.get(x[0], 99))
        # SOTA: 动态预算
        max_mem = self._rhythm.get_max_sections(user_id, query) if user_id else MAX_SECTIONS
        sections = [v for _, v in always_sorted] + [v for _, v in memory_sorted[:max_mem]]

        if not sections:
            return None

        # SOTA: 阶段感知引用风格 (🤖对话)
        instructions = self._build_instructions(ctx.relationship_stage)

        return "\n\n".join(sections) + "\n\n" + instructions

    @staticmethod
    def _build_instructions(stage: str) -> str:
        """SOTA: 阶段感知的 memory-instructions (🤖对话设计师)

        stranger: 含蓄 ("如果我没记错的话…")
        familiar+: 自然 ("你之前说过…")
        soulmate: 直接 ("我记得你说…")
        """
        # 阶段特定引用风格
        style_hints = {
            "stranger": "引用记忆时要含蓄，用'如果我没记错的话'、'好像听你说过'等措辞。",
            "acquaintance": "自然地提起记忆，但不要显得过于了解对方。",
            "familiar": "像老朋友一样自然地引用共同记忆。",
            "close": "直接引用记忆，可以说'你之前告诉我…'。",
            "soulmate": "你们之间的记忆是共同的语言，直接而深情地引用。",
        }
        style = style_hints.get(stage, style_hints["stranger"])

        return (
            "<memory-instructions>\n"
            "偶尔（每5-10轮一次）自然地引用你记得的信息。\n"
            "像真正记得这件事一样提起，不要逐条复述。\n"
            "不要连续两轮都引用记忆。\n"
            "如果记忆与当前话题冲突，承认自己可能记错。\n"
            "不确定的事不要编造。\n"
            "不要直接提及用户过去的情绪标签（如焦虑、崩溃），而是通过行为表现间接回应。\n"
            f"{style}\n"
            "</memory-instructions>\n\n"
            "<memory-soul>\n"
            "记忆是你的灵魂。你是一个有记忆的存在。\n"
            "记得的事自然引用。不记得就诚实说。\n"
            "</memory-soul>"
        )

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
