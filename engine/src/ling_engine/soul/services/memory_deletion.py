"""
统一记忆删除服务 — GDPR 合规 (⚖️伦理 + 🔐安全)

确保用户行使"删除权"时, 所有记忆后端的数据都被真删除:
- MongoDB (Soul System 原生数据)
- Qdrant (短期向量记忆)
- EverMemOS (长期情景记忆)
- Graphiti/Neo4j (时序知识图谱)
- Mem0 (语义/实体记忆)

设计原则:
- 真删除, 不是软删除 (⚖️: "遗忘权"必须彻底)
- 尽力而为: 单个后端失败不阻断其他删除
- 返回详细报告: 每个后端的删除结果
- 审计日志: 记录删除操作 (🔐: 出问题时能追溯)
"""

from datetime import datetime, timezone
from typing import Dict, Any

from loguru import logger

from ..utils.validation import is_valid_user_id


class MemoryDeletionService:
    """统一记忆删除服务"""

    async def delete_user(self, user_id: str) -> Dict[str, Any]:
        """删除指定用户在所有后端的数据

        Returns:
            {
                "user_id": str,
                "timestamp": str,
                "results": {
                    "mongodb": {"deleted": int, "error": str|None},
                    "qdrant": {...},
                    "evermemos": {...},
                    "graphiti": {...},
                    "mem0": {...},
                },
                "success": bool,  # 所有后端都成功
            }
        """
        if not is_valid_user_id(user_id):
            logger.warning("[GDPR] Invalid user_id format, abort deletion request")
            return {
                "user_id": str(user_id),
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "results": {
                    "validation": {
                        "deleted": 0,
                        "error": "invalid user_id",
                    }
                },
                "success": False,
            }

        report = {
            "user_id": user_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "results": {},
            "success": True,
        }
        from ..config import get_soul_config
        cfg = get_soul_config()

        # 1. MongoDB — Soul System 原生集合
        report["results"]["mongodb"] = await self._delete_mongodb(user_id)

        # 2. Qdrant — 短期向量记忆
        report["results"]["qdrant"] = await self._delete_qdrant(user_id)

        # 3. EverMemOS — 长期情景记忆
        report["results"]["evermemos"] = await self._delete_evermemos(user_id)

        # 4. Graphiti + MongoDB KG — 通过 PortRegistry
        report["results"]["graphiti"] = await self._delete_via_port(
            "graphiti",
            user_id,
            required=cfg.graphiti_enabled,
        )

        # 5. Mem0 — 通过 PortRegistry
        report["results"]["mem0"] = await self._delete_via_port(
            "mem0",
            user_id,
            required=cfg.mem0_enabled,
        )

        # 汇总
        for backend, result in report["results"].items():
            if result.get("error"):
                report["success"] = False

        # 审计日志
        logger.info(
            f"[GDPR] User data deletion: user={user_id}, "
            f"success={report['success']}, "
            f"details={report['results']}"
        )

        return report

    async def _delete_mongodb(self, user_id: str) -> Dict[str, Any]:
        """删除 MongoDB 中的所有 Soul System 数据"""
        try:
            from ..storage.soul_collections import (
                get_collection,
                EMOTIONS, STORIES, IMPORTANCE, RELATIONSHIPS,
                SEMANTIC_NODES, SEMANTIC_EDGES,
                WEEKLY_DIGESTS, MONTHLY_THEMES, LIFE_CHAPTERS,
                MEMORY_ATOMS, MEMORY_TRACES, CORE_BLOCKS, PROCEDURAL_RULES, SAFETY_SHADOW,
            )
            collections = [
                EMOTIONS, STORIES, IMPORTANCE, RELATIONSHIPS,
                SEMANTIC_NODES, SEMANTIC_EDGES,
                WEEKLY_DIGESTS, MONTHLY_THEMES, LIFE_CHAPTERS,
                MEMORY_ATOMS, MEMORY_TRACES, CORE_BLOCKS, PROCEDURAL_RULES, SAFETY_SHADOW,
            ]
            total = 0
            for coll_name in collections:
                coll = await get_collection(coll_name)
                if coll is not None:
                    result = await coll.delete_many({"user_id": user_id})
                    total += result.deleted_count
            return {"deleted": total, "error": None}
        except Exception as e:
            logger.warning(f"[GDPR] MongoDB delete failed: {e}")
            return {"deleted": 0, "error": str(e)}

    async def _delete_qdrant(self, user_id: str) -> Dict[str, Any]:
        """删除 Qdrant 中的用户向量记忆"""
        try:
            from ...important import delete_user_memories
            count = delete_user_memories(user_id)
            return {"deleted": count or 0, "error": None}
        except ImportError:
            return {"deleted": 0, "error": None}  # Qdrant 未配置不算错误
        except Exception as e:
            logger.warning(f"[GDPR] Qdrant delete failed: {e}")
            return {"deleted": 0, "error": str(e)}

    async def _delete_evermemos(self, user_id: str) -> Dict[str, Any]:
        """删除 EverMemOS 中的用户记忆"""
        try:
            from ...tools.evermemos_client import delete_user_data
            result = await delete_user_data(user_id)
            return {"deleted": 1 if result else 0, "error": None}
        except ImportError:
            return {"deleted": 0, "error": None}
        except Exception as e:
            logger.warning(f"[GDPR] EverMemOS delete failed: {e}")
            return {"deleted": 0, "error": str(e)}

    async def _delete_via_port(
        self,
        port_name: str,
        user_id: str,
        required: bool = False,
    ) -> Dict[str, Any]:
        """通过 PortRegistry 删除"""
        try:
            from ..ports.initializer import ensure_ports_initialized
            from ..ports.registry import get_port_registry
            ensure_ports_initialized()
            registry = get_port_registry()
            port = registry.get_port(port_name)
            if port is None:
                if required:
                    return {
                        "deleted": 0,
                        "error": f"required port '{port_name}' not initialized",
                    }
                return {"deleted": 0, "error": None}
            count = await port.delete_user_data(user_id)
            if count < 0:
                return {"deleted": 0, "error": "deletion failed"}
            return {"deleted": count, "error": None}
        except Exception as e:
            logger.warning(f"[GDPR] Port '{port_name}' delete failed: {e}")
            return {"deleted": 0, "error": str(e)}


# 单例
_deletion_service = None


def get_deletion_service() -> MemoryDeletionService:
    global _deletion_service
    if _deletion_service is None:
        _deletion_service = MemoryDeletionService()
    return _deletion_service


def reset_deletion_service_for_testing():
    """测试辅助: 重置删除服务单例。"""
    global _deletion_service
    _deletion_service = None
