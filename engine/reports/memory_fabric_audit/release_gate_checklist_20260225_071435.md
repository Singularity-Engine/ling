# Soul Memory Release Gate Checklist
- Generated At (UTC): 2026-02-25T07:14:35.718796+00:00

- [x] G1 Dependencies Online — ports_ok=True, imports_ok=True, adapters_ok=True
- [x] G2 Strict Coverage — missing_capabilities=[], unhealthy=[], plan_error=None
- [ ] G3 Real Benchmarks Passed — suites={'LongMemEval': {'status': None, 'mode': None, 'score': None}, 'LoCoMo': {'status': None, 'mode': None, 'score': None}, 'MemoryArena': {'status': None, 'mode': None, 'score': None}, 'LoCoMo-Plus': {'status': None, 'mode': None, 'score': None}}, benchmark_error=benchmark gates unmet: missing_runners=[], failed_improvement=[{'suite': 'LongMemEval', 'score': 0.257759, 'baseline': 0.35, 'delta': -0.092241}, {'suite': 'LoCoMo', 'score': 0.001179, 'baseline': 0.4, 'delta': -0.398821}, {'suite': 'LoCoMo-Plus', 'score': 0.130847, 'baseline': 0.35, 'delta': -0.219153}], missing_baseline=[]
- [ ] G4 Improvement Gate — failed_improvement=[], missing_baseline=[]
- [x] G5 Benchmark Persistence — persisted_suites=['LoCoMo', 'LoCoMo-Plus', 'LongMemEval', 'MemoryArena']
- [ ] G6 Recall P95 SLO — recall_p95_ms=None, target_ms=450

- Final Decision: BLOCKED
- SOTA Verdict: NOT_REACHED