"""
MemoryPort — 统一记忆源抽象接口

所有记忆后端 (Qdrant, EverMemOS, Graphiti, Mem0) 实现此接口。
soul_recall.py 通过 PortRegistry 自动发现并行调用。

设计原则 (🏗️架构师):
- 每个 Port 自带 section_name + priority → context_builder 自动注册
- search() 返回 MemoryResult 而非裸字符串 → 携带来源/置信度元数据
- write() 可选实现 → 部分 Port 只读 (如 collective_wisdom)
- health_check() → 支持 circuit breaker 状态探测
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import List, Optional, Dict, Any


class MemorySource(str, Enum):
    """记忆来源标识 — 用于 context_builder 标注置信度"""
    QDRANT = "qdrant"
    EVERMEMOS = "evermemos"
    GRAPHITI = "graphiti"
    MEM0 = "mem0"
    MONGODB = "mongodb"
    SOUL_INTERNAL = "soul_internal"


@dataclass
class MemoryResult:
    """统一的记忆搜索结果"""
    content: str
    source: MemorySource = MemorySource.SOUL_INTERNAL
    confidence: float = 0.5          # 0-1, 用于 context_builder 排序
    timestamp: Optional[str] = None  # ISO 格式, 用于时序排序
    entity: Optional[str] = None     # 关联实体名 (Graphiti/Mem0)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class MemoryWriteRequest:
    """统一的记忆写入请求"""
    user_id: str
    content: str
    source: MemorySource = MemorySource.SOUL_INTERNAL
    metadata: Dict[str, Any] = field(default_factory=dict)


class MemoryPort(ABC):
    """记忆源抽象基类 — 所有记忆后端的统一接口

    子类需实现:
    - search(): 搜索记忆
    - section_name: context_builder 中的 section 名称
    - priority: 注入优先级 (数字越小越优先)

    可选实现:
    - write(): 写入记忆
    - delete_user_data(): GDPR 删除
    - health_check(): 健康检查
    """

    @abstractmethod
    async def search(
        self,
        query: str,
        user_id: str,
        top_k: int = 3,
        **kwargs,
    ) -> List[MemoryResult]:
        """搜索记忆 — 核心方法"""
        ...

    @property
    @abstractmethod
    def section_name(self) -> str:
        """context_builder 中的 section 标识符"""
        ...

    @property
    @abstractmethod
    def priority(self) -> float:
        """注入优先级 (数字越小越优先, 与 SECTION_PRIORITY 对齐)"""
        ...

    @property
    def port_name(self) -> str:
        """Port 唯一标识名 (默认用 section_name)"""
        return self.section_name

    @property
    def is_always(self) -> bool:
        """是否为 always section (不受预算限制)"""
        return False

    @property
    def timeout_seconds(self) -> float:
        """搜索超时 (秒)"""
        return 0.4

    async def write(self, request: MemoryWriteRequest) -> bool:
        """写入记忆 — 可选实现, 默认不支持"""
        return False

    async def delete_user_data(self, user_id: str) -> int:
        """GDPR: 删除指定用户的所有数据 — 返回删除条数"""
        return 0

    async def health_check(self) -> bool:
        """健康检查 — 用于 circuit breaker"""
        return True

    def format_section(self, results: List[MemoryResult]) -> Optional[str]:
        """将搜索结果格式化为 context_builder section

        子类可覆盖以自定义格式。默认格式: 列表项。
        """
        if not results:
            return None
        items = "\n".join(f"- {r.content}" for r in results[:6])
        return (
            f"<{self.section_name}>\n"
            f"{items}\n"
            f"</{self.section_name}>"
        )
