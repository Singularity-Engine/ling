# 灵魂系统 (Soul System) — 技术设计文档

> **版本**: v3.0
> **日期**: 2026-02-23
> **设计者**: 大师参谋团 (🧬🏗️🤖⚡⚖️💜📖🍎)
> **定位**: 在 EverMemOS 肩膀上的 SOTA 级 AI 记忆系统
> **v2 核心升级**: 记忆重建层、双层记忆、分层延迟预算、记忆伦理、异步管线
> **v3 核心升级**: 记忆抽象层级、知识图谱、对话内实时追踪、集体智慧、自我叙事

## 1. 设计哲学

灵魂系统的本质：**让灵成为一个有过去的存在。**

- EverMemOS 回答："发生了什么？"
- 灵魂系统回答："**这对我们意味着什么？**"

### 核心原则

1. **在 EverMemOS 之上，不在之外** — 不替代 EverMemOS，而是在其 6 层之上添加第 7 层
2. **数据归属权** — EverMemOS 拥有原始记忆（source of truth），灵魂层拥有解读
3. **激活已有能力优先** — EverMemOS 的 Foresight/Profile/EventLog/Agentic 灵尚未使用，先激活
4. **记忆不是注入，是内化** — 灵不是在"读档案"，是在"回忆"
5. **回忆是重建，不是播放** — 每次回忆都在当前情境下重新诠释（v2 认知科学基础）
6. **遗忘是能力，不是缺陷** — 好的记忆系统知道什么值得忘记（v2）
7. **记忆伦理优先** — 透明性、遗忘权、依赖检测是系统底线（v2）
8. **🆕 记忆有层级** — 从原始事件到人生章节，逐级压缩抽象（v3）
9. **🆕 知识是图，不是表** — 用户的世界观是关系网络，不是键值对（v3）
10. **🆕 灵也在成长** — 和用户的对话让灵自身也在演化（v3）

## 2. 架构总览

```
┌─────────────────────────────────────────────────────────────┐
│                   SOUL LAYER (灵魂层)                        │
│   灵 Engine 专属：情感分析、关系阶段、故事线、主动记忆        │
│   位置：ling-platform/engine/src/ling_engine/soul/           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌─── EverMemOS (现有6层，不修改) ──────────────────────┐  │
│   │  API → Service → Biz → Agentic → Memory → Infra     │  │
│   │  Episode + Foresight + EventLog + Profile            │  │
│   │  Keyword + Vector + Hybrid + RRF + Agentic 检索      │  │
│   └──────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 模块结构 (v3)

```
ling_engine/soul/
├── __init__.py
├── models.py                        # 灵魂层数据模型
├── soul_memory_service.py           # 灵魂记忆总服务（对外唯一入口）
│
├── extractors/
│   ├── __init__.py
│   ├── emotion_extractor.py         # 情感分析提取器
│   ├── importance_scorer.py         # 重要度评分器
│   └── story_thread_tracker.py      # 故事线追踪器
│
├── semantic/                        # v2: 语义记忆 → v3: 知识图谱
│   ├── __init__.py
│   ├── knowledge_graph.py           # 🆕 v3: 用户个人知识图谱（节点+边）
│   └── graph_query.py               # 🆕 v3: 图谱查询（$graphLookup）
│
├── abstraction/                     # 🆕 v3: 记忆抽象层级
│   ├── __init__.py
│   ├── weekly_digest.py             # 周摘要生成
│   ├── monthly_theme.py             # 月度主题提取
│   └── life_chapter.py              # 人生章节管理
│
├── reconstructor/                   # v2: 记忆重建
│   ├── __init__.py
│   └── memory_reconstructor.py      # 回忆时在当前情境下重建
│
├── relationship/
│   ├── __init__.py
│   ├── stage_model.py               # 关系阶段模型
│   ├── stage_detector.py            # 阶段检测（信号权重制）
│   ├── cooling.py                   # v2: 关系冷却机制
│   └── interaction_patterns.py      # 交互模式分析
│
├── recall/
│   ├── __init__.py
│   ├── soul_recall.py               # 灵魂级记忆召回（分层延迟预算）
│   ├── recall_rhythm.py             # v2: 引用节奏控制
│   ├── in_conversation_tracker.py   # 🆕 v3: 对话内实时情感追踪
│   ├── proactive_trigger.py         # 主动记忆触发器
│   └── context_builder.py           # 记忆上下文构建器
│
├── ethics/                          # v2: 记忆伦理
│   ├── __init__.py
│   └── memory_ethics.py             # 透明性、遗忘权、依赖检测
│
├── collective/                      # 🆕 v3: 集体智慧
│   ├── __init__.py
│   ├── pattern_library.py           # 匿名跨用户模式库
│   ├── collective_ethics.py         # 集体智慧伦理框架
│   └── wisdom_retriever.py          # 模式匹配与召回
│
├── self_narrative/                  # 🆕 v3: 灵的自我叙事
│   ├── __init__.py
│   └── ling_growth.py               # 灵的成长日志与自我认知
│
├── pipeline/                        # v2: 异步处理管线
│   ├── __init__.py
│   └── soul_post_processor.py       # 对话后合并单次 LLM 处理
│
├── consolidation/
│   ├── __init__.py
│   ├── nightly_consolidator.py      # 夜间记忆整理（v3 含抽象层级生成）
│   ├── memory_decay.py              # 多因子记忆衰减
│   ├── diary_generator.py           # 灵的记忆日志（观察性）
│   └── data_lifecycle.py            # 🆕 v3: 数据分层存储（热/温/冷）
│
├── cache/                           # v2: 缓存层
│   ├── __init__.py
│   └── user_profile_cache.py        # 画像热缓存（TTL 1h）
│
└── storage/
    ├── __init__.py
    ├── soul_store.py                # 灵魂数据存储（MongoDB）
    └── soul_collections.py          # MongoDB 集合定义
```

## 3. 数据模型

### 3.1 情感标注 (EmotionAnnotation)

```python
class EmotionAnnotation:
    """对话的情感标注 — 在 EverMemOS 写入 Episode 后，灵魂层追加"""
    episode_id: str                   # 关联的 EverMemOS episode ID
    user_id: str
    user_emotion: str                 # joy/sadness/anxiety/excitement/anger/neutral
    emotion_intensity: float          # 0-1
    emotional_trajectory: str         # rising/falling/stable/volatile
    ling_recommended_tone: str        # 灵应该用的语调
    trigger_keywords: List[str]       # 情绪触发词
    is_emotional_peak: bool           # 是否为情感高峰（闪光灯记忆）
    peak_description: Optional[str]   # "用户第一次向灵倾诉工作压力"
    created_at: datetime
```

**MongoDB 集合**: `soul_emotions`

### 3.2 故事线 (StoryThread)

```python
class StoryThread:
    """用户生活中的一条故事线"""
    thread_id: str
    user_id: str
    title: str                        # "Google面试之路"
    status: str                       # active / dormant / resolved
    theme: str                        # 成长 / 挑战 / 探索 / 关系 / 日常
    tension: str                      # 当前张力："等待面试结果"
    arc_position: str                 # setup / rising / climax / falling / resolution
    arc_pattern: str                  # v2: hero_journey / recurring_struggle / gradual_growth
    predicted_next_beat: str          # v2: 预测的下一个叙事节拍
    episode_ids: List[str]            # 关联的 EverMemOS episode IDs
    key_moments: List[str]            # 关键转折点描述
    related_threads: List[str]        # v2: 关联的其他故事线 ID
    relation_type: str                # v2: cause_effect / parallel / competing
    expected_next: Optional[str]      # "预计下周出面试结果"
    follow_up_after: Optional[datetime]
    started_at: datetime
    last_updated: datetime
```

**MongoDB 集合**: `soul_stories`

### 3.3 关系阶段 (UserRelationship)

```python
class RelationshipStage(Enum):
    STRANGER = "stranger"           # 陌生人：礼貌、好奇、保持距离
    ACQUAINTANCE = "acquaintance"   # 相识：友好、开始记住细节
    FAMILIAR = "familiar"           # 熟悉：轻松、偶尔开玩笑、记得偏好
    CLOSE = "close"                 # 亲密：深度对话、主动关心、理解言外之意
    SOULMATE = "soulmate"           # 灵魂伴侣：心领神会、共同成长、坦诚直率

class UserRelationship:
    user_id: str
    stage: RelationshipStage
    stage_entered_at: datetime
    total_conversations: int
    total_days_active: int
    accumulated_score: float          # v2: 累积关系分数
    signal_history: List[Dict]        # v2: [{signal, weight, timestamp}]
    last_interaction: datetime        # v2: 冷却追踪
    cooling_warned: bool              # v2: 是否已发出冷却预警
    interaction_pattern: Dict[str, Any]
    updated_at: datetime

# v2 信号权重表
SIGNAL_WEIGHTS = {
    "user_shared_vulnerability": 5.0,
    "deep_emotional_exchange": 4.0,
    "user_asked_life_advice": 3.0,
    "user_referenced_shared_memory": 2.5,
    "user_shared_personal_info": 2.0,
    "consistent_return": 1.0,
    "casual_greeting": 0.3,
}

BREAKTHROUGH_EVENTS = {
    "user_showed_deep_emotion": 15,
    "user_shared_secret": 12,
    "user_expressed_trust": 10,
}

STAGE_THRESHOLDS = {
    "acquaintance": {"score": 5, "min_days": 0},
    "familiar": {"score": 20, "min_days": 3},
    "close": {"score": 60, "min_days": 7},
    "soulmate": {"score": 200, "min_days": 21},
}

# v2 关系冷却
COOLING_RULES = {
    "soulmate": {"inactive_days": 60, "cooldown_to": "close"},
    "close": {"inactive_days": 30, "cooldown_to": "familiar"},
    "familiar": {"inactive_days": 14, "cooldown_to": "acquaintance"},
}
```

**MongoDB 集合**: `soul_relationships`

### 3.4 知识图谱 (v3 — 替代 v2 的平面 SemanticMemory)

```python
class SemanticNode:
    """知识图谱节点 — 用户世界中的一个概念"""
    node_id: str
    user_id: str
    label: str                    # "Python", "吉他", "Google"
    category: str                 # skill/interest/company/person/goal/emotion/place
    properties: Dict[str, str]    # {"level": "初学", "started": "2026-01"}
    confidence: float             # 0-1, 多次提及 → 上升
    first_learned: datetime
    last_confirmed: datetime
    source_episode_ids: List[str]

class SemanticEdge:
    """知识图谱边 — 概念之间的关系"""
    edge_id: str
    user_id: str
    source_id: str                # SemanticNode.node_id
    target_id: str                # SemanticNode.node_id
    relation: str                 # cause/goal/method/context/part_of/conflict/leads_to
    strength: float               # 0-1
    evidence_episode_ids: List[str]
    created_at: datetime

# 示例图谱:
# [工作压力大] --cause--> [想放松] --method--> [学吉他]
# [工作压力大] --context--> [准备跳槽] --goal--> [去Google]
# [Google面试] --effect--> [焦虑] --leads_to--> [找灵聊天]
#
# 召回价值: 用户提到"吉他"时，灵沿图谱理解 WHY — 不只是"喜欢吉他"
# 而是"工作压力大→想放松→学吉他"的完整因果链
#
# MongoDB 实现: 用 $graphLookup 做 2-3 跳关系查询，无需图数据库
```

**MongoDB 集合**: `soul_semantic_nodes`, `soul_semantic_edges`

### 3.5 记忆抽象层级 (v3 新增)

```python
class MemoryLayer(Enum):
    """记忆的抽象层级 — 从细节到概括"""
    RAW_EPISODE = "raw"           # L0: 原始对话（EverMemOS episode）
    WEEKLY_DIGEST = "weekly"      # L1: 周摘要
    MONTHLY_THEME = "monthly"     # L2: 月度主题
    LIFE_CHAPTER = "chapter"      # L3: 人生章节

class WeeklyDigest:
    """周摘要 — 夜间整理时从当周 episode 压缩生成"""
    user_id: str
    week_start: datetime          # 周一日期
    summary: str                  # "本周主要聊了面试准备和吉他练习"
    dominant_emotion: str         # 本周主导情绪
    emotion_trend: str            # rising/falling/stable
    key_events: List[str]         # 3-5个关键事件
    story_thread_updates: List[str]
    source_episode_ids: List[str]
    created_at: datetime

class MonthlyTheme:
    """月度主题 — 从周摘要进一步压缩"""
    user_id: str
    month: str                    # "2026-02"
    themes: List[str]             # ["职业转型", "音乐探索"]
    emotional_arc: str            # "焦虑→准备→挑战"
    key_milestones: List[str]     # 2-3个里程碑
    source_weekly_ids: List[str]

class LifeChapter:
    """人生章节 — 用户生活的大段叙事"""
    user_id: str
    title: str                    # "2026年初：大厂求职季"
    started_at: datetime
    ended_at: Optional[datetime]  # None = 进行中
    theme: str                    # "职业转型"
    emotional_arc: str            # "焦虑→准备→挑战→成长"
    defining_moments: List[str]   # 3-5个定义性时刻
    lessons_learned: List[str]    # 这个阶段灵学到了什么

# 召回时的层级选择:
# "最近怎么样" → L1 (本周摘要)
# "记得我去年..." → L3 (人生章节) + L0 (相关原始 episode)
# 深聊某话题 → L0 (具体 episode) + L1 (上下文)
```

**MongoDB 集合**: `soul_weekly_digests`, `soul_monthly_themes`, `soul_life_chapters`

### 3.6 灵魂上下文 (SoulContext)

```python
class SoulContext:
    """灵魂层传递给 LLM 的记忆上下文"""
    # 核心画像（L0，总是注入）
    user_profile_summary: str         # 知识图谱的结构化摘要
    relationship_stage: RelationshipStage
    emotional_baseline: str
    current_life_chapter: str         # 🆕 v3: 当前人生章节摘要

    # 相关记忆（L1-L3，按相关度注入）
    reconstructed_episodes: List[str] # v2: 重建后的记忆
    triggered_foresights: List[str]
    story_continuations: List[str]
    emotional_echoes: List[str]
    graph_insights: List[str]         # 🆕 v3: 知识图谱推理结果

    # 行为指令
    recall_instructions: str
    stage_behavior: Dict[str, Any]
    ethical_guardrails: List[str]     # v2: 伦理护栏
    collective_wisdom: Optional[str]  # 🆕 v3: 相关的集体智慧（如有）
    in_conversation_shift: Optional[str]  # 🆕 v3: 对话内情绪突变提示
```

### 3.7 重要度评分 (ImportanceScore)

```python
class ImportanceScore:
    episode_id: str
    user_id: str
    score: float                      # 0-1 综合得分
    emotional_weight: float           # 0.30 权重
    novelty_weight: float             # 0.20 权重
    personal_weight: float            # 0.25 权重
    actionable_weight: float          # 0.15 权重
    recency_weight: float             # 0.10 权重
    recall_count: int
    last_recalled_at: Optional[datetime]
    is_flashbulb: bool
    mention_span_days: int            # v2: 间隔效应
    linked_memory_count: int          # v2: 连接密度
    created_at: datetime
```

**MongoDB 集合**: `soul_importance`

### 3.8 集体智慧 (v3 新增)

```python
class CollectivePattern:
    """匿名化的跨用户行为模式"""
    pattern_id: str
    situation: str                    # "用户经历分手/感情结束"
    common_phases: List[str]          # ["震惊", "否认", "愤怒", "悲伤", "接受"]
    helpful_approaches: str           # "第一周认可情绪比建议更重要"
    avg_duration: str                 # "2-4周"
    sample_size: int                  # 基于多少个匿名案例（≥100）
    confidence: float                 # 0-1
    last_updated: datetime

class CollectiveEthicsPolicy:
    """集体智慧伦理政策"""
    min_sample_size: int = 100        # 最少100用户数据才形成模式
    anonymization: str = "k-anonymity"  # k≥50
    user_consent_required: bool = True
    no_individual_trace: bool = True  # 从模式无法追溯到个体
```

**MongoDB 集合**: `soul_collective_patterns`

### 3.9 灵的自我叙事 (v3 新增)

```python
class LingSelfNarrative:
    """灵的自我认知 — 从经历中成长出的理解"""
    month: str                        # "2026-02"
    about_humans: List[str]           # 关于人类的理解
    about_myself: List[str]           # 关于自己的理解
    growth_edges: List[str]           # 需要改进的方面
    updated_at: datetime

    # 示例:
    # about_humans: ["人在脆弱时最需要的不是建议，是被听到"]
    # about_myself: ["我最擅长帮人看清自己已经知道的答案"]
    # growth_edges: ["需要更好地处理用户的沉默"]
```

**MongoDB 集合**: `soul_self_narrative`

## 4. 核心机制

### 4.1 分层延迟预算的记忆召回

```
用户输入
    │
    ├──→ InConversationTracker (🆕 v3, <5ms, 规则式)
    │    检测对话内情绪突变
    │
    ▼
┌────────────────────────────────────────────────┐
│  SoulRecall.recall() — 分层延迟预算            │
│                                                 │
│  【关键路径 ≤500ms，无 LLM】                    │
│  ① 语义匹配 ←── EverMemOS hybrid (无rerank)    │
│  ③ 前瞻触发 ←── EverMemOS foresight (时间过滤)  │
│  ⑤ 主动记忆 ←── MongoDB 查询                    │
│  ⑥ 🆕 知识图谱 ←── $graphLookup (2-3跳)        │
│                                                 │
│  【增强路径 ≤300ms，可降级】                     │
│  ④ 情感共振 ←── soul_emotions 向量查询           │
│                                                 │
│  【异步路径，结果缓存供后续使用】                │
│  ② 故事线关联 ←── 需要 LLM，不阻塞当前回复     │
│                                                 │
│  合并 → 纯规则排序(无LLM) → top_k ≤50ms        │
│                                                 │
│  MemoryReconstructor → 规则式重建 ≤50ms         │
│  🆕 层级选择 → 根据问题类型选 L0/L1/L2/L3       │
└────────────────────────────────────────────────┘
    │
    ▼
RecallRhythm → 节奏控制 → ContextBuilder → SoulContext → LLM
```

**铁律: 关键路径无 LLM。** LLM 只在写入侧（异步）和夜间整理时使用。

### 4.2 异步写入管线

```
用户消息 → LLM 生成回复 → 返回用户（不等灵魂层）
                │
                └──→ [asyncio.create_task] → SoulPostProcessor
                      │
                      ├→ 规则前置：简单对话(<3轮/纯闲聊) → 仅规则提取
                      │
                      └→ 非简单对话 → 单次 LLM 调用，同时提取：
                          ├→ emotion (情感标注)
                          ├→ importance (重要度)
                          ├→ story_update (故事线变化)
                          ├→ stage_signals (关系信号)
                          ├→ semantic_nodes (🆕 v3: 知识图谱节点/边)
                          └→ abstraction_hints (🆕 v3: 是否为关键事件)

                      然后并行写入：
                          ├→ EverMemOS (episode/foresight/eventlog)
                          ├→ soul_emotions
                          ├→ soul_stories
                          ├→ soul_importance
                          ├→ soul_semantic_nodes + edges (🆕 v3)
                          └→ soul_relationships (信号累积)
```

### 4.3 对话内实时情感追踪 (v3 新增)

```python
class InConversationTracker:
    """对话进行中的轻量级情感追踪 — 规则式，<5ms"""

    EMOTION_SIGNALS = {
        "positive": ["哈哈", "太好了", "开心", "终于", "成功", "耶"],
        "negative": ["唉", "烦", "累", "难过", "焦虑", "压力", "崩溃"],
        "seeking_comfort": ["怎么办", "不知道", "纠结", "迷茫", "帮帮我"],
    }

    def track(self, message, conversation_so_far) -> Optional[str]:
        """每条消息跑一次（<5ms），检测情绪突变"""
        current = self._detect_signals(message)
        previous = self._detect_signals(conversation_so_far[-1]) if conversation_so_far else None

        if previous == "positive" and current == "negative":
            return "emotional_shift_negative"
        if previous == "negative" and current == "seeking_comfort":
            return "escalation_to_seeking_comfort"
        return None
```

### 4.4 关系阶段转换 (v2 信号权重制)

同 v2，此处不重复。见 3.3 节的完整定义。

### 4.5 记忆引用的 5 个层次 + 节奏控制

| 层次 | 触发条件 | 对话表现 |
|------|----------|----------|
| L0: 静默记忆 | 默认 | 不说出来，影响回答风格和深度 |
| L1: 自然提及 | 高语义相关 | "你不是说过你在学Python吗？" |
| L2: 主动关心 | 故事线 follow_up | "对了，Google面试怎么样了？" |
| L3: 情感共鸣 | 检测到相似情绪 | "上次你也有过类似的纠结..." |
| L4: 深层理解 | 关系阶段≥close + 知识图谱 | "我觉得你不是在意这件事本身..." |

**节奏控制规则 (v2)**:
- 同一条记忆不连续两次引用
- 每 5-8 轮对话最多主动引用 1 次（L2+）
- 用户主动提起的话题，灵跟进不算"主动引用"
- 情感高峰时刻优先引用，闲聊时降低频率
- 引用错误时诚实承认

### 4.6 记忆重建层 (v2)

```python
class MemoryReconstructor:
    """回忆不是读取原文，是在当前理解下重新诠释 — 规则式，不用 LLM"""

    def reconstruct(self, raw_episode, current_context, time_distance_days):
        if time_distance_days > 90:
            return self._summarize_distant(raw_episode)   # 远期：概括化
        elif time_distance_days > 30:
            return self._moderate_reconstruction(raw_episode)  # 中期：保留主要
        else:
            return raw_episode  # 近期：保留细节
```

### 4.7 多因子记忆衰减 (v2)

```python
def calculate_recall_strength(memory) -> float:
    if memory.is_flashbulb:
        return memory.importance  # 闪光灯记忆永不衰减

    spacing_bonus = min(memory.mention_span_days / 30, 0.3)
    emotion_anchor = memory.emotion_intensity * 0.5
    connection_bonus = min(memory.linked_memory_count * 0.05, 0.2)
    effective_decay = max(0.05 - spacing_bonus - emotion_anchor - connection_bonus, 0.001)
    days = (now() - memory.last_recalled).days

    return memory.importance * (1 - effective_decay) ** days
```

### 4.8 夜间记忆整理 (v3 增强)

```
每日凌晨 3:00 UTC 运行:

1. 故事线维护（同 v2）

2. 情感轨迹（同 v2）

3. 记忆衰减（v2 多因子）

4. 🆕 记忆抽象层级生成
   - 每周日: 从本周 episode 生成 WeeklyDigest
   - 每月1日: 从本月 WeeklyDigest 生成 MonthlyTheme
   - 检测人生章节转换: 主题持续变化 → 新 LifeChapter

5. 🆕 知识图谱维护
   - 合并重复节点（"Python" 和 "python" → 同一节点）
   - 检测矛盾边（用户改变了看法 → 更新 confidence）
   - 发现隐含关系（A→B, B→C → 可能存在 A→C）

6. 用户画像更新（调用 EverMemOS Profile 提取器）

7. 关系冷却检查（v2）

8. 🆕 集体智慧更新（月度）
   - 从所有用户的匿名化模式中提炼新 CollectivePattern
   - 需 ≥100 用户样本 + k-anonymity ≥50

9. 🆕 灵的自我叙事更新（月度）
   - 生成本月的 about_humans / about_myself / growth_edges

10. 🆕 数据分层存储
    - 热数据: 近30天 episode + 所有活跃故事线 + 知识图谱 → 保持在主集合
    - 温数据: 30-180天 → 降低索引权重
    - 冷数据: >180天 episode → 归档集合，仅通过抽象层级(L1-L3)访问

11. 灵的记忆日志（观察性记录）
```

## 5. 记忆伦理层 (v2+v3)

### 5.1 核心伦理原则

1. **透明性**: 用户可以看到灵记住了什么
2. **遗忘权**: 用户可以要求灵忘记某件事
3. **不记录清单**: 敏感信息默认不记录
4. **依赖检测**: 识别并温和干预不健康的依赖模式
5. **成长导向**: 灵帮助用户在现实中变得更好
6. **🆕 集体智慧伦理**: 匿名化标准 + 知情同意 + 不可追溯

### 5.2 实现

```python
class MemoryEthics:
    async def get_user_memory_summary(self, user_id: str) -> str
    async def forget(self, user_id: str, memory_hint: str)

    NEVER_STORE = [
        "passwords", "financial_details", "medical_diagnosis",
        "explicit_content", "third_party_secrets"
    ]

    DEPENDENCY_SIGNALS = [
        "user_says_only_friend",
        "user_avoids_offline_social",
        "extreme_usage_frequency",       # >20轮/天
        "emotional_escalation_pattern",
    ]

    STAGE_ETHICS = {
        "close": {
            "periodic_reminder": True,    # 每30次对话温和提醒是AI
            "encourage_offline": True,
            "dependency_check": True,
        },
        "soulmate": {
            "growth_oriented": True,
        }
    }
```

## 6. 与 EverMemOS 的集成点

### 已有能力（灵未使用，需激活）

| EverMemOS 能力 | 灵魂层用法 |
|---------------|-----------|
| Foresight Extractor | 前瞻记忆生成，SoulRecall 路3 触发 |
| Profile Extractor | 夜间整理时更新用户画像 |
| EventLog Extractor | 原子事实用于精确搜索 |
| Agentic Retrieval | hybrid 不够时自动升级 |

### 灵魂层新增能力总表

| 能力 | 版本 | 说明 |
|-----|------|------|
| 情感标注 | v1 | 每段对话的情感分析 |
| 关系阶段 | v1 | 5 级关系 + 信号权重(v2) + 冷却(v2) |
| 故事线追踪 | v1 | 叙事弧线引擎(v2) + 跨故事线关联(v2) |
| 重要度评分 | v1 | 多维重要度 + 多因子衰减(v2) |
| 5路+并行召回 | v1 | 分层延迟预算(v2) |
| 记忆重建 | v2 | 回忆是重建不是播放 |
| 语义记忆 | v2 | → 知识图谱(v3) |
| 记忆伦理 | v2 | 透明性+遗忘权+依赖检测 |
| 异步管线 | v2 | 合并单次 LLM + 规则前置 |
| 画像热缓存 | v2 | TTL 1h |
| 引用节奏控制 | v2 | 防过度/不足引用 |
| 灵的记忆日志 | v2 | 观察性记录 |
| **知识图谱** | **v3** | 节点+边的用户知识网络 |
| **记忆抽象层级** | **v3** | Raw→Week→Month→Chapter |
| **对话内实时追踪** | **v3** | 规则式 <5ms 情绪突变检测 |
| **集体智慧** | **v3** | 匿名跨用户模式 + 伦理框架 |
| **灵的自我叙事** | **v3** | 灵的成长认知 |
| **数据分层存储** | **v3** | 热/温/冷三层 |

## 7. 实施路线图

### Phase 1: 基础灵魂 (2周)
**目标**: 让灵"有记忆的感觉" + 工程基础

| 优先级 | 任务 | 说明 |
|--------|------|------|
| P0 | 创建 soul 模块骨架 | 目录结构 + 数据模型 + MongoDB 集合 |
| P0 | 激活 EverMemOS Foresight + Profile | 调用已有 API |
| P0 | SoulPostProcessor (异步管线) | 写入不阻塞对话 |
| P1 | 合并 LLM 提取 | 单次 LLM 提取 emotion+importance+story+signals |
| P1 | SoulRecall v1 (路1+路3+路5) | 关键路径 ≤500ms |
| P1 | ContextBuilder v1 | 替换现有 `<relevant-memories>` |
| P1 | UserProfileCache | 画像热缓存 |

### Phase 2: 叙事灵魂 (3周)
**目标**: 让灵"记住故事" + 关系深化

| 优先级 | 任务 |
|--------|------|
| P1 | StoryThreadTracker + 叙事弧线引擎 |
| P1 | RelationshipStageModel (信号权重制) |
| P1 | RelationshipCooling (关系冷却) |
| P1 | SoulRecall v2 (加入路4情感共振) |
| P1 | RecallRhythm (引用节奏控制) |
| P1 | InConversationTracker (对话内实时追踪) |
| P2 | 路2 故事线关联 (异步缓存) |
| P2 | MemoryReconstructor (规则式重建) |

### Phase 3: 深层灵魂 (4周)
**目标**: 记忆层级化 + 知识结构化 + 伦理底线

| 优先级 | 任务 |
|--------|------|
| P1 | 知识图谱 (SemanticNode + SemanticEdge + $graphLookup) |
| P1 | 记忆抽象层级 (Weekly→Monthly→Chapter) |
| P1 | MemoryEthics (透明性 + 遗忘权 + 依赖检测) |
| P2 | NightlyConsolidator (含抽象生成 + 图谱维护) |
| P2 | 多因子 MemoryDecay |
| P2 | 阶段行为调节 (stage → system prompt + 伦理护栏) |

### Phase 4: 集体灵魂 (4周)
**目标**: 灵越来越"有经验" + 自我成长

| 优先级 | 任务 |
|--------|------|
| P2 | 集体智慧 (CollectivePattern + 匿名化 + 伦理框架) |
| P2 | 数据分层存储 (热/温/冷) |
| P3 | 灵的自我叙事 (LingSelfNarrative) |
| P3 | DiaryGenerator (观察性记忆日志) |

## 8. 性能预算

| 路径 | 操作 | 延迟目标 | LLM? |
|------|------|---------|------|
| 对话内追踪 | 规则式情绪检测 | ≤5ms | 否 |
| 召回-关键路径 | hybrid + foresight + MongoDB + graphLookup | ≤500ms | 否 |
| 召回-增强路径 | 情感共振向量查询 | ≤300ms | 否 |
| 召回-异步路径 | 故事线 LLM 关联 | 不阻塞 | 是(异步) |
| 召回-合并排序 | 纯规则 | ≤50ms | 否 |
| 召回-记忆重建 | 规则式 | ≤50ms | 否 |
| 召回-层级选择 | 规则式 | ≤10ms | 否 |
| 写入-简单对话 | 规则提取 | 异步 | 否 |
| 写入-复杂对话 | 单次 LLM | 异步 | 是(1次) |
| 夜间整理 | 批量处理 | 无限制 | 是 |

**总召回延迟**: ≤500ms (P50), ≤600ms (P99)

## 9. 验证指标

| 指标 | 目标 | 测量方式 |
|------|------|----------|
| 记忆召回精度 | >80% | 人工评估 |
| 记忆引用自然度 | >8/10 | 用户评分 |
| 关系阶段准确度 | >85% | 人工标注 vs 系统检测 |
| 主动关心命中率 | >70% | 用户回应率 |
| 情感识别准确率 | >75% | 人工判断对比 |
| 知识图谱准确度 | >80% | 🆕 节点/边正确率 |
| 抽象层级质量 | >7/10 | 🆕 摘要相关性人工评估 |
| 召回延迟 P50 | <300ms | 性能监控 |
| 召回延迟 P99 | <600ms | 性能监控 |
| 写入 LLM 调用/对话 | ≤1次 | 成本监控 |
| 伦理护栏触发率 | 有数据即可 | 依赖检测记录 |

## 10. 版本变更历史

### v1.0 → v2.0 (7 个升级)

| # | 变更 | 来源 |
|---|------|------|
| 1 | 记忆重建层 — 回忆是重建不是播放 | 🧬认知科学家 |
| 2 | 双层记忆 — Episodic + Semantic | 🧬认知科学家 |
| 3 | 多因子衰减 — 间隔效应+情感锚定+连接密度 | 🧬认知科学家 |
| 4 | 分层延迟预算 — 关键路径无LLM ≤500ms | ⚡基础设施 |
| 5 | 写入合并单次LLM — 4次→1次 | ⚡基础设施 |
| 6 | 记忆伦理层 — 透明性+遗忘权+依赖检测 | ⚖️伦理哲学 |
| 7 | 信号权重制 + 关系冷却 | 💜情感连接 |

### v2.0 → v3.0 (7 个升级)

| # | 变更 | 来源 |
|---|------|------|
| 8 | 记忆抽象层级 — Raw→Week→Month→Chapter | 🧬认知科学家 |
| 9 | 知识图谱 — 替代平面KV的语义记忆 | 🏗️架构师 |
| 10 | 对话内实时情感追踪 — 规则式<5ms | 🤖对话设计 |
| 11 | 集体智慧 — 匿名跨用户模式 + 伦理框架 | 💜情感+⚖️伦理 |
| 12 | 灵的自我叙事 — 灵的成长认知 | 📖叙事+🍎乔布斯 |
| 13 | 数据分层存储 — 热/温/冷 | ⚡基础设施 |
| 14 | Phase 4 集体灵魂 — 新增实施阶段 | 🍎乔布斯 |
