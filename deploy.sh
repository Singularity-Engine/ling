#!/bin/bash

set -e

# 配置变量 - 请根据实际情况修改
SERVER_IP="35.193.74.48"
SERVER_USER="open-llm-vtuber-deploy"
SSH_KEY="C:/Users/20597/.ssh/ling_engine_deploy"
REMOTE_PATH="/home/${SERVER_USER}/App/qdyqszr"
IMAGE_NAME="qdyqszr"
IMAGE_TAG="v3"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 开始部署 Ling Engine 服务...${NC}"

# 检查必要文件
if [ ! -f ".env" ]; then
    echo -e "${RED}❌ 错误: .env 文件不存在，请从 .env.example 复制并配置${NC}"
    exit 1
fi

if [ ! -f "docker-compose.yml" ]; then
    echo -e "${RED}❌ 错误: docker-compose.yml 文件不存在${NC}"
    exit 1
fi

if [ ! -f "Dockerfile.china" ]; then
    echo -e "${RED}❌ 错误: Dockerfile.china 文件不存在${NC}"
    exit 1
fi

if [ ! -f "${SSH_KEY}" ]; then
    echo -e "${RED}❌ 错误: SSH密钥文件不存在: ${SSH_KEY}${NC}"
    exit 1
fi

# 检查engine目录和配置文件
if [ ! -f "engine/conf.yaml" ]; then
    echo -e "${RED}❌ 错误: engine/conf.yaml 配置文件不存在${NC}"
    exit 1
fi

# 1. 创建干净的构建目录（排除.git和大文件）
echo -e "${YELLOW}🧹 创建干净的构建目录...${NC}"
BUILD_DIR="build_temp"
rm -rf ${BUILD_DIR}
mkdir -p ${BUILD_DIR}

# 复制必要文件到构建目录 (按照缓存友好的顺序: 不常变化的文件优先)
mkdir -p ${BUILD_DIR}/engine

# 1. 复制Docker相关配置文件 (很少变化)
cp Dockerfile.china ${BUILD_DIR}/
cp requirements-docker.txt ${BUILD_DIR}/
cp docker-compose.yml ${BUILD_DIR}/

# 2. 复制项目配置文件 (不常变化)
cp Open-LLM-VTuber/pyproject.toml ${BUILD_DIR}/Open-LLM-VTuber/
cp -r Open-LLM-VTuber/config_templates ${BUILD_DIR}/Open-LLM-VTuber/ 2>/dev/null || true

# 3. 复制静态资源文件 (很少变化)
cp -r Open-LLM-VTuber/live2d-models ${BUILD_DIR}/Open-LLM-VTuber/ 2>/dev/null || true
cp -r Open-LLM-VTuber/backgrounds ${BUILD_DIR}/Open-LLM-VTuber/ 2>/dev/null || true

# 4. 复制角色和提示模板 (偶尔变化)
cp -r Open-LLM-VTuber/characters ${BUILD_DIR}/Open-LLM-VTuber/ 2>/dev/null || true
cp -r Open-LLM-VTuber/prompts ${BUILD_DIR}/Open-LLM-VTuber/ 2>/dev/null || true

# 5. 复制工具脚本 (不常变化)
cp Open-LLM-VTuber/upgrade.py ${BUILD_DIR}/Open-LLM-VTuber/ 2>/dev/null || true
cp Open-LLM-VTuber/merge_configs.py ${BUILD_DIR}/Open-LLM-VTuber/ 2>/dev/null || true
cp -r Open-LLM-VTuber/web_tool ${BUILD_DIR}/Open-LLM-VTuber/ 2>/dev/null || true

# 6. 复制环境和配置文件 (经常变化，放在后面)
cp .env ${BUILD_DIR}/
cp Open-LLM-VTuber/conf.yaml ${BUILD_DIR}/Open-LLM-VTuber/
cp Open-LLM-VTuber/enhanced_mcp_config.json ${BUILD_DIR}/Open-LLM-VTuber/ 2>/dev/null || true

# 复制 Google TTS 认证文件（如果存在）
if [ -f "Open-LLM-VTuber/google-tts-credentials.json" ]; then
    echo -e "${GREEN}✓ 找到 Google TTS 认证文件${NC}"
    cp Open-LLM-VTuber/google-tts-credentials.json ${BUILD_DIR}/Open-LLM-VTuber/
fi

# 7. 复制源代码和必需文件 (最经常变化，放在最后)
cp -r Open-LLM-VTuber/src ${BUILD_DIR}/Open-LLM-VTuber/
cp Open-LLM-VTuber/run_server.py ${BUILD_DIR}/Open-LLM-VTuber/
cp Open-LLM-VTuber/model_dict.json ${BUILD_DIR}/Open-LLM-VTuber/ 2>/dev/null || true
cp -r Open-LLM-VTuber/avatars ${BUILD_DIR}/Open-LLM-VTuber/ 2>/dev/null || true
cp -r Open-LLM-VTuber/audio ${BUILD_DIR}/Open-LLM-VTuber/ 2>/dev/null || true
# models目录可以排除，程序会自动下载需要的模型

echo -e "${BLUE}📏 构建目录大小:${NC}"
du -sh ${BUILD_DIR}

# 2. 构建镜像 (使用缓存加速)
echo -e "${YELLOW}📦 构建Docker镜像...${NC}"

# 启用BuildKit以获得更好的缓存性能
export DOCKER_BUILDKIT=1

# 尝试拉取已有镜像作为缓存源
echo "🔍 检查并拉取缓存镜像..."
docker pull ${IMAGE_NAME}:latest 2>/dev/null || echo "没有找到缓存镜像，将进行完整构建"

# 构建新镜像，使用多个缓存源
docker build \
  --cache-from ${IMAGE_NAME}:latest \
  --cache-from ${IMAGE_NAME}:${IMAGE_TAG} \
  --build-arg BUILDKIT_INLINE_CACHE=1 \
  -f ${BUILD_DIR}/Dockerfile.china \
  -t ${IMAGE_NAME}:${IMAGE_TAG} \
  -t ${IMAGE_NAME}:latest \
  ${BUILD_DIR}

# 3. 保存镜像
echo -e "${YELLOW}💾 保存镜像为tar包...${NC}"
docker save -o ${IMAGE_NAME}.tar ${IMAGE_NAME}:${IMAGE_TAG}

echo -e "${BLUE}📏 镜像包大小:${NC}"
ls -lh ${IMAGE_NAME}.tar

# 4. 测试SSH连接
echo -e "${YELLOW}🔑 测试SSH连接...${NC}"
ssh -i ${SSH_KEY} -o ConnectTimeout=10 ${SERVER_USER}@${SERVER_IP} "echo 'SSH连接成功'" || {
    echo -e "${RED}❌ SSH连接失败${NC}"
    rm ${IMAGE_NAME}.tar
    exit 1
}

# 5. 创建远程目录结构
echo -e "${YELLOW}📁 创建远程目录结构...${NC}"
ssh -i ${SSH_KEY} ${SERVER_USER}@${SERVER_IP} "
    mkdir -p ${REMOTE_PATH}
    mkdir -p ${REMOTE_PATH}/Open-LLM-VTuber/chat_history
    mkdir -p ${REMOTE_PATH}/Open-LLM-VTuber/cache
    mkdir -p ${REMOTE_PATH}/Open-LLM-VTuber/affinity_data
    mkdir -p ${REMOTE_PATH}/Open-LLM-VTuber/models
    mkdir -p ${REMOTE_PATH}/Open-LLM-VTuber/logs
"

# 6. 上传文件
echo -e "${YELLOW}📤 上传文件到服务器...${NC}"
echo "上传镜像包..."
scp -i ${SSH_KEY} ${IMAGE_NAME}.tar ${SERVER_USER}@${SERVER_IP}:${REMOTE_PATH}/

echo "上传配置文件..."
scp -i ${SSH_KEY} .env.docker ${SERVER_USER}@${SERVER_IP}:${REMOTE_PATH}/.env
scp -i ${SSH_KEY} docker-compose.yml ${SERVER_USER}@${SERVER_IP}:${REMOTE_PATH}/

echo "上传项目配置..."
scp -i ${SSH_KEY} Open-LLM-VTuber/conf.yaml ${SERVER_USER}@${SERVER_IP}:${REMOTE_PATH}/Open-LLM-VTuber/

# 上传字符配置文件（如果存在）
if [ -d "Open-LLM-VTuber/characters" ]; then
    echo "上传角色配置文件..."
    scp -r -i ${SSH_KEY} Open-LLM-VTuber/characters ${SERVER_USER}@${SERVER_IP}:${REMOTE_PATH}/Open-LLM-VTuber/
fi

# 上传MCP配置（如果存在）
if [ -f "Open-LLM-VTuber/enhanced_mcp_config.json" ]; then
    echo "上传MCP配置文件..."
    scp -i ${SSH_KEY} Open-LLM-VTuber/enhanced_mcp_config.json ${SERVER_USER}@${SERVER_IP}:${REMOTE_PATH}/Open-LLM-VTuber/
fi

# 上传 Google TTS 认证文件（如果存在）
if [ -f "Open-LLM-VTuber/google-tts-credentials.json" ]; then
    echo "上传 Google TTS 认证文件..."
    scp -i ${SSH_KEY} Open-LLM-VTuber/google-tts-credentials.json ${SERVER_USER}@${SERVER_IP}:${REMOTE_PATH}/Open-LLM-VTuber/
fi

# 7. 服务器部署
echo -e "${YELLOW}🔄 在服务器上部署服务...${NC}"
ssh -i ${SSH_KEY} ${SERVER_USER}@${SERVER_IP} << EOF
    set -e
    cd ${REMOTE_PATH}

    echo "停止旧服务..."
    docker compose down 2>/dev/null || true

    echo "清理旧容器和镜像..."
    # 强制删除所有stopped容器
    docker container prune -f 2>/dev/null || true

    # 删除旧的镜像标签
    docker rmi ${IMAGE_NAME}:${IMAGE_TAG} 2>/dev/null || true
    docker rmi ${IMAGE_NAME}:latest 2>/dev/null || true

    # 清理悬空镜像
    docker image prune -f 2>/dev/null || true

    echo "加载新镜像..."
    docker load -i ${IMAGE_NAME}.tar

    echo "创建Docker网络（如果不存在）..."
    docker network create mcp_appnet 2>/dev/null || echo "网络已存在"

    echo "启动服务..."
    docker compose up -d

    echo "等待服务启动..."
    sleep 15

    echo "检查服务状态..."
    docker compose ps

    echo "检查容器日志..."
    docker compose logs --tail=10 open-llm-vtuber

    echo "测试服务健康状态..."
    if curl -f -s http://localhost:12393/web-tool > /dev/null; then
        echo "✅ Open-LLM-VTuber 服务健康检查通过"
    else
        echo "⚠️  警告: Open-LLM-VTuber 服务健康检查失败，查看详细日志..."
        docker compose logs --tail=50 open-llm-vtuber
    fi

    echo "检查数据库连接..."
    if docker compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1; then
        echo "✅ PostgreSQL 数据库连接正常"
    else
        echo "⚠️  警告: PostgreSQL 数据库连接异常"
    fi

    echo "检查Redis连接..."
    if docker compose exec -T redis redis-cli ping > /dev/null 2>&1; then
        echo "✅ Redis 缓存连接正常"
    else
        echo "⚠️  警告: Redis 缓存连接异常"
    fi

    echo "✅ 服务器部署完成！"

    echo "清理镜像文件..."
    rm ${IMAGE_NAME}.tar
EOF

# 8. 清理本地文件
echo -e "${YELLOW}🧹 清理本地临时文件和旧镜像...${NC}"
rm ${IMAGE_NAME}.tar
rm -rf ${BUILD_DIR}

# 清理本地旧的镜像版本，保留最新的
echo "清理本地旧镜像..."
docker image prune -f 2>/dev/null || true

echo -e "${GREEN}🎉 部署成功完成！${NC}"
echo -e "${BLUE}🌐 VTuber服务地址: http://${SERVER_IP}:12393${NC}"
echo -e "${BLUE}🗄️  PostgreSQL: ${SERVER_IP}:5433${NC}"
echo -e "${BLUE}🔴 Redis: ${SERVER_IP}:6380${NC}"

# 9. 最终测试
echo -e "${YELLOW}🔍 执行最终连通性测试...${NC}"
sleep 5
if curl -f -s http://${SERVER_IP}:12393/web-tool > /dev/null; then
    echo -e "${GREEN}✅ Open-LLM-VTuber 服务访问正常${NC}"
else
    echo -e "${YELLOW}⚠️  服务暂时无法访问，可能需要等待服务完全启动${NC}"
    echo -e "${BLUE}💡 请稍后访问: http://${SERVER_IP}:12393${NC}"
fi

echo -e "${GREEN}🔧 部署完成后的操作建议:${NC}"
echo -e "${BLUE}1. 检查服务状态: ssh -i ${SSH_KEY} ${SERVER_USER}@${SERVER_IP} 'cd ${REMOTE_PATH} && docker compose ps'${NC}"
echo -e "${BLUE}2. 查看服务日志: ssh -i ${SSH_KEY} ${SERVER_USER}@${SERVER_IP} 'cd ${REMOTE_PATH} && docker compose logs -f open-llm-vtuber'${NC}"
echo -e "${BLUE}3. 重启服务: ssh -i ${SSH_KEY} ${SERVER_USER}@${SERVER_IP} 'cd ${REMOTE_PATH} && docker compose restart'${NC}"
echo -e "${BLUE}4. 停止服务: ssh -i ${SSH_KEY} ${SERVER_USER}@${SERVER_IP} 'cd ${REMOTE_PATH} && docker compose down'${NC}"