"""夜间记忆整理编排器 — Phase 3b + Phase 4 + v3 补完

按依赖顺序执行:
  每日: relationship_cooling, memory_decay, graph_maintenance, data_lifecycle, diary, profile_update
  周日: weekly_digest
  每月1日: monthly_theme, life_chapter, collective_patterns, self_narrative

每个任务独立 try/except, 失败只 warning 不中断。
整理日志写入 CONSOLIDATION_LOG, 只含聚合统计 (无 PII)。
"""

import time
from datetime import datetime, timezone
from typing import Dict

from loguru import logger


class NightlyConsolidator:
    """夜间整理编排器"""

    def __init__(self, dry_run: bool = False):
        self.dry_run = dry_run

    async def run(self) -> Dict:
        """按依赖顺序执行全部整理任务"""
        start = time.monotonic()
        tasks_result = {}
        now = datetime.now(timezone.utc)

        # === 每日任务 ===

        # 1. 关系冷却
        tasks_result["relationship_cooling"] = await self._run_task(
            "relationship_cooling", self._cooling,
        )

        # 2. 记忆衰减
        tasks_result["memory_decay"] = await self._run_task(
            "memory_decay", self._decay,
        )

        # 3. 知识图谱维护
        tasks_result["graph_maintenance"] = await self._run_task(
            "graph_maintenance", self._graph,
        )

        # 4. 数据生命周期维护 (Phase 4)
        tasks_result["data_lifecycle"] = await self._run_task(
            "data_lifecycle", self._data_lifecycle,
        )

        # 5. 灵的每日观察日记 (Phase 4)
        tasks_result["diary"] = await self._run_task(
            "diary", self._diary,
        )

        # 6. 用户画像刷新 (v3: 每日)
        tasks_result["profile_update"] = await self._run_task(
            "profile_update", self._profile_update,
        )

        # === 周度任务 (周日触发) ===
        if now.weekday() == 6:  # 0=Mon, 6=Sun
            tasks_result["weekly_digest"] = await self._run_task(
                "weekly_digest", self._weekly_digest,
            )
        else:
            tasks_result["weekly_digest"] = {"status": "skipped", "reason": "not_sunday"}

        # === 月度任务 (每月 1 日触发) ===
        if now.day == 1:
            tasks_result["monthly_theme"] = await self._run_task(
                "monthly_theme", self._monthly_theme,
            )
            tasks_result["life_chapter"] = await self._run_task(
                "life_chapter", self._life_chapter,
            )
            # Phase 4: 集体模式生成 (月度, 在 monthly_theme 之后)
            tasks_result["collective_patterns"] = await self._run_task(
                "collective_patterns", self._collective_patterns,
            )
            # Phase 4: 灵的自我叙事 (月度)
            tasks_result["self_narrative"] = await self._run_task(
                "self_narrative", self._self_narrative,
            )
        else:
            tasks_result["monthly_theme"] = {"status": "skipped", "reason": "not_first_day"}
            tasks_result["life_chapter"] = {"status": "skipped", "reason": "not_first_day"}
            tasks_result["collective_patterns"] = {"status": "skipped", "reason": "not_first_day"}
            tasks_result["self_narrative"] = {"status": "skipped", "reason": "not_first_day"}

        elapsed_ms = int((time.monotonic() - start) * 1000)
        results = {
            "run_date": datetime.now(timezone.utc).isoformat(),
            "total_elapsed_ms": elapsed_ms,
            "dry_run": self.dry_run,
            "tasks": tasks_result,
        }

        # 写入整理日志
        await self._write_log(results)

        logger.info(
            f"[Consolidator] Completed in {elapsed_ms}ms "
            f"(dry_run={self.dry_run})"
        )
        return results

    async def _run_task(self, name: str, func) -> Dict:
        """执行单个任务, 独立 try/except"""
        task_start = time.monotonic()
        try:
            result = await func()
            elapsed_ms = int((time.monotonic() - task_start) * 1000)
            result["elapsed_ms"] = elapsed_ms
            result["status"] = result.get("status", "ok")
            return result
        except Exception as e:
            elapsed_ms = int((time.monotonic() - task_start) * 1000)
            logger.warning(f"[Consolidator] Task {name} failed: {e}")
            return {
                "status": "error",
                "error": str(e),
                "elapsed_ms": elapsed_ms,
            }

    async def _cooling(self) -> Dict:
        """关系冷却"""
        from .relationship_cooling import batch_cooling_check
        return await batch_cooling_check(dry_run=self.dry_run)

    async def _decay(self) -> Dict:
        """记忆衰减"""
        from .memory_decay import MemoryDecayProcessor
        return await MemoryDecayProcessor().process_all_users(dry_run=self.dry_run)

    async def _graph(self) -> Dict:
        """知识图谱维护"""
        from .graph_maintenance import GraphMaintenance
        return await GraphMaintenance().process_all_users(dry_run=self.dry_run)

    async def _weekly_digest(self) -> Dict:
        """Phase 3b-beta: 周摘要生成 (周日触发)"""
        from ..abstraction.weekly_digest import generate_all_users
        return await generate_all_users(dry_run=self.dry_run)

    async def _monthly_theme(self) -> Dict:
        """Phase 3b-beta: 月度主题生成 (每月 1 日)"""
        from ..abstraction.monthly_theme import generate_all_users
        return await generate_all_users(dry_run=self.dry_run)

    async def _life_chapter(self) -> Dict:
        """Phase 3b-beta: 人生章节检测 (每月 1 日, 在 monthly_theme 之后)"""
        from ..abstraction.life_chapter import detect_all_users
        return await detect_all_users(dry_run=self.dry_run)

    async def _data_lifecycle(self) -> Dict:
        """Phase 4: 数据生命周期维护 (每日)"""
        from .data_lifecycle import lifecycle_maintenance
        return await lifecycle_maintenance(dry_run=self.dry_run)

    async def _diary(self) -> Dict:
        """Phase 4: 灵的每日观察日记"""
        from .diary_generator import generate_diary
        return await generate_diary(dry_run=self.dry_run)

    async def _collective_patterns(self) -> Dict:
        """Phase 4: 集体模式生成 (月度)"""
        from ..collective.pattern_library import generate_patterns_from_aggregation
        return await generate_patterns_from_aggregation(dry_run=self.dry_run)

    async def _self_narrative(self) -> Dict:
        """Phase 4: 灵的自我叙事 (月度)"""
        from ..self_narrative.ling_growth import generate_monthly_narrative
        result = await generate_monthly_narrative(dry_run=self.dry_run)
        if result:
            return {"status": "ok", "month": result.month}
        return {"status": "skipped", "reason": "no_data_or_exists"}

    async def _profile_update(self) -> Dict:
        """v3: 用户画像刷新 (每日)"""
        from ..cache.user_profile_cache import refresh_all_profiles
        return await refresh_all_profiles()

    async def _write_log(self, results: Dict):
        """写入整理日志 — 只存聚合统计, 不存 user_id (无 PII)"""
        try:
            from ..storage.soul_collections import get_collection, CONSOLIDATION_LOG

            coll = await get_collection(CONSOLIDATION_LOG)
            if coll is None:
                return

            # 提取聚合统计 (不含任何用户标识)
            log_entry = {
                "run_date": datetime.now(timezone.utc),
                "total_elapsed_ms": results.get("total_elapsed_ms", 0),
                "dry_run": results.get("dry_run", False),
            }
            for task_name, task_result in results.get("tasks", {}).items():
                log_entry[task_name] = {
                    "status": task_result.get("status", "unknown"),
                    "elapsed_ms": task_result.get("elapsed_ms", 0),
                }
                # 复制数值统计字段 (排除 status/elapsed_ms/error/dry_run)
                for k, v in task_result.items():
                    if k not in ("status", "elapsed_ms", "error", "dry_run", "reason") \
                            and isinstance(v, (int, float)):
                        log_entry[task_name][k] = v

            await coll.insert_one(log_entry)
        except Exception as e:
            logger.warning(f"[Consolidator] Log write failed (non-fatal): {e}")
