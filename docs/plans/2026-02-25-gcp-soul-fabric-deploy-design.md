# GCP Soul Fabric 部署 + 用户硬隔离 设计文档

> 日期: 2026-02-25 | 状态: 已批准 | 模式: 工程决策

## 目标

在 GCP 部署 Soul Memory Fabric，实现 ChatGPT 级别的用户硬隔离和分级权限控制。

## 约束

- 单台 GCP VM (4核 16GB, us-central1-a)
- Soul Fabric 嵌入现有 ling-engine 容器
- 复用已有 MongoDB (memsys-mongodb:27017) 和 Qdrant (ling-qdrant:6333)
- 新增 Neo4j + Ollama 容器

## 成功指标

1. 用户 A 的记忆在任何代码路径下不可能泄漏给用户 B
2. 不同角色（用户/Agent/Cron/Admin）权限严格分级
3. Session 来源可追踪
4. P95 recall < 500ms

---

## 1. 部署架构

```
GCP ling-server
├── ling-engine:12393        ← Soul Fabric 嵌入，零额外容器
├── ling-web:3001
├── ling-postgres:5433
├── ling-qdrant:6333         ← 已有，复用
├── ling-redis:6380
├── memsys-mongodb:27017     ← 已有，复用 (新建 ling_soul database)
├── ling-neo4j:7687          ← 新增 (~1.5GB)
└── ling-ollama:11434        ← 新增 (~1GB, qwen3-embedding:0.6b)
```

内存预算: ~5.1GB / 16GB

---

## 2. 用户硬隔离（三层防护）

原则: `user_id` 是数据宇宙的唯一隔离键。跨用户数据访问在架构上不可能。

### 第 1 层: Store 查询守卫（架构级，不可绕过）

```python
class MemoryFabricStore:
    def _scoped_query(self, user_id: str, extra_filter: dict = None) -> dict:
        """所有查询必经入口 — user_id 为必需参数，无例外。"""
        if not user_id or not isinstance(user_id, str):
            raise ValueError("user_id is required and must be non-empty string")
        if not is_valid_user_id(user_id):
            raise ValueError(f"invalid user_id format: {user_id}")
        base = {"user_id": user_id}
        if extra_filter:
            base.update(extra_filter)
        return base

    # 全局操作独立方法，需显式 admin 权限
    def _global_query(self, caller_role: str, extra_filter: dict = None) -> dict:
        """仅 system/admin 角色可调用的全局查询。"""
        if caller_role not in ("system", "admin"):
            raise PermissionError("global query requires system or admin role")
        return extra_filter or {}
```

覆盖范围: `list_recent_atoms`, `search_atoms`, `load_atom`, `fetch_core_blocks`,
`fetch_procedural_rules`, `fetch_safety_alerts`, `append_trace`, `load_traces` —
**全部**通过 `_scoped_query`，零例外。

### 第 2 层: API 鉴权 + 权限分级

详见下方权限模型。

### 第 3 层: MongoDB 索引强制

所有 collection 的主索引以 `user_id` 开头:

```javascript
db.memory_atoms.createIndex({user_id: 1, state: 1, created_at: -1})
db.memory_atoms.createIndex({user_id: 1, session_type: 1, created_at: -1})
db.core_blocks.createIndex({user_id: 1, block_type: 1})
db.procedural_rules.createIndex({user_id: 1, active: 1})
db.safety_shadow.createIndex({user_id: 1})
db.memory_traces.createIndex({user_id: 1, memory_id: 1, created_at: 1})
```

---

## 3. 分级权限模型

四种角色，权限从低到高:

| 权限 | user (WebSocket) | agent:ling-finder (Telegram) | agent:soul-consolidator (Cron) | admin |
|------|:-:|:-:|:-:|:-:|
| 读自己的记忆 | :white_check_mark: | — | — | :white_check_mark: |
| 写自己的记忆 | :white_check_mark: | — | — | :white_check_mark: |
| 读指定用户记忆 | :x: | :white_check_mark: (限目标用户) | :white_check_mark: (逐用户遍历) | :white_check_mark: |
| 写指定用户记忆 | :x: | :white_check_mark: (限目标用户) | :white_check_mark: (逐用户写回) | :white_check_mark: |
| 全局整理 (consolidate) | :x: | :x: | :white_check_mark: | :white_check_mark: |
| 删除用户数据 | :x: | :x: | :x: | :white_check_mark: |
| 查看 SLO/Coverage | :x: | :x: | :x: | :white_check_mark: |
| 运行 Benchmark | :x: | :x: | :x: | :white_check_mark: |

### 角色鉴权实现

```python
# 角色定义
ROLE_USER = "user"           # WebSocket JWT 用户
ROLE_AGENT_FINDER = "agent:ling-finder"    # Telegram ling-finder
ROLE_AGENT_CONSOLIDATOR = "agent:soul-consolidator"  # Cron 整理
ROLE_ADMIN = "admin"         # 管理员

# 鉴权链
def resolve_caller(request) -> CallerContext:
    """从请求中解析调用方身份和权限。"""
    # 1. Agent Key 鉴权 (Telegram / Cron)
    agent_key = request.headers.get("x-agent-key")
    if agent_key and agent_key == SOUL_AGENT_KEY:
        agent_id = request.headers.get("x-agent-id", "unknown")
        return CallerContext(
            caller_id=f"agent:{agent_id}",
            role=_agent_id_to_role(agent_id),  # ling-finder → ROLE_AGENT_FINDER
            allowed_user_ids=_parse_target_users(request),
        )

    # 2. JWT 鉴权 (WebSocket 用户)
    token = extract_jwt(request)
    user = verify_jwt(token)
    return CallerContext(
        caller_id=user["id"],
        role=ROLE_ADMIN if user.get("role") in ("owner", "admin") else ROLE_USER,
        allowed_user_ids=[user["id"]],  # 普通用户只能访问自己
    )
```

### Agent 分级（不同 Agent Key 或 Agent ID 映射不同权限）

| X-Agent-Id | 映射角色 | 允许的操作 |
|------------|---------|-----------|
| `ling-finder` | agent:ling-finder | 为目标用户写入/召回记忆 |
| `soul-consolidator` | agent:soul-consolidator | 全局整理 + 逐用户读写 |
| 其他/未知 | agent (最低) | 仅写入到指定用户 |

---

## 4. Session 来源追踪

每条 MemoryAtom 携带来源元数据（审计字段，不用于隔离）:

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `session_type` | str | 写入来源 | `websocket` / `telegram` / `cron` / `api` |
| `session_id` | str | 会话标识 | `ws_abc123` / `tg_msg_456` / `cron_20260225` |
| `agent_id` | str | 代理标识 | `ling` / `agent:ling-finder` / `agent:soul-consolidator` |

同一用户的记忆跨 session_type 可见（Alice 在 WebSocket 说的话，灵在 Telegram 能召回）。

---

## 5. Cron 全局操作的安全边界

soul-consolidator 需要遍历所有用户，严格约束:

- `consolidate_global()` 需要 `caller_role == "agent:soul-consolidator"` 或 `"admin"`
- 逐用户处理，每用户 300 秒超时
- 整理结果只写回该用户的 namespace（不可跨用户写入）
- 全程审计日志 (memory_traces)
- 异常不影响其他用户（单用户失败继续下一个）

---

## 6. 备份策略

```bash
# /etc/cron.d/soul-backup
# 每日 03:00 UTC
0 3 * * * root docker exec memsys-mongodb mongodump \
  --db ling_soul --out /data/backups/soul_$(date +\%Y\%m\%d) \
  --gzip 2>&1 | logger -t soul-backup

# 保留 7 天
0 4 * * * root find /data/backups -name "soul_*" -mtime +7 -exec rm -rf {} +
```

---

## 7. 环境变量（GCP docker-compose 新增）

```yaml
# ling-engine 新增环境变量
SOUL_ENABLED: "true"
SOUL_FABRIC_ENABLED: "true"
SOUL_FABRIC_STRICT_MODE: "false"
MONGO_URL: "mongodb://admin:memsys123@memsys-mongodb:27017"
MONGO_DB: "ling_soul"
SOUL_AGENT_KEY: "${SOUL_AGENT_KEY}"  # 从 .env 读取
GRAPHITI_ENABLED: "true"
MEM0_ENABLED: "true"
SOUL_LETTA_ENABLED: "true"
SOUL_LANGMEM_ENABLED: "true"
SOUL_AMEM_ENABLED: "true"
SOUL_MEMGUARD_ENABLED: "true"
GRAPHITI_URI: "bolt://ling-neo4j:7687"
GRAPHITI_USER: "neo4j"
GRAPHITI_PASSWORD: "${NEO4J_PASSWORD}"
QDRANT_URL: "http://ling-qdrant:6333"
OLLAMA_BASE_URL: "http://ling-ollama:11434"
```

---

## 8. 验证检查清单

- [ ] `curl /v1/memory/coverage` 返回 200 + 全部 capabilities
- [ ] 用户 A 写入记忆 → 用户 B 无法召回
- [ ] Agent ling-finder 可为指定用户写入/召回
- [ ] Agent soul-consolidator 可执行全局整理
- [ ] 未授权请求返回 401/403
- [ ] `mongodump` 备份正常执行
- [ ] P95 recall < 500ms（通过 SLO endpoint 验证）
