#!/bin/bash
set -e

# ── 配置 ──────────────────────────────────────────
SERVER_IP="136.113.4.243"
SERVER_USER="open-llm-vtuber-deploy"
SSH_KEY="${HOME}/.ssh/ling_engine_deploy"
REMOTE_PATH="/home/${SERVER_USER}/App/ling"
SSH_CMD="ssh -i ${SSH_KEY} -o StrictHostKeyChecking=no ${SERVER_USER}@${SERVER_IP}"
SCP_CMD="scp -i ${SSH_KEY} -o StrictHostKeyChecking=no"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

echo -e "${BLUE}=== Ling Engine 部署 ===${NC}"

# ── 检查本地文件 ──────────────────────────────────
for f in ".env.docker" "docker-compose.prod.yml" "engine/Dockerfile.china" "engine/conf.yaml" "${SSH_KEY}"; do
    [ ! -f "$f" ] && echo -e "${RED}Missing: $f${NC}" && exit 1
done

# ── 测试 SSH ──────────────────────────────────────
echo -e "${YELLOW}1/5 测试 SSH...${NC}"
${SSH_CMD} "echo OK" || { echo -e "${RED}SSH failed${NC}"; exit 1; }

# ── 创建远程目录 + 上传源码 ──────────────────────
echo -e "${YELLOW}2/5 上传源码到服务器...${NC}"
${SSH_CMD} "mkdir -p ${REMOTE_PATH}/engine"

# 上传核心文件
${SCP_CMD} .env.docker ${SERVER_USER}@${SERVER_IP}:${REMOTE_PATH}/.env
${SCP_CMD} docker-compose.prod.yml ${SERVER_USER}@${SERVER_IP}:${REMOTE_PATH}/docker-compose.yml
${SCP_CMD} requirements-docker.txt ${SERVER_USER}@${SERVER_IP}:${REMOTE_PATH}/ 2>/dev/null || true

# 上传 engine 目录（排除 .venv, __pycache__, models, .git）
rsync -avz --delete \
    -e "ssh -i ${SSH_KEY} -o StrictHostKeyChecking=no" \
    --exclude='.venv' --exclude='__pycache__' --exclude='/models' \
    --exclude='.git' --exclude='*.pyc' --exclude='cache' \
    --exclude='chat_history' --exclude='affinity_data' --exclude='logs' \
    engine/ ${SERVER_USER}@${SERVER_IP}:${REMOTE_PATH}/engine/

# 上传 web 目录（排除 node_modules, dist）
${SSH_CMD} "mkdir -p ${REMOTE_PATH}/web ${REMOTE_PATH}/tts-proxy"
rsync -avz --delete \
    -e "ssh -i ${SSH_KEY} -o StrictHostKeyChecking=no" \
    --exclude='node_modules' --exclude='dist' --exclude='.git' \
    web/ ${SERVER_USER}@${SERVER_IP}:${REMOTE_PATH}/web/

# 上传 tts-proxy 目录
rsync -avz --delete \
    -e "ssh -i ${SSH_KEY} -o StrictHostKeyChecking=no" \
    --exclude='__pycache__' --exclude='.git' \
    tts-proxy/ ${SERVER_USER}@${SERVER_IP}:${REMOTE_PATH}/tts-proxy/

echo -e "${GREEN}源码上传完成${NC}"

# ── 注入 GitHub Token ────────────────────────────
GITHUB_TOKEN=$(gh auth token 2>/dev/null || echo "")
if [ -n "$GITHUB_TOKEN" ]; then
    echo -e "${YELLOW}注入 GITHUB_TOKEN 到服务器 .env...${NC}"
    ${SSH_CMD} "sed -i 's|^GITHUB_TOKEN=.*|GITHUB_TOKEN=${GITHUB_TOKEN}|' ${REMOTE_PATH}/.env"
fi

# ── 停旧容器 ──────────────────────────────────────
echo -e "${YELLOW}3/5 停止旧服务...${NC}"
${SSH_CMD} "
    cd ${REMOTE_PATH} && docker compose down 2>/dev/null || true
    # 停掉旧的 qdyqszr 容器（如果存在）
    docker stop qdyqszr-open-llm-vtuber-1 qdyqszr-neo4j-1 qdyqszr-qdrant-1 open-llm-vtuber-web 2>/dev/null || true
    docker rm qdyqszr-open-llm-vtuber-1 qdyqszr-neo4j-1 qdyqszr-qdrant-1 open-llm-vtuber-web 2>/dev/null || true
"

# ── 在服务器上构建 + 启动 ─────────────────────────
echo -e "${YELLOW}4/5 在服务器上构建并启动...${NC}"
${SSH_CMD} "
    set -e
    cd ${REMOTE_PATH}

    echo '构建 Docker 镜像...'
    docker compose build --no-cache 2>&1 | tail -30

    echo '启动所有服务...'
    docker compose up -d

    echo '等待启动...'
    sleep 15

    echo '=== 服务状态 ==='
    docker compose ps

    echo '=== Engine 日志 ==='
    docker compose logs --tail=20 ling-engine 2>&1 || true
"

# ── 健康检查 ──────────────────────────────────────
echo -e "${YELLOW}5/7 健康检查...${NC}"
sleep 5

${SSH_CMD} "
    echo '--- Engine ---'
    curl -sf http://localhost:12393/health && echo ' OK' || echo ' FAIL'
    echo '--- Postgres ---'
    docker compose -f ${REMOTE_PATH}/docker-compose.yml exec -T postgres pg_isready -U postgres 2>&1 || echo 'FAIL'
    echo '--- Redis ---'
    docker compose -f ${REMOTE_PATH}/docker-compose.yml exec -T redis redis-cli ping 2>&1 || echo 'FAIL'
    echo '--- Qdrant ---'
    curl -sf http://localhost:6333/healthz && echo ' OK' || echo ' FAIL'
    echo '--- Neo4j ---'
    curl -sf http://localhost:7474 && echo ' OK' || echo ' FAIL'
    echo '--- Ollama ---'
    curl -sf http://localhost:11434/api/tags && echo ' OK' || echo ' FAIL'
"

# ── Ollama 模型预拉取 ─────────────────────────────
echo -e "${YELLOW}6/7 Ollama 模型预拉取...${NC}"
${SSH_CMD} "
    echo '拉取 qwen3-embedding:0.6b (首次约 600MB)...'
    docker exec ling-ollama ollama pull qwen3-embedding:0.6b 2>&1 | tail -5
    echo '模型拉取完成'
" || echo -e "${YELLOW}Ollama 模型拉取跳过（容器可能未就绪）${NC}"

# ── Soul Fabric 初始化 ────────────────────────────
echo -e "${YELLOW}7/7 Soul Fabric 初始化...${NC}"
${SSH_CMD} "
    # MongoDB 索引创建
    if [ -f ${REMOTE_PATH}/engine/scripts/create_soul_indexes.js ]; then
        echo '创建 MongoDB 索引...'
        docker exec memsys-mongodb mongosh ling_soul < ${REMOTE_PATH}/engine/scripts/create_soul_indexes.js 2>&1 | tail -5
    fi

    # 安装备份 cron
    echo '0 3 * * * root bash ${REMOTE_PATH}/engine/scripts/soul_backup.sh >> /var/log/soul_backup.log 2>&1' | sudo tee /etc/cron.d/soul-backup > /dev/null 2>&1 || true

    # Soul Fabric 健康检查
    echo '--- Soul Fabric Coverage ---'
    sleep 5
    curl -sf http://localhost:12393/v1/memory/coverage -H 'X-Agent-Key: \$(grep SOUL_AGENT_KEY ${REMOTE_PATH}/.env | cut -d= -f2)' 2>&1 | head -3 || echo 'Soul Fabric 尚未就绪（可能需要更多启动时间）'
"

echo -e "${GREEN}=== 部署完成 ===${NC}"
echo -e "${BLUE}Engine: http://${SERVER_IP}:12393${NC}"
echo -e "${BLUE}查看日志: ${SSH_CMD} 'cd ${REMOTE_PATH} && docker compose logs -f ling-engine'${NC}"
