"""
PortRegistry — 记忆源注册中心

管理所有 MemoryPort 实例的生命周期:
- 注册/注销 Port
- Circuit breaker: 连续失败 N 次 → 暂停调用 M 秒
- 按优先级排序输出 active ports
- 健康状态追踪
"""

import asyncio
import time
from collections import OrderedDict
from typing import Dict, List, Optional, Tuple

from loguru import logger

from .memory_port import MemoryPort, MemoryResult

# Circuit breaker 配置
CB_FAILURE_THRESHOLD = 3    # 连续失败 N 次触发熔断
CB_RECOVERY_SECONDS = 300   # 熔断后 5 分钟恢复


class _CircuitState:
    """单个 Port 的熔断状态"""
    __slots__ = ("failures", "last_failure", "is_open")

    def __init__(self):
        self.failures: int = 0
        self.last_failure: float = 0.0
        self.is_open: bool = False

    def record_failure(self):
        self.failures += 1
        self.last_failure = time.monotonic()
        if self.failures >= CB_FAILURE_THRESHOLD:
            self.is_open = True
            logger.warning(
                f"[PortRegistry] Circuit breaker OPEN after {self.failures} failures"
            )

    def record_success(self):
        if self.failures > 0:
            self.failures = 0
            self.is_open = False

    def is_available(self) -> bool:
        if not self.is_open:
            return True
        # 半开状态: 超过恢复时间后允许一次尝试
        if (time.monotonic() - self.last_failure) > CB_RECOVERY_SECONDS:
            return True
        return False


class PortRegistry:
    """记忆源注册中心 — 单例"""

    def __init__(self):
        self._ports: OrderedDict[str, MemoryPort] = OrderedDict()
        self._circuits: Dict[str, _CircuitState] = {}

    def register(self, port: MemoryPort) -> None:
        """注册一个记忆源"""
        name = port.port_name
        self._ports[name] = port
        self._circuits[name] = _CircuitState()
        logger.info(
            f"[PortRegistry] Registered port '{name}' "
            f"(priority={port.priority}, section={port.section_name})"
        )

    def unregister(self, port_name: str) -> None:
        """注销一个记忆源"""
        self._ports.pop(port_name, None)
        self._circuits.pop(port_name, None)

    def get_active_ports(self) -> List[MemoryPort]:
        """获取所有可用的 Port (按优先级排序, 排除熔断的)"""
        active = []
        for name, port in self._ports.items():
            circuit = self._circuits.get(name)
            if circuit and not circuit.is_available():
                logger.debug(f"[PortRegistry] Skipping '{name}' (circuit open)")
                continue
            active.append(port)
        return sorted(active, key=lambda p: p.priority)

    def get_port(self, name: str) -> Optional[MemoryPort]:
        """按名称获取 Port"""
        return self._ports.get(name)

    async def search_all(
        self,
        query: str,
        user_id: str,
        top_k: int = 3,
        **kwargs,
    ) -> Dict[str, List[MemoryResult]]:
        """并行搜索所有活跃 Port — 返回 {port_name: results}

        每个 Port 使用独立的超时和 circuit breaker。
        """
        ports = self.get_active_ports()
        if not ports:
            return {}

        async def _safe_search(port: MemoryPort) -> Tuple[str, List[MemoryResult]]:
            name = port.port_name
            try:
                results = await asyncio.wait_for(
                    port.search(query, user_id, top_k=top_k, **kwargs),
                    timeout=port.timeout_seconds,
                )
                self._circuits[name].record_success()
                return name, results
            except asyncio.TimeoutError:
                self._circuits[name].record_failure()
                logger.debug(f"[PortRegistry] '{name}' search timeout")
                return name, []
            except Exception as e:
                self._circuits[name].record_failure()
                logger.debug(f"[PortRegistry] '{name}' search failed: {e}")
                return name, []

        tasks = [_safe_search(p) for p in ports]
        results_list = await asyncio.gather(*tasks)
        return dict(results_list)

    async def delete_all_user_data(self, user_id: str) -> Dict[str, int]:
        """GDPR: 删除所有 Port 中指定用户的数据"""
        results = {}
        for name, port in self._ports.items():
            try:
                count = await port.delete_user_data(user_id)
                results[name] = count
            except Exception as e:
                logger.warning(f"[PortRegistry] Delete failed for '{name}': {e}")
                results[name] = -1  # -1 表示删除失败
        return results

    def get_status(self) -> Dict[str, Dict]:
        """获取所有 Port 的状态 (用于监控)"""
        status = {}
        for name, port in self._ports.items():
            circuit = self._circuits.get(name, _CircuitState())
            status[name] = {
                "section": port.section_name,
                "priority": port.priority,
                "is_always": port.is_always,
                "circuit_open": circuit.is_open,
                "failures": circuit.failures,
            }
        return status


# 单例
_registry: Optional[PortRegistry] = None


def get_port_registry() -> PortRegistry:
    """获取 PortRegistry 单例"""
    global _registry
    if _registry is None:
        _registry = PortRegistry()
    return _registry


def reset_port_registry_for_testing():
    """测试辅助: 重置 PortRegistry 单例。"""
    global _registry
    _registry = None
