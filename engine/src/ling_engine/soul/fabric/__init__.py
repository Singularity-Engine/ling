"""Memory Fabric — 兼容性 shim，真实代码已迁移到 soul-fabric 包。

所有新代码应使用 `from soul_fabric import ...`。
此文件仅为向后兼容保留，后续版本将删除整个 fabric/ 目录。
"""

# Re-export from the standalone soul_fabric package
from soul_fabric import (  # noqa: F401
    MemoryAtom,
    MemoryState,
    MemoryCapability,
    CapabilityProvider,
    RecallRoutePlan,
    CoverageReport,
    MemoryFabric,
    get_memory_fabric,
    reset_memory_fabric_for_testing,
)

__all__ = [
    "MemoryAtom",
    "MemoryState",
    "MemoryCapability",
    "CapabilityProvider",
    "RecallRoutePlan",
    "CoverageReport",
    "MemoryFabric",
    "get_memory_fabric",
    "reset_memory_fabric_for_testing",
]
