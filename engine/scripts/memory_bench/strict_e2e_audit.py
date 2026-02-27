#!/usr/bin/env python3
"""Strict-mode E2E rehearsal with auditable report and release checklist."""

from __future__ import annotations

import argparse
import asyncio
import importlib
import json
import os
import shlex
import socket
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


ENGINE_ROOT = Path(__file__).resolve().parents[2]
SRC_ROOT = ENGINE_ROOT / "src"
if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))


REQUIRED_SUITES = ["LongMemEval", "LoCoMo", "MemoryArena", "LoCoMo-Plus"]


@dataclass
class Gate:
    name: str
    passed: bool
    evidence: str


def _json_default(value: Any):
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _mkdir(path: Path):
    path.mkdir(parents=True, exist_ok=True)


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _load_dotenv_if_present(path: Path):
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        key = key.strip()
        if not key or key in os.environ:
            continue
        value = val.strip().strip('"').strip("'")
        os.environ[key] = value


def _check_port(host: str, port: int, timeout_sec: float = 0.8) -> bool:
    try:
        with socket.create_connection((host, int(port)), timeout=timeout_sec):
            return True
    except Exception:
        return False


def _check_import(module_name: str) -> bool:
    try:
        importlib.import_module(module_name)
        return True
    except Exception:
        return False


def _configure_env_defaults(args: argparse.Namespace):
    runner = ENGINE_ROOT / "scripts" / "memory_bench" / "suite_runner.py"
    py = shlex.quote(sys.executable)
    runner_q = shlex.quote(str(runner))

    def cmd_for(suite: str) -> str:
        suite_q = shlex.quote(suite)
        return (
            f"{py} {runner_q} "
            f"--suite {suite_q} "
            f"--cases {max(1, args.cases)} "
            f"--top-k {max(1, args.top_k)} "
            f"--timeout-ms {max(100, args.timeout_ms)} "
            f"--max-ingest-chunks {max(20, args.max_ingest_chunks)}"
        )

    defaults = {
        "SOUL_ENABLED": "true",
        "SOUL_FABRIC_ENABLED": "true",
        "SOUL_FABRIC_STRICT_MODE": "true",
        "SOUL_BENCHMARK_ENABLED": "true",
        "SOUL_BENCHMARK_REQUIRE_REAL": "true",
        "MONGO_URL": "mongodb://admin:memsys123@localhost:27017/?authSource=admin",
        "MONGO_DB": "ling_soul",
        "NEO4J_URL": "bolt://localhost:7687",
        "NEO4J_USER": "neo4j",
        "NEO4J_PASSWORD": "password",
        "QDRANT_HOST": "localhost",
        "QDRANT_PORT": "6333",
        "EVERMEMOS_URL": "http://localhost:1995",
        "SOUL_BENCHMARK_TIMEOUT_SEC": str(max(300, args.benchmark_timeout_sec)),
        "GRAPHITI_ENABLED": "true",
        "MEM0_ENABLED": "true",
        "SOUL_BENCHMARK_MIN_IMPROVEMENT": str(max(0.0, args.min_improvement)),
        "SOUL_BENCHMARK_BASELINE_LONGMEMEVAL": str(max(0.01, args.baseline_longmemeval)),
        "SOUL_BENCHMARK_BASELINE_LOCOMO": str(max(0.01, args.baseline_locomo)),
        "SOUL_BENCHMARK_BASELINE_MEMORYARENA": str(max(0.01, args.baseline_memoryarena)),
        "SOUL_BENCHMARK_BASELINE_LOCOMO_PLUS": str(max(0.01, args.baseline_locomo_plus)),
        "SOUL_BENCHMARK_CMD_LONGMEMEVAL": cmd_for("LongMemEval"),
        "SOUL_BENCHMARK_CMD_LOCOMO": cmd_for("LoCoMo"),
        "SOUL_BENCHMARK_CMD_MEMORYARENA": cmd_for("MemoryArena"),
        "SOUL_BENCHMARK_CMD_LOCOMO_PLUS": cmd_for("LoCoMo-Plus"),
    }
    for key, val in defaults.items():
        os.environ.setdefault(key, val)


def _reset_singletons():
    from ling_engine.soul.config import reset_soul_config_for_testing
    from ling_engine.soul.fabric.service import reset_memory_fabric_for_testing
    from ling_engine.soul.adapters.graphiti_adapter import reset_graphiti_adapter_for_testing
    from ling_engine.soul.adapters.mem0_adapter import reset_mem0_adapter_for_testing

    reset_soul_config_for_testing()
    reset_memory_fabric_for_testing()
    reset_graphiti_adapter_for_testing()
    reset_mem0_adapter_for_testing()


def _extract_benchmark_suite_status(result: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    suites = result.get("suites", {}) if isinstance(result, dict) else {}
    out: Dict[str, Dict[str, Any]] = {}
    for name in REQUIRED_SUITES:
        item = suites.get(name, {}) if isinstance(suites, dict) else {}
        out[name] = {
            "status": item.get("status"),
            "mode": item.get("mode"),
            "score": item.get("score"),
        }
    return out


def _latest_runs_by_suite(rows: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    out: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        suite = str(row.get("suite", "")).strip()
        if not suite or suite in out:
            continue
        out[suite] = row
        if len(out) >= len(REQUIRED_SUITES):
            break
    return out


def _build_gates(
    dependency: Dict[str, Any],
    coverage: Dict[str, Any],
    plan_error: Optional[str],
    benchmark_result: Optional[Dict[str, Any]],
    benchmark_error: Optional[str],
    recent_runs: List[Dict[str, Any]],
    target_recall_p95_ms: int,
) -> List[Gate]:
    ports_ok = all(dependency["ports"].values())
    imports_ok = all(dependency["imports"].values())
    adapters_ok = (
        bool(dependency["adapters"].get("graphiti_runtime", {}).get("available"))
        and bool(dependency["adapters"].get("mem0_runtime", {}).get("available"))
    )
    dep_ok = ports_ok and imports_ok and adapters_ok

    missing_caps = coverage.get("missing_capabilities", []) if isinstance(coverage, dict) else []
    unhealthy = coverage.get("unhealthy_enabled_providers", []) if isinstance(coverage, dict) else []
    strict_ok = (not missing_caps) and (not unhealthy) and (plan_error is None)

    suite_status = _extract_benchmark_suite_status(benchmark_result or {})
    suites_ok = True
    for item in suite_status.values():
        if item.get("mode") != "real" or item.get("status") != "ok":
            suites_ok = False
            break
    benchmark_ok = bool(benchmark_result) and (benchmark_error is None) and suites_ok

    gates = (benchmark_result or {}).get("gates", {}) if isinstance(benchmark_result, dict) else {}
    improvement_ok = (
        bool(benchmark_result)
        and not gates.get("failed_improvement_suites")
        and not gates.get("missing_baseline_suites")
    )

    latest = _latest_runs_by_suite(recent_runs)
    persisted_ok = all(suite in latest for suite in REQUIRED_SUITES)

    recall_p95 = ((benchmark_result or {}).get("summary", {}) or {}).get("recall_p95_ms")
    slo_ok = (recall_p95 is not None) and (float(recall_p95) <= float(target_recall_p95_ms))

    return [
        Gate(
            name="G1 Dependencies Online",
            passed=dep_ok,
            evidence=(
                f"ports_ok={ports_ok}, imports_ok={imports_ok}, adapters_ok={adapters_ok}"
            ),
        ),
        Gate(
            name="G2 Strict Coverage",
            passed=strict_ok,
            evidence=(
                f"missing_capabilities={missing_caps}, unhealthy={unhealthy}, plan_error={plan_error}"
            ),
        ),
        Gate(
            name="G3 Real Benchmarks Passed",
            passed=benchmark_ok,
            evidence=f"suites={suite_status}, benchmark_error={benchmark_error}",
        ),
        Gate(
            name="G4 Improvement Gate",
            passed=improvement_ok,
            evidence=(
                f"failed_improvement={gates.get('failed_improvement_suites', [])}, "
                f"missing_baseline={gates.get('missing_baseline_suites', [])}"
            ),
        ),
        Gate(
            name="G5 Benchmark Persistence",
            passed=persisted_ok,
            evidence=f"persisted_suites={sorted(latest.keys())}",
        ),
        Gate(
            name="G6 Recall P95 SLO",
            passed=slo_ok,
            evidence=f"recall_p95_ms={recall_p95}, target_ms={target_recall_p95_ms}",
        ),
    ]


def _write_markdown_report(path: Path, report: Dict[str, Any], gates: List[Gate]):
    lines: List[str] = []
    lines.append("# Soul Memory Strict E2E Audit Report")
    lines.append(f"- Generated At (UTC): {report['generated_at']}")
    lines.append(f"- Release Blocked: {report['release_blocked']}")
    lines.append(f"- SOTA Reached: {report['sota_reached']}")
    lines.append("")
    lines.append("## Dependency Status")
    dep = report["dependency"]
    lines.append(f"- Ports: {dep['ports']}")
    lines.append(f"- Imports: {dep['imports']}")
    lines.append(f"- Adapters: {dep['adapters']}")
    lines.append("")
    lines.append("## Strict Coverage")
    lines.append(f"- Coverage: {report['strict_coverage']}")
    lines.append(f"- Plan Recall Error: {report.get('plan_recall_error')}")
    lines.append("")
    lines.append("## Benchmark Result")
    lines.append(f"- Benchmark Error: {report.get('benchmark_error')}")
    lines.append(f"- Benchmark Summary: {report.get('benchmark_summary')}")
    lines.append(f"- Benchmark Suites: {report.get('benchmark_suites')}")
    lines.append("")
    lines.append("## Release Gates")
    for gate in gates:
        mark = "PASS" if gate.passed else "FAIL"
        lines.append(f"- {gate.name}: {mark} ({gate.evidence})")
    lines.append("")
    lines.append("## Recent Benchmark Rows")
    for row in report.get("recent_benchmark_runs", [])[:12]:
        lines.append(
            f"- suite={row.get('suite')} score={row.get('score')} status={row.get('status')} "
            f"created_at={row.get('created_at')}"
        )
    path.write_text("\n".join(lines), encoding="utf-8")


def _write_checklist(path: Path, report: Dict[str, Any], gates: List[Gate]):
    lines: List[str] = []
    lines.append("# Soul Memory Release Gate Checklist")
    lines.append(f"- Generated At (UTC): {report['generated_at']}")
    lines.append("")
    for gate in gates:
        mark = "x" if gate.passed else " "
        lines.append(f"- [{mark}] {gate.name} — {gate.evidence}")
    lines.append("")
    lines.append(
        f"- Final Decision: {'BLOCKED' if report['release_blocked'] else 'READY'}"
    )
    lines.append(f"- SOTA Verdict: {'REACHED' if report['sota_reached'] else 'NOT_REACHED'}")
    path.write_text("\n".join(lines), encoding="utf-8")


async def _run(args: argparse.Namespace) -> Dict[str, Any]:
    _configure_env_defaults(args)
    _reset_singletons()

    start_utc = _now_utc()

    dependency = {
        "ports": {
            "mongo_27017": _check_port("127.0.0.1", 27017),
            "qdrant_6333": _check_port("127.0.0.1", 6333),
            "neo4j_bolt_7687": _check_port("127.0.0.1", 7687),
            "evermemos_1995": _check_port("127.0.0.1", 1995),
        },
        "imports": {
            "motor": _check_import("motor"),
            "pymongo": _check_import("pymongo"),
            "mem0": _check_import("mem0"),
            "graphiti_core": _check_import("graphiti_core"),
        },
        "adapters": {},
    }

    from ling_engine.soul.adapters.graphiti_adapter import get_graphiti_adapter
    from ling_engine.soul.adapters.mem0_adapter import get_mem0_adapter
    from ling_engine.soul.config import get_soul_config
    from ling_engine.soul.fabric.service import get_memory_fabric
    from ling_engine.soul.fabric.store import MemoryFabricStore

    # Warm adapters and capture runtime status after health checks.
    graphiti_health = await get_graphiti_adapter().health_check()
    mem0_health = await get_mem0_adapter().health_check()
    dependency["adapters"] = {
        "graphiti_health": graphiti_health,
        "graphiti_runtime": get_graphiti_adapter().runtime_status(),
        "mem0_health": mem0_health,
        "mem0_runtime": get_mem0_adapter().runtime_status(),
    }

    fabric = get_memory_fabric()
    cfg = get_soul_config()

    coverage_model = fabric.coverage_report()
    coverage = coverage_model.model_dump(mode="json")

    plan_error = None
    try:
        fabric.plan_recall(
            relationship_stage="familiar",
            latency_budget_ms=700,
            query="请回忆供应链系统里程碑与风险处理脉络",
        )
    except Exception as exc:
        plan_error = str(exc)

    benchmark_error = None
    benchmark_result: Optional[Dict[str, Any]] = None
    benchmark_start = _now_utc()
    try:
        benchmark_result = await fabric.benchmark([])
    except Exception as exc:
        benchmark_error = str(exc)

    store = MemoryFabricStore()
    recent_runs = await store.recent_benchmark_runs(limit=40)

    gates = _build_gates(
        dependency=dependency,
        coverage=coverage,
        plan_error=plan_error,
        benchmark_result=benchmark_result,
        benchmark_error=benchmark_error,
        recent_runs=recent_runs,
        target_recall_p95_ms=cfg.slo_recall_p95_ms,
    )
    release_blocked = any(not gate.passed for gate in gates)
    sota_reached = not release_blocked

    report = {
        "generated_at": _now_utc().isoformat(),
        "started_at": start_utc.isoformat(),
        "benchmark_started_at": benchmark_start.isoformat(),
        "env_snapshot": {
            "SOUL_FABRIC_STRICT_MODE": os.environ.get("SOUL_FABRIC_STRICT_MODE"),
            "SOUL_BENCHMARK_REQUIRE_REAL": os.environ.get("SOUL_BENCHMARK_REQUIRE_REAL"),
            "SOUL_BENCHMARK_MIN_IMPROVEMENT": os.environ.get("SOUL_BENCHMARK_MIN_IMPROVEMENT"),
            "SOUL_BENCHMARK_BASELINE_LONGMEMEVAL": os.environ.get("SOUL_BENCHMARK_BASELINE_LONGMEMEVAL"),
            "SOUL_BENCHMARK_BASELINE_LOCOMO": os.environ.get("SOUL_BENCHMARK_BASELINE_LOCOMO"),
            "SOUL_BENCHMARK_BASELINE_MEMORYARENA": os.environ.get("SOUL_BENCHMARK_BASELINE_MEMORYARENA"),
            "SOUL_BENCHMARK_BASELINE_LOCOMO_PLUS": os.environ.get("SOUL_BENCHMARK_BASELINE_LOCOMO_PLUS"),
            "SOUL_BENCHMARK_CMD_LONGMEMEVAL": os.environ.get("SOUL_BENCHMARK_CMD_LONGMEMEVAL"),
            "SOUL_BENCHMARK_CMD_LOCOMO": os.environ.get("SOUL_BENCHMARK_CMD_LOCOMO"),
            "SOUL_BENCHMARK_CMD_MEMORYARENA": os.environ.get("SOUL_BENCHMARK_CMD_MEMORYARENA"),
            "SOUL_BENCHMARK_CMD_LOCOMO_PLUS": os.environ.get("SOUL_BENCHMARK_CMD_LOCOMO_PLUS"),
        },
        "dependency": dependency,
        "strict_coverage": coverage,
        "plan_recall_error": plan_error,
        "benchmark_error": benchmark_error,
        "benchmark_summary": (benchmark_result or {}).get("summary"),
        "benchmark_suites": _extract_benchmark_suite_status(benchmark_result or {}),
        "benchmark_gates": (benchmark_result or {}).get("gates", {}),
        "recent_benchmark_runs": recent_runs,
        "release_gates": [
            {"name": gate.name, "passed": gate.passed, "evidence": gate.evidence}
            for gate in gates
        ],
        "release_blocked": release_blocked,
        "sota_reached": sota_reached,
        "notes": (
            "SOTA verdict in this checklist is tied to strict engineering gates "
            "(dependency online + strict coverage + real benchmark + improvement + persistence + SLO)."
        ),
    }

    ts = _now_utc().strftime("%Y%m%d_%H%M%S")
    out_dir = Path(args.report_dir).resolve()
    _mkdir(out_dir)
    json_path = out_dir / f"strict_e2e_audit_{ts}.json"
    md_path = out_dir / f"strict_e2e_audit_{ts}.md"
    checklist_path = out_dir / f"release_gate_checklist_{ts}.md"

    json_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2, default=_json_default),
        encoding="utf-8",
    )
    _write_markdown_report(md_path, report, gates)
    _write_checklist(checklist_path, report, gates)

    return {
        "status": "blocked" if release_blocked else "ok",
        "sota_reached": sota_reached,
        "release_blocked": release_blocked,
        "report_json": str(json_path),
        "report_markdown": str(md_path),
        "checklist_markdown": str(checklist_path),
    }


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Strict E2E memory audit")
    parser.add_argument(
        "--report-dir",
        default=str(ENGINE_ROOT / "reports" / "memory_fabric_audit"),
    )
    parser.add_argument("--cases", type=int, default=int(os.environ.get("SOUL_BENCH_CASES", "40")))
    parser.add_argument("--top-k", type=int, default=int(os.environ.get("SOUL_BENCH_TOP_K", "8")))
    parser.add_argument("--timeout-ms", type=int, default=int(os.environ.get("SOUL_BENCH_RECALL_TIMEOUT_MS", "1200")))
    parser.add_argument("--max-ingest-chunks", type=int, default=int(os.environ.get("SOUL_BENCH_MAX_INGEST_CHUNKS", "220")))
    parser.add_argument("--benchmark-timeout-sec", type=float, default=float(os.environ.get("SOUL_BENCHMARK_TIMEOUT_SEC", "3600")))
    parser.add_argument("--min-improvement", type=float, default=float(os.environ.get("SOUL_BENCHMARK_MIN_IMPROVEMENT", "0.05")))
    parser.add_argument("--baseline-longmemeval", type=float, default=float(os.environ.get("SOUL_BENCHMARK_BASELINE_LONGMEMEVAL", "0.35")))
    parser.add_argument("--baseline-locomo", type=float, default=float(os.environ.get("SOUL_BENCHMARK_BASELINE_LOCOMO", "0.40")))
    parser.add_argument("--baseline-memoryarena", type=float, default=float(os.environ.get("SOUL_BENCHMARK_BASELINE_MEMORYARENA", "0.30")))
    parser.add_argument("--baseline-locomo-plus", type=float, default=float(os.environ.get("SOUL_BENCHMARK_BASELINE_LOCOMO_PLUS", "0.35")))
    return parser.parse_args()


def main() -> int:
    _load_dotenv_if_present(ENGINE_ROOT / ".env")
    args = _parse_args()
    result = asyncio.run(_run(args))
    print(json.dumps(result, ensure_ascii=False))
    return 0 if not result.get("release_blocked") else 3


if __name__ == "__main__":
    raise SystemExit(main())
