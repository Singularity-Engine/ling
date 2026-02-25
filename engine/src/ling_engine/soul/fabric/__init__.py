"""Memory Fabric 能力层整合模块。"""

from .atom import MemoryAtom, MemoryState
from .models import MemoryCapability, CapabilityProvider, RecallRoutePlan, CoverageReport
from .service import MemoryFabric, get_memory_fabric, reset_memory_fabric_for_testing

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
