// Soul Memory Fabric — MongoDB 复合索引
// 所有索引以 user_id 开头，确保用户级隔离的查询性能
// Usage: mongosh ling_soul < create_soul_indexes.js

db = db.getSiblingDB("ling_soul");

print("=== Creating Soul Fabric indexes ===");

// soul_memory_atoms — 核心记忆表
db.soul_memory_atoms.createIndex(
  { user_id: 1, tenant_id: 1, event_time: -1 },
  { name: "idx_atoms_user_tenant_time", background: true }
);
db.soul_memory_atoms.createIndex(
  { user_id: 1, tenant_id: 1, idempotency_key: 1 },
  { name: "idx_atoms_user_tenant_idemp", unique: true, sparse: true, background: true }
);
db.soul_memory_atoms.createIndex(
  { memory_id: 1 },
  { name: "idx_atoms_memory_id", unique: true, background: true }
);
db.soul_memory_atoms.createIndex(
  { ingest_time: 1, state: 1 },
  { name: "idx_atoms_ingest_state", background: true }
);

// soul_memory_traces — 审计追踪
db.soul_memory_traces.createIndex(
  { user_id: 1, memory_id: 1, created_at: 1 },
  { name: "idx_traces_user_memory_time", background: true }
);
db.soul_memory_traces.createIndex(
  { memory_id: 1, created_at: 1 },
  { name: "idx_traces_memory_time", background: true }
);

// soul_core_blocks — Letta 核心块
db.soul_core_blocks.createIndex(
  { user_id: 1, tenant_id: 1, block_type: 1 },
  { name: "idx_blocks_user_tenant_type", unique: true, background: true }
);

// soul_procedural_rules — LangMem 程序性规则
db.soul_procedural_rules.createIndex(
  { user_id: 1, tenant_id: 1, active: 1, priority: -1 },
  { name: "idx_rules_user_tenant_active_prio", background: true }
);

// soul_safety_shadow — 安全影子表
db.soul_safety_shadow.createIndex(
  { user_id: 1, tenant_id: 1, state: 1, created_at: -1 },
  { name: "idx_shadow_user_tenant_state_time", background: true }
);

// soul_benchmark_runs
db.soul_benchmark_runs.createIndex(
  { created_at: -1 },
  { name: "idx_bench_time", background: true }
);

// soul_slo_metrics
db.soul_slo_metrics.createIndex(
  { metric_name: 1, created_at: -1 },
  { name: "idx_slo_name_time", background: true }
);

print("=== All Soul Fabric indexes created ===");
