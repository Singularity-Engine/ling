# Memory Benchmark Runners

This directory contains real benchmark runners used by `MemoryBenchmarkRunner`.

## Single Suite Runner

```bash
python scripts/memory_bench/suite_runner.py --suite LongMemEval
python scripts/memory_bench/suite_runner.py --suite LoCoMo
python scripts/memory_bench/suite_runner.py --suite MemoryArena
python scripts/memory_bench/suite_runner.py --suite LoCoMo-Plus
```

Each command prints one JSON line with at least:

```json
{"suite":"LongMemEval","score":0.71,"status":"ok","mode":"real","details":{...}}
```

`MemoryBenchmarkRunner` parses the `score` field and writes run rows to
`soul_benchmark_runs`.

## Strict E2E Audit

```bash
python scripts/memory_bench/strict_e2e_audit.py
```

Outputs:

- strict audit JSON report
- markdown audit report
- release gate checklist (fail => block)
