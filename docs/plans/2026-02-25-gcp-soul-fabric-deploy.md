# GCP Soul Fabric 部署 + 用户硬隔离 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 GCP 部署 Soul Memory Fabric，实现三层硬隔离和四级权限控制。

**Architecture:** Soul Fabric 嵌入 ling-engine 容器，复用已有 MongoDB (memsys-mongodb) 和 Qdrant (ling-qdrant)，新增 Neo4j + Ollama 容器。数据隔离通过 Store 查询守卫 + API 鉴权 + MongoDB 索引三层实现。

**Tech Stack:** Python 3.11, FastAPI, MongoDB (motor), Qdrant, Neo4j, Ollama, soul-fabric package

**Design Doc:** `docs/plans/2026-02-25-gcp-soul-fabric-deploy-design.md`

---

### Task 1: MemoryAtom 增加 session_type 字段

**Files:**
- Modify: `/Users/caoruipeng/soul-memory-fabric/src/soul_fabric/atom.py:19-53`
- Modify: `/Users/caoruipeng/soul-memory-fabric/src/soul_fabric/api_models.py:11-56`
- Test: `/Users/caoruipeng/soul-memory-fabric/tests/test_service.py`

**Step 1: Write the failing test**

```python
# tests/test_atom.py (新建)
from soul_fabric.atom import MemoryAtom

def test_memory_atom_has_session_type():
    atom = MemoryAtom(
        user_id="alice",
        content_raw="test",
        session_type="websocket",
    )
    assert atom.session_type == "websocket"

def test_memory_atom_session_type_defaults_to_unknown():
    atom = MemoryAtom(user_id="alice", content_raw="test")
    assert atom.session_type == "unknown"

def test_memory_atom_session_type_validates():
    """只允许 websocket/telegram/cron/api/unknown"""
    import pytest
    with pytest.raises(Exception):
        MemoryAtom(user_id="alice", content_raw="test", session_type="invalid_type")
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/caoruipeng/soul-memory-fabric && .venv/bin/pytest tests/test_atom.py -v`
Expected: FAIL — `session_type` 字段不存在

**Step 3: Write implementation**

在 `atom.py` 的 MemoryAtom 类中，`session_id` 字段后面添加:
```python
    session_type: str = "unknown"  # websocket | telegram | cron | api | unknown
```

在 `api_models.py` 的 MemoryEventRequest 类中，`session_id` 字段后面添加:
```python
    session_type: str = "unknown"  # websocket | telegram | cron | api | unknown
```

在 `service.py` 的 `ingest_event` 方法中，MemoryAtom 构造处传入 `session_type`:
```python
    atom = MemoryAtom(
        ...
        session_id=req.session_id,
        session_type=req.session_type,  # 新增
        ...
    )
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/caoruipeng/soul-memory-fabric && .venv/bin/pytest tests/test_atom.py -v`
Expected: 3 PASSED

**Step 5: Commit**

```bash
cd /Users/caoruipeng/soul-memory-fabric
git add src/soul_fabric/atom.py src/soul_fabric/api_models.py src/soul_fabric/service.py tests/test_atom.py
git commit -m "feat: add session_type field to MemoryAtom and MemoryEventRequest"
```

---

### Task 2: Store 查询守卫 — 所有查询强制 user_id

**Files:**
- Modify: `/Users/caoruipeng/soul-memory-fabric/src/soul_fabric/store.py`
- Test: `/Users/caoruipeng/soul-memory-fabric/tests/test_store.py`

**Step 1: Write the failing test**

在 `tests/test_store.py` 中追加:

```python
import pytest
from soul_fabric.store import MemoryFabricStore

def test_scoped_query_requires_user_id():
    store = MemoryFabricStore()
    with pytest.raises(ValueError, match="user_id is required"):
        store._scoped_query(user_id="")

def test_scoped_query_rejects_none():
    store = MemoryFabricStore()
    with pytest.raises(ValueError, match="user_id is required"):
        store._scoped_query(user_id=None)

def test_scoped_query_builds_filter():
    store = MemoryFabricStore()
    f = store._scoped_query(user_id="alice", extra_filter={"state": "raw"})
    assert f == {"user_id": "alice", "state": "raw"}

def test_scoped_query_always_includes_user_id():
    store = MemoryFabricStore()
    f = store._scoped_query(user_id="bob")
    assert "user_id" in f
    assert f["user_id"] == "bob"

def test_global_query_rejects_non_admin():
    store = MemoryFabricStore()
    with pytest.raises(PermissionError, match="system or admin"):
        store._global_query(caller_role="user")

def test_global_query_allows_system():
    store = MemoryFabricStore()
    f = store._global_query(caller_role="system", extra_filter={"state": "raw"})
    assert f == {"state": "raw"}
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/caoruipeng/soul-memory-fabric && .venv/bin/pytest tests/test_store.py -v`
Expected: FAIL — `_scoped_query` 方法不存在

**Step 3: Write implementation**

在 `store.py` 的 `MemoryFabricStore` 类中，在第一个方法之前添加:

```python
    def _scoped_query(self, user_id: str, extra_filter: dict = None) -> dict:
        """所有查询必经入口 — user_id 为必需参数。"""
        if not user_id or not isinstance(user_id, str):
            raise ValueError("user_id is required and must be non-empty string")
        base = {"user_id": user_id}
        if extra_filter:
            base.update(extra_filter)
        return base

    def _global_query(self, caller_role: str, extra_filter: dict = None) -> dict:
        """仅 system/admin 角色可调用的全局查询。"""
        if caller_role not in ("system", "admin"):
            raise PermissionError("global query requires system or admin role")
        return extra_filter or {}
```

然后逐一更新现有查询方法，用 `_scoped_query` 替换手写 filter:

- `list_recent_atoms`: 改用 `self._scoped_query(user_id, {"tenant_id": tenant_id})`
- `list_core_blocks`: 改用 `self._scoped_query(user_id, {"tenant_id": tenant_id})`
- `list_procedural_rules`: 改用 `self._scoped_query(user_id, ...)`
- `list_shadow_entries`: 改用 `self._scoped_query(user_id, ...)`
- `load_traces`: 改用 `self._scoped_query(user_id, {"memory_id": memory_id})`
  注意: `load_traces` 当前只按 `memory_id` 查询，需增加 `user_id` 参数

- `delete_expired_atoms`: 这是全局操作，改用 `_global_query(caller_role="system", ...)`

**Step 4: Run all tests**

Run: `cd /Users/caoruipeng/soul-memory-fabric && .venv/bin/pytest tests/ -v`
Expected: ALL PASSED

**Step 5: Commit**

```bash
cd /Users/caoruipeng/soul-memory-fabric
git add src/soul_fabric/store.py tests/test_store.py
git commit -m "feat: add query guard — enforce user_id on all store queries"
```

---

### Task 3: 更新 soul-memory-fabric __init__.py 导出并推送

**Files:**
- Modify: `/Users/caoruipeng/soul-memory-fabric/src/soul_fabric/__init__.py`

**Step 1: 确认所有新增公开 API 已导出**

检查 `__init__.py` 的 `__all__` 列表是否包含所有新增的公开接口。

**Step 2: 运行完整测试套件**

Run: `cd /Users/caoruipeng/soul-memory-fabric && .venv/bin/pytest tests/ -v`
Expected: ALL PASSED

**Step 3: 推送到 GitHub**

```bash
cd /Users/caoruipeng/soul-memory-fabric
git push origin main
```

---

### Task 4: ling-platform 更新 soul-fabric 依赖

**Files:**
- 无代码变更，只重新安装

**Step 1: 更新 soul-fabric 包**

```bash
cd /Users/caoruipeng/Projects/ling-platform/engine
.venv/bin/pip install --force-reinstall --no-deps \
  "soul-fabric @ git+https://github.com/Singularity-Engine/soul-memory-fabric.git"
```

**Step 2: 验证新字段可用**

```bash
.venv/bin/python -c "
from soul_fabric import MemoryEventRequest
req = MemoryEventRequest(
    idempotency_key='test12345678',
    user_id='alice',
    content_raw='hello',
    session_type='websocket',
    entities=[], relations=[], affect={}, provenance={}, pii_tags=[],
)
print(f'session_type={req.session_type}')
print('OK')
"
```
Expected: `session_type=websocket` + `OK`

---

### Task 5: docker-compose.prod.yml 新增 Neo4j + Ollama

**Files:**
- Modify: `/Users/caoruipeng/Projects/ling-platform/docker-compose.prod.yml`

**Step 1: 在 docker-compose.prod.yml 的 services 段追加两个服务**

```yaml
  neo4j:
    image: neo4j:5-community
    container_name: ling-neo4j
    restart: unless-stopped
    ports:
      - "7474:7474"
      - "7687:7687"
    environment:
      NEO4J_AUTH: "neo4j/${NEO4J_PASSWORD:-password}"
      NEO4J_PLUGINS: '["apoc"]'
      NEO4J_server_memory_heap_initial__size: "512m"
      NEO4J_server_memory_heap_max__size: "1g"
    volumes:
      - neo4j-data:/data
    networks:
      - ling-net
    healthcheck:
      test: ["CMD", "cypher-shell", "-u", "neo4j", "-p", "${NEO4J_PASSWORD:-password}", "RETURN 1"]
      interval: 30s
      timeout: 10s
      retries: 5

  ollama:
    image: ollama/ollama:latest
    container_name: ling-ollama
    restart: unless-stopped
    ports:
      - "11434:11434"
    volumes:
      - ollama-data:/root/.ollama
    networks:
      - ling-net
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:11434/api/tags"]
      interval: 30s
      timeout: 10s
      retries: 3
```

**Step 2: 在 volumes 段追加**

```yaml
  neo4j-data:
  ollama-data:
```

**Step 3: 更新 ling-engine 的 depends_on 增加 neo4j**

在 ling-engine service 的 `depends_on` 中追加:
```yaml
      neo4j:
        condition: service_healthy
```

**Step 4: Commit**

```bash
cd /Users/caoruipeng/Projects/ling-platform
git add docker-compose.prod.yml
git commit -m "feat(deploy): add Neo4j and Ollama containers for Soul Fabric"
```

---

### Task 6: .env.docker 新增 Soul Fabric 环境变量

**Files:**
- Modify: `/Users/caoruipeng/Projects/ling-platform/.env.docker`

**Step 1: 在 .env.docker 末尾追加 Soul Fabric 配置块**

```bash
# ====== Soul Memory Fabric ======
SOUL_ENABLED=true
SOUL_FABRIC_ENABLED=true
SOUL_FABRIC_STRICT_MODE=false
MONGO_URL=mongodb://admin:memsys123@memsys-mongodb:27017
MONGO_DB=ling_soul
SOUL_AGENT_KEY=<生成一个安全随机字符串>

# Providers
GRAPHITI_ENABLED=true
MEM0_ENABLED=true
SOUL_LETTA_ENABLED=true
SOUL_LANGMEM_ENABLED=true
SOUL_AMEM_ENABLED=true
SOUL_MEMGUARD_ENABLED=true

# Neo4j (Graphiti backend)
GRAPHITI_URI=bolt://neo4j:7687
GRAPHITI_USER=neo4j
GRAPHITI_PASSWORD=<同 NEO4J_PASSWORD>
NEO4J_PASSWORD=<安全密码>

# Ollama (Embedding)
OLLAMA_BASE_URL=http://ollama:11434
SOUL_EXTRACTION_MODEL=gpt-4o-mini

# Qdrant (已有)
QDRANT_URL=http://qdrant:6333

# SLO
SOUL_SLO_RECALL_P95_MS=450
SOUL_SLO_WINDOW_SIZE=200
```

**Step 2: Commit** (不推送，因为包含 placeholder 密码)

```bash
cd /Users/caoruipeng/Projects/ling-platform
git add .env.docker
git commit -m "feat(deploy): add Soul Fabric environment variables"
```

---

### Task 7: Dockerfile.china 确保 soul-fabric 依赖安装

**Files:**
- Modify: `/Users/caoruipeng/Projects/ling-platform/engine/Dockerfile.china`

**Step 1: 检查 Dockerfile 是否安装 git (soul-fabric 是 git 依赖)**

如果没有 git，在 pip install 之前添加:
```dockerfile
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*
```

**Step 2: 确认 `pip install -e .` 会安装 soul-fabric**

engine 的 `pyproject.toml` 已包含 `soul-fabric @ git+https://...`，`pip install -e .` 会自动拉取。
验证: 在本地 `grep soul-fabric engine/pyproject.toml` 确认依赖存在。

**Step 3: 如果 Dockerfile 需要改动则 commit**

```bash
git add engine/Dockerfile.china
git commit -m "fix(deploy): ensure git available for soul-fabric installation"
```

---

### Task 8: ling-engine docker-compose environment 传入 Soul 变量

**Files:**
- Modify: `/Users/caoruipeng/Projects/ling-platform/docker-compose.prod.yml`

**Step 1: 在 ling-engine service 的 environment 段追加 Soul 变量**

```yaml
    environment:
      # ... existing vars ...
      # Soul Memory Fabric
      SOUL_ENABLED: "${SOUL_ENABLED}"
      SOUL_FABRIC_ENABLED: "${SOUL_FABRIC_ENABLED}"
      SOUL_FABRIC_STRICT_MODE: "${SOUL_FABRIC_STRICT_MODE}"
      MONGO_URL: "${MONGO_URL}"
      MONGO_DB: "${MONGO_DB}"
      SOUL_AGENT_KEY: "${SOUL_AGENT_KEY}"
      GRAPHITI_ENABLED: "${GRAPHITI_ENABLED}"
      MEM0_ENABLED: "${MEM0_ENABLED}"
      SOUL_LETTA_ENABLED: "${SOUL_LETTA_ENABLED}"
      SOUL_LANGMEM_ENABLED: "${SOUL_LANGMEM_ENABLED}"
      SOUL_AMEM_ENABLED: "${SOUL_AMEM_ENABLED}"
      SOUL_MEMGUARD_ENABLED: "${SOUL_MEMGUARD_ENABLED}"
      GRAPHITI_URI: "${GRAPHITI_URI}"
      GRAPHITI_USER: "${GRAPHITI_USER}"
      GRAPHITI_PASSWORD: "${GRAPHITI_PASSWORD}"
      OLLAMA_BASE_URL: "${OLLAMA_BASE_URL}"
      SOUL_EXTRACTION_MODEL: "${SOUL_EXTRACTION_MODEL}"
      QDRANT_URL: "${QDRANT_URL}"
      SOUL_SLO_RECALL_P95_MS: "${SOUL_SLO_RECALL_P95_MS}"
```

**Step 2: 确保 memsys-mongodb 在 ling-engine 的 networks 中可达**

ling-engine 使用 `ling-net` 网络，但 `memsys-mongodb` 在另一个 compose stack 中。需要通过 `extra_hosts` 或 `external_links` 连接，或在 ling-engine service 加入 memsys 的网络。

最简方案: 在 docker-compose.prod.yml 中引用已有的外部网络:
```yaml
    networks:
      - ling-net
      - memsys-net    # 加入 memsys 网络以访问 MongoDB
```

并在 networks 段声明:
```yaml
  memsys-net:
    external: true
    name: memsys_default  # memsys docker-compose 的默认网络名
```

**Step 3: Commit**

```bash
git add docker-compose.prod.yml
git commit -m "feat(deploy): pass Soul Fabric env vars to ling-engine container"
```

---

### Task 9: MongoDB 索引创建脚本

**Files:**
- Create: `/Users/caoruipeng/Projects/ling-platform/engine/scripts/create_soul_indexes.js`

**Step 1: 创建 MongoDB 索引脚本**

```javascript
// create_soul_indexes.js
// 运行: docker exec memsys-mongodb mongosh ling_soul < create_soul_indexes.js

// memory_atoms — 主查询索引
db.memory_atoms.createIndex(
  { user_id: 1, state: 1, created_at: -1 },
  { name: "idx_user_state_time" }
);
db.memory_atoms.createIndex(
  { user_id: 1, session_type: 1, created_at: -1 },
  { name: "idx_user_session_time" }
);
db.memory_atoms.createIndex(
  { user_id: 1, tenant_id: 1, event_time: -1 },
  { name: "idx_user_tenant_event" }
);
db.memory_atoms.createIndex(
  { idempotency_key: 1, tenant_id: 1, user_id: 1 },
  { name: "idx_idempotency", unique: true, sparse: true }
);

// memory_traces
db.memory_traces.createIndex(
  { user_id: 1, memory_id: 1, created_at: 1 },
  { name: "idx_user_memory_trace" }
);

// core_blocks
db.core_blocks.createIndex(
  { user_id: 1, block_type: 1 },
  { name: "idx_user_block" }
);

// procedural_rules
db.procedural_rules.createIndex(
  { user_id: 1, active: 1, priority: -1 },
  { name: "idx_user_active_priority" }
);

// safety_shadow
db.safety_shadow.createIndex(
  { user_id: 1, created_at: -1 },
  { name: "idx_user_shadow" }
);

// benchmark_runs
db.benchmark_runs.createIndex(
  { started_at: -1 },
  { name: "idx_bench_time" }
);

// slo_metrics
db.slo_metrics.createIndex(
  { recorded_at: -1 },
  { name: "idx_slo_time" }
);

print("All Soul Fabric indexes created successfully.");
```

**Step 2: Commit**

```bash
git add engine/scripts/create_soul_indexes.js
git commit -m "feat(deploy): MongoDB index creation script for Soul Fabric"
```

---

### Task 10: MongoDB 每日备份 cron

**Files:**
- Create: `/Users/caoruipeng/Projects/ling-platform/engine/scripts/soul_backup.sh`

**Step 1: 创建备份脚本**

```bash
#!/bin/bash
# soul_backup.sh — 每日备份 ling_soul 数据库
BACKUP_DIR="/data/backups"
DATE=$(date +%Y%m%d)
TARGET="${BACKUP_DIR}/soul_${DATE}"

mkdir -p "${BACKUP_DIR}"

docker exec memsys-mongodb mongodump \
  --db ling_soul \
  --out "/data/backups/soul_${DATE}" \
  --gzip \
  --quiet

if [ $? -eq 0 ]; then
  echo "[$(date)] Soul backup OK: ${TARGET}" >> /var/log/soul-backup.log
else
  echo "[$(date)] Soul backup FAILED" >> /var/log/soul-backup.log
fi

# 保留 7 天
find "${BACKUP_DIR}" -name "soul_*" -mtime +7 -exec rm -rf {} + 2>/dev/null
```

**Step 2: Commit**

```bash
chmod +x engine/scripts/soul_backup.sh
git add engine/scripts/soul_backup.sh
git commit -m "feat(deploy): daily MongoDB backup script for Soul Fabric"
```

---

### Task 11: deploy.sh 追加 Soul Fabric 健康检查

**Files:**
- Modify: `/Users/caoruipeng/Projects/ling-platform/deploy.sh`

**Step 1: 在 deploy.sh 的 health check 段追加**

在现有 qdrant healthcheck 之后添加:
```bash
echo "Checking Neo4j..."
${SSH_CMD} "docker exec ling-neo4j cypher-shell -u neo4j -p \${NEO4J_PASSWORD} 'RETURN 1' 2>/dev/null && echo 'Neo4j: OK' || echo 'Neo4j: FAIL'"

echo "Checking Ollama..."
${SSH_CMD} "curl -sf http://localhost:11434/api/tags >/dev/null && echo 'Ollama: OK' || echo 'Ollama: FAIL'"

echo "Checking Soul Fabric..."
${SSH_CMD} "curl -sf http://localhost:12393/v1/memory/coverage >/dev/null && echo 'Soul Fabric: OK' || echo 'Soul Fabric: NOT RESPONDING (may need auth)'"
```

**Step 2: 追加 Ollama 模型预拉取**

在 `docker compose up -d` 之后、health check 之前添加:
```bash
echo "Pulling Ollama embedding model..."
${SSH_CMD} "docker exec ling-ollama ollama pull qwen3-embedding:0.6b 2>&1 | tail -1"
```

**Step 3: 追加 MongoDB 索引创建**

```bash
echo "Creating Soul Fabric MongoDB indexes..."
${SSH_CMD} "cat ${REMOTE_PATH}/engine/scripts/create_soul_indexes.js | docker exec -i memsys-mongodb mongosh ling_soul --quiet"
```

**Step 4: 追加备份 cron 安装**

```bash
echo "Installing Soul backup cron..."
${SSH_CMD} "echo '0 3 * * * root ${REMOTE_PATH}/engine/scripts/soul_backup.sh' | sudo tee /etc/cron.d/soul-backup > /dev/null"
```

**Step 5: Commit**

```bash
git add deploy.sh
git commit -m "feat(deploy): add Soul Fabric health checks, model pull, index creation, backup cron"
```

---

### Task 12: 端到端验证 — 本地

**Step 1: 本地验证 soul-fabric 导入和查询守卫**

```bash
cd /Users/caoruipeng/Projects/ling-platform/engine
.venv/bin/python -c "
from soul_fabric.store import MemoryFabricStore
store = MemoryFabricStore()

# 验证查询守卫
try:
    store._scoped_query(user_id='')
    print('FAIL: should have raised')
except ValueError as e:
    print(f'Guard works: {e}')

# 验证正常查询
f = store._scoped_query(user_id='alice', extra_filter={'state': 'raw'})
assert f == {'user_id': 'alice', 'state': 'raw'}
print('Filter correct:', f)

# 验证全局查询权限
try:
    store._global_query(caller_role='user')
    print('FAIL: should have raised')
except PermissionError as e:
    print(f'Global guard works: {e}')

print('All guards verified OK')
"
```

**Step 2: 验证 session_type 字段**

```bash
.venv/bin/python -c "
from soul_fabric import MemoryEventRequest
req = MemoryEventRequest(
    idempotency_key='test12345678',
    user_id='alice',
    content_raw='hello world',
    session_type='websocket',
    entities=[], relations=[], affect={}, provenance={}, pii_tags=[],
)
print(f'session_type={req.session_type}')
assert req.session_type == 'websocket'
print('session_type field verified OK')
"
```

---

### Task 13: 部署到 GCP

**Step 1: 推送代码**

```bash
cd /Users/caoruipeng/Projects/ling-platform
git push origin rebrand/ling
```

**Step 2: 运行 deploy.sh**

```bash
./deploy.sh
```

**Step 3: 验证 Soul Fabric 状态**

```bash
# SSH 到 GCP 验证
ssh -i ~/.ssh/ling_engine_deploy open-llm-vtuber-deploy@136.113.4.243

# 检查容器状态
docker ps --format 'table {{.Names}}\t{{.Status}}'

# 检查 Soul Fabric coverage
curl -s http://localhost:12393/v1/memory/coverage | python3 -m json.tool

# 测试隔离 — 写入 user alice 的记忆
curl -X POST http://localhost:12393/v1/memory/events \
  -H "X-Agent-Key: ${SOUL_AGENT_KEY}" \
  -H "X-Agent-Id: test" \
  -H "Content-Type: application/json" \
  -d '{
    "idempotency_key": "test_alice_001",
    "user_id": "alice",
    "content_raw": "Alice likes hiking",
    "session_type": "api",
    "entities": [], "relations": [], "affect": {},
    "provenance": {}, "pii_tags": []
  }'

# 测试隔离 — bob 不应能召回 alice 的记忆
curl -X POST http://localhost:12393/v1/memory/recall \
  -H "X-Agent-Key: ${SOUL_AGENT_KEY}" \
  -H "X-Agent-Id: test" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "bob", "query": "hiking", "top_k": 5}'
# Expected: 空结果

# 测试 — alice 能召回自己的记忆
curl -X POST http://localhost:12393/v1/memory/recall \
  -H "X-Agent-Key: ${SOUL_AGENT_KEY}" \
  -H "X-Agent-Id: test" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "alice", "query": "hiking", "top_k": 5}'
# Expected: 返回 alice 的 hiking 记忆
```

**Step 4: 验证备份 cron**

```bash
# 手动执行一次备份
sudo ${REMOTE_PATH}/engine/scripts/soul_backup.sh
ls -la /data/backups/
```
