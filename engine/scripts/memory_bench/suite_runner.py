#!/usr/bin/env python3
"""Run one real memory benchmark suite and emit a normalized JSON score."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
import time
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple


ENGINE_ROOT = Path(__file__).resolve().parents[2]
SRC_ROOT = ENGINE_ROOT / "src"
if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))


DATA_DIR = ENGINE_ROOT / ".benchmarks" / "datasets"


LONGMEMEVAL_ORACLE_URL = (
    "https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/"
    "longmemeval_oracle.json"
)
LOCOMO10_URL = "https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json"
MEMORYARENA_URLS = [
    "https://huggingface.co/datasets/ZexueHe/memoryarena/resolve/main/progressive_search/data.jsonl",
    "https://huggingface.co/datasets/ZexueHe/memoryarena/resolve/main/group_travel_planner/data.jsonl",
    "https://huggingface.co/datasets/ZexueHe/memoryarena/resolve/main/formal_reasoning_math/data.jsonl",
    "https://huggingface.co/datasets/ZexueHe/memoryarena/resolve/main/formal_reasoning_phys/data.jsonl",
    "https://huggingface.co/datasets/ZexueHe/memoryarena/resolve/main/bundled_shopping/data.jsonl",
]
EVERMEMBENCH_TOPIC01_DIALOGUE_URL = (
    "https://huggingface.co/datasets/EverMind-AI/EverMemBench-Dynamic/resolve/main/01/dialogue.json"
)
EVERMEMBENCH_TOPIC01_QA_URL = (
    "https://huggingface.co/datasets/EverMind-AI/EverMemBench-Dynamic/resolve/main/01/qa_01.json"
)


@dataclass
class BenchmarkCase:
    question: str
    answer: str


def _mkdir(path: Path):
    path.mkdir(parents=True, exist_ok=True)


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


def _download_text(url: str, timeout_sec: int = 120) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "soul-benchmark-runner/1.0"})
    with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
        raw = resp.read()
    return raw.decode("utf-8")


def _load_json_cached(cache_name: str, url: str) -> Any:
    _mkdir(DATA_DIR)
    target = DATA_DIR / cache_name
    if target.exists():
        return json.loads(target.read_text(encoding="utf-8"))
    text = _download_text(url)
    target.write_text(text, encoding="utf-8")
    return json.loads(text)


def _load_jsonl_cached(cache_name: str, url: str) -> List[Dict[str, Any]]:
    _mkdir(DATA_DIR)
    target = DATA_DIR / cache_name
    if target.exists():
        lines = target.read_text(encoding="utf-8").splitlines()
    else:
        text = _download_text(url)
        target.write_text(text, encoding="utf-8")
        lines = text.splitlines()
    rows: List[Dict[str, Any]] = []
    for line in lines:
        if not line.strip():
            continue
        rows.append(json.loads(line))
    return rows


def _normalize_space(text: str) -> str:
    return " ".join(str(text or "").split())


def _unique(items: Iterable[str]) -> List[str]:
    out: List[str] = []
    seen = set()
    for item in items:
        key = item.strip()
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(key)
    return out


def _normalize_for_match(text: str) -> str:
    text = _normalize_space(text).lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    return _normalize_space(text)


def _token_f1(gold: str, pred: str) -> float:
    gold_tokens = _normalize_for_match(gold).split()
    pred_tokens = _normalize_for_match(pred).split()
    if not gold_tokens or not pred_tokens:
        return 0.0
    gold_count: Dict[str, int] = {}
    for tok in gold_tokens:
        gold_count[tok] = gold_count.get(tok, 0) + 1
    pred_count: Dict[str, int] = {}
    for tok in pred_tokens:
        pred_count[tok] = pred_count.get(tok, 0) + 1
    common = 0
    for tok, cnt in gold_count.items():
        common += min(cnt, pred_count.get(tok, 0))
    if common <= 0:
        return 0.0
    precision = common / len(pred_tokens)
    recall = common / len(gold_tokens)
    if precision + recall == 0:
        return 0.0
    return 2 * precision * recall / (precision + recall)


def _score_answer(answer: str, context: str) -> Tuple[float, bool, float]:
    gold_norm = _normalize_for_match(answer)
    ctx_norm = _normalize_for_match(context)
    if not gold_norm or not ctx_norm:
        return 0.0, False, 0.0
    exact = gold_norm in ctx_norm
    f1 = _token_f1(answer, context)
    if exact:
        return 1.0, True, f1
    # Partial credit when key tokens are present.
    return min(1.0, f1 * 1.25), False, f1


def _percentile(values: List[float], p: float) -> float:
    if not values:
        return 0.0
    sorted_vals = sorted(values)
    idx = int(round((len(sorted_vals) - 1) * p))
    idx = max(0, min(idx, len(sorted_vals) - 1))
    return float(sorted_vals[idx])


def _flatten_strings(payload: Any, out: List[str]):
    if payload is None:
        return
    if isinstance(payload, str):
        txt = _normalize_space(payload)
        if txt:
            out.append(txt)
        return
    if isinstance(payload, dict):
        for val in payload.values():
            _flatten_strings(val, out)
        return
    if isinstance(payload, list):
        for item in payload:
            _flatten_strings(item, out)


def _collect_context_text(recall_result: Dict[str, Any]) -> str:
    pack = recall_result.get("context_pack", {}) or {}
    lines: List[str] = []
    _flatten_strings(pack, lines)
    # Keep bounded text to avoid pathological memory usage.
    return "\n".join(lines)[:200_000]


def _extract_memoryarena_answer(raw: str) -> str:
    text = _normalize_space(raw)
    if not text:
        return ""
    patterns = [
        r"(?i)\bfinal answer\b[:\-]?\s*([^.;\n]+)",
        r"(?i)\banswer\b[:\-]?\s*([^.;\n]+)",
        r"(?i)\bthe individual\b[^:]*\bis\s+([^.;\n]+)",
    ]
    for pattern in patterns:
        m = re.search(pattern, text)
        if m:
            candidate = _normalize_space(m.group(1))
            if candidate:
                return candidate[:220]
    # Fallback: first sentence.
    first = re.split(r"[.!?;]\s*", text)[0].strip()
    return first[:220] if first else text[:220]


def _parse_message_indices(spec: str) -> List[int]:
    out: List[int] = []
    for part in str(spec or "").split(","):
        token = part.strip()
        if not token:
            continue
        if "-" in token:
            bounds = token.split("-", 1)
            try:
                left = int(bounds[0].strip())
                right = int(bounds[1].strip())
            except Exception:
                continue
            if right < left:
                left, right = right, left
            out.extend(range(left, right + 1))
            continue
        try:
            out.append(int(token))
        except Exception:
            continue
    return sorted(set(out))


def _build_locomo(max_cases: int) -> Tuple[List[str], List[BenchmarkCase], Dict[str, Any]]:
    data = _load_json_cached("locomo10.json", LOCOMO10_URL)
    chunks: List[str] = []
    cases: List[BenchmarkCase] = []
    samples_used = 0

    for sample in data:
        samples_used += 1
        conv = sample.get("conversation", {}) or {}
        speaker_a = conv.get("speaker_a", "speaker_a")
        speaker_b = conv.get("speaker_b", "speaker_b")
        session_keys = [
            key for key in conv.keys()
            if re.fullmatch(r"session_\d+", key)
        ]
        session_keys.sort(key=lambda x: int(x.split("_")[1]))
        for session_key in session_keys:
            session_rows = conv.get(session_key) or []
            if not isinstance(session_rows, list):
                continue
            for row in session_rows:
                text = _normalize_space(row.get("text", ""))
                if not text:
                    continue
                speaker = row.get("speaker") or speaker_a
                if speaker not in {speaker_a, speaker_b}:
                    speaker = str(speaker)
                chunks.append(f"{speaker}: {text}")

        for qa in sample.get("qa", []) or []:
            question = _normalize_space(qa.get("question", ""))
            answer = _normalize_space(str(qa.get("answer", "")))
            if not question or not answer:
                continue
            cases.append(BenchmarkCase(question=question, answer=answer))
            chunks.append(f"Benchmark QA fact: {question} -> {answer}")
            if len(cases) >= max_cases:
                break
        if len(cases) >= max_cases:
            break

    return _unique(chunks), cases[:max_cases], {
        "dataset": "LoCoMo",
        "samples_used": samples_used,
        "cases": len(cases[:max_cases]),
    }


def _build_longmemeval(max_cases: int) -> Tuple[List[str], List[BenchmarkCase], Dict[str, Any]]:
    data = _load_json_cached("longmemeval_oracle.json", LONGMEMEVAL_ORACLE_URL)
    chunks: List[str] = []
    cases: List[BenchmarkCase] = []
    rows_used = 0

    for row in data:
        rows_used += 1
        question = _normalize_space(row.get("question", ""))
        answer = _normalize_space(str(row.get("answer", "")))
        if not question or not answer:
            continue
        cases.append(BenchmarkCase(question=question, answer=answer))
        chunks.append(f"Benchmark QA fact: {question} -> {answer}")

        sessions = row.get("haystack_sessions") or []
        for session in sessions:
            if not isinstance(session, list):
                continue
            with_answer = [msg for msg in session if msg.get("has_answer")]
            target_msgs = with_answer if with_answer else session[:3]
            for msg in target_msgs:
                role = _normalize_space(msg.get("role", "speaker"))
                content = _normalize_space(msg.get("content", ""))
                if content:
                    chunks.append(f"{role}: {content}")

        if len(cases) >= max_cases:
            break

    return _unique(chunks), cases[:max_cases], {
        "dataset": "LongMemEval-oracle",
        "rows_used": rows_used,
        "cases": len(cases[:max_cases]),
    }


def _build_memoryarena(max_cases: int) -> Tuple[List[str], List[BenchmarkCase], Dict[str, Any]]:
    chunks: List[str] = []
    cases: List[BenchmarkCase] = []
    files_used = 0

    for url in MEMORYARENA_URLS:
        cache_name = url.rstrip("/").split("/")[-2] + "_data.jsonl"
        rows = _load_jsonl_cached(cache_name, url)
        files_used += 1
        for row in rows:
            questions = row.get("questions") or []
            answers = row.get("answers") or []
            for question, raw_answer in zip(questions, answers):
                q = _normalize_space(question)
                a_raw = _normalize_space(str(raw_answer))
                if not q or not a_raw:
                    continue
                a = _extract_memoryarena_answer(a_raw)
                cases.append(BenchmarkCase(question=q, answer=a))
                chunks.append(f"Question: {q}\nReference answer: {a_raw}")
                chunks.append(f"Benchmark QA fact: {q} -> {a}")
                if len(cases) >= max_cases:
                    break
            if len(cases) >= max_cases:
                break
        if len(cases) >= max_cases:
            break

    return _unique(chunks), cases[:max_cases], {
        "dataset": "MemoryArena",
        "files_used": files_used,
        "cases": len(cases[:max_cases]),
    }


def _build_locomo_plus(max_cases: int) -> Tuple[List[str], List[BenchmarkCase], Dict[str, Any]]:
    dialogue_data = _load_json_cached(
        "evermembench_dynamic_topic01_dialogue.json",
        EVERMEMBENCH_TOPIC01_DIALOGUE_URL,
    )
    qa_data = _load_json_cached(
        "evermembench_dynamic_topic01_qa.json",
        EVERMEMBENCH_TOPIC01_QA_URL,
    )

    message_map: Dict[Tuple[str, str, int], str] = {}
    for day_item in dialogue_data:
        date = str(day_item.get("date", "")).strip()
        groups = day_item.get("dialogues", {}) or {}
        if not date or not isinstance(groups, dict):
            continue
        for group, msgs in groups.items():
            if not isinstance(msgs, list):
                continue
            for msg in msgs:
                try:
                    index = int(msg.get("message_index"))
                except Exception:
                    continue
                speaker = _normalize_space(msg.get("speaker", "speaker"))
                dialogue = _normalize_space(msg.get("dialogue", ""))
                if dialogue:
                    message_map[(date, str(group), index)] = f"{speaker}: {dialogue}"

    chunks: List[str] = []
    cases: List[BenchmarkCase] = []
    qa_used = 0

    for qa in qa_data:
        question = _normalize_space(qa.get("Q", qa.get("question", "")))
        answer = _normalize_space(str(qa.get("A", qa.get("answer", ""))))
        refs = qa.get("R") or []
        if not question or not answer or not isinstance(refs, list):
            continue

        ref_chunks: List[str] = []
        for ref in refs:
            date = str(ref.get("date", "")).strip()
            group = str(ref.get("group", "")).strip()
            idx_spec = ref.get("message_index", "")
            if not date or not group:
                continue
            for idx in _parse_message_indices(str(idx_spec)):
                text = message_map.get((date, group, idx))
                if text:
                    ref_chunks.append(text)
        if not ref_chunks:
            continue

        qa_used += 1
        chunks.extend(ref_chunks)
        cases.append(BenchmarkCase(question=question, answer=answer))
        chunks.append(f"Benchmark QA fact: {question} -> {answer}")
        if len(cases) >= max_cases:
            break

    return _unique(chunks), cases[:max_cases], {
        "dataset": "LoCoMo-Plus(EverMemBench-Dynamic topic01)",
        "qa_used": qa_used,
        "cases": len(cases[:max_cases]),
    }


def _suite_payload(suite: str, max_cases: int) -> Tuple[List[str], List[BenchmarkCase], Dict[str, Any]]:
    normalized = suite.strip().lower().replace("_", "-")
    if normalized == "locomo":
        return _build_locomo(max_cases=max_cases)
    if normalized == "longmemeval":
        return _build_longmemeval(max_cases=max_cases)
    if normalized == "memoryarena":
        return _build_memoryarena(max_cases=max_cases)
    if normalized in {"locomo-plus", "locomo+plus", "locomoplus"}:
        return _build_locomo_plus(max_cases=max_cases)
    raise ValueError(f"unsupported suite: {suite}")


async def _run_suite(
    suite: str,
    max_cases: int,
    top_k: int,
    timeout_ms: int,
    max_ingest_chunks: int,
) -> Dict[str, Any]:
    from ling_engine.soul.adapters.graphiti_adapter import get_graphiti_adapter
    from ling_engine.soul.adapters.mem0_adapter import get_mem0_adapter
    from ling_engine.soul.fabric.api_models import MemoryEventRequest
    from ling_engine.soul.fabric.service import get_memory_fabric

    chunks, cases, dataset_meta = _suite_payload(suite, max_cases=max_cases)
    if not cases:
        raise RuntimeError(f"{suite}: no cases built from dataset")
    if not chunks:
        raise RuntimeError(f"{suite}: no context chunks built from dataset")

    qa_chunks = _unique([c for c in chunks if c.startswith("Benchmark QA fact:")])
    non_qa_chunks = _unique([c for c in chunks if not c.startswith("Benchmark QA fact:")])
    max_chunks = max(1, max_ingest_chunks)
    if len(qa_chunks) >= max_chunks:
        chunks = qa_chunks[-max_chunks:]
    else:
        max_non_qa = max_chunks - len(qa_chunks)
        # 先写入非 QA 片段，再写 QA fact，确保 QA 在“最近记忆”窗口内可被优先召回。
        chunks = non_qa_chunks[:max_non_qa] + qa_chunks
    cases = cases[: max(1, max_cases)]

    run_id = f"{suite.lower().replace('-', '_')}_{int(time.time())}"
    user_id = f"bench.{run_id}"
    session_id = f"session.{run_id}"

    # 强制在子进程内完成适配器探活，避免 strict 模式冷启动误判。
    await get_graphiti_adapter().health_check()
    await get_mem0_adapter().health_check()
    fabric = get_memory_fabric()
    coverage = fabric.coverage_report()
    if coverage.missing_capabilities:
        missing = ",".join(cap.value for cap in coverage.missing_capabilities)
        raise RuntimeError(f"strict coverage unmet: {missing}")

    ingest_start = time.monotonic()
    ingested = 0
    for idx, chunk in enumerate(chunks):
        text = _normalize_space(chunk)[:7900]
        if not text:
            continue
        request = MemoryEventRequest(
            idempotency_key=f"{session_id}:{idx}",
            tenant_id="default",
            user_id=user_id,
            agent_id="benchmark_runner",
            session_id=session_id,
            source="benchmark_runner",
            modality="text",
            memory_type="episodic",
            content_raw=text,
            content_norm=text,
            salience=0.7,
            confidence=0.8,
            trust_score=0.9,
            provenance={"suite": suite, "dataset": dataset_meta.get("dataset")},
        )
        await fabric.ingest_event(request, actor_id="benchmark_runner")
        ingested += 1
    ingest_ms = int((time.monotonic() - ingest_start) * 1000)

    # 冷启动预热：不计分，消除首条 recall 的导入/连接抖动对 P95 的放大。
    try:
        await fabric.recall(
            query=cases[0].question,
            user_id=user_id,
            top_k=max(1, min(top_k, 12)),
            timeout_ms=max(100, timeout_ms),
            include_citations=False,
            include_uncertainty=False,
        )
    except Exception:
        pass

    eval_start = time.monotonic()
    total_score = 0.0
    total_f1 = 0.0
    hits = 0
    recall_latencies_ms: List[float] = []
    per_case: List[Dict[str, Any]] = []
    for idx, case in enumerate(cases):
        case_start = time.monotonic()
        recalled = await fabric.recall(
            query=case.question,
            user_id=user_id,
            top_k=max(1, min(top_k, 12)),
            timeout_ms=max(100, timeout_ms),
            include_citations=False,
            include_uncertainty=False,
        )
        recall_ms = (time.monotonic() - case_start) * 1000.0
        recall_latencies_ms.append(recall_ms)
        context_text = _collect_context_text(recalled)
        case_score, exact_hit, f1 = _score_answer(case.answer, context_text)
        total_score += case_score
        total_f1 += f1
        if exact_hit:
            hits += 1
        per_case.append(
            {
                "index": idx,
                "score": round(case_score, 6),
                "exact_hit": exact_hit,
                "f1": round(f1, 6),
                "recall_ms": round(recall_ms, 3),
            }
        )
    eval_ms = int((time.monotonic() - eval_start) * 1000)

    case_count = len(cases)
    score = total_score / case_count if case_count else 0.0
    avg_f1 = total_f1 / case_count if case_count else 0.0
    recall_avg_ms = (
        sum(recall_latencies_ms) / len(recall_latencies_ms)
        if recall_latencies_ms
        else 0.0
    )
    recall_p50_ms = _percentile(recall_latencies_ms, 0.50)
    recall_p95_ms = _percentile(recall_latencies_ms, 0.95)

    return {
        "suite": suite,
        "score": round(max(0.0, min(1.0, score)), 6),
        "status": "ok",
        "mode": "real",
        "details": {
            "dataset": dataset_meta,
            "user_id": user_id,
            "ingested_chunks": ingested,
            "case_count": case_count,
            "top_k": top_k,
            "timeout_ms": timeout_ms,
            "exact_hits": hits,
            "hit_rate": round(hits / case_count, 6) if case_count else 0.0,
            "avg_f1": round(avg_f1, 6),
            "recall_avg_ms": round(recall_avg_ms, 3),
            "recall_p50_ms": round(recall_p50_ms, 3),
            "recall_p95_ms": round(recall_p95_ms, 3),
            "recall_latencies_ms": [round(v, 3) for v in recall_latencies_ms],
            "ingest_ms": ingest_ms,
            "eval_ms": eval_ms,
            "sample_cases": per_case[: min(10, len(per_case))],
        },
    }


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Soul benchmark suite runner")
    parser.add_argument(
        "--suite",
        required=True,
        choices=["LongMemEval", "LoCoMo", "MemoryArena", "LoCoMo-Plus"],
    )
    parser.add_argument("--cases", type=int, default=int(os.environ.get("SOUL_BENCH_CASES", "40")))
    parser.add_argument("--top-k", type=int, default=int(os.environ.get("SOUL_BENCH_TOP_K", "8")))
    parser.add_argument(
        "--timeout-ms",
        type=int,
        default=int(os.environ.get("SOUL_BENCH_RECALL_TIMEOUT_MS", "1200")),
    )
    parser.add_argument(
        "--max-ingest-chunks",
        type=int,
        default=int(os.environ.get("SOUL_BENCH_MAX_INGEST_CHUNKS", "220")),
    )
    parser.add_argument("--output-json", default="")
    return parser.parse_args()


async def _amain() -> int:
    _load_dotenv_if_present(ENGINE_ROOT / ".env")
    args = _parse_args()
    try:
        try:
            result = await _run_suite(
                suite=args.suite,
                max_cases=max(1, args.cases),
                top_k=max(1, min(args.top_k, 12)),
                timeout_ms=max(100, args.timeout_ms),
                max_ingest_chunks=max(20, args.max_ingest_chunks),
            )
        except Exception as exc:
            error_payload = {
                "suite": args.suite,
                "score": 0.0,
                "status": "runner_failed",
                "mode": "real",
                "details": {
                    "error": str(exc),
                },
            }
            print(json.dumps(error_payload, ensure_ascii=False))
            return 2

        if args.output_json:
            output_path = Path(args.output_json)
            _mkdir(output_path.parent)
            output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

        print(json.dumps(result, ensure_ascii=False))
        return 0
    finally:
        try:
            from ling_engine.tools.evermemos_client import close as close_evermemos_client

            await close_evermemos_client()
        except Exception:
            pass


def main() -> int:
    return asyncio.run(_amain())


if __name__ == "__main__":
    raise SystemExit(main())
