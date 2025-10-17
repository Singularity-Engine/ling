#!/bin/bash

set -e

# 配置变量 - 请根据实际情况修改
SERVER_IP="35.193.74.48"
SERVER_USER="open-llm-vtuber-deploy"
SSH_KEY="C:/Users/20597/.ssh/open_llm_vtuber_deploy"
REMOTE_PATH="/home/${SERVER_USER}/App/qdyqszr"
IMAGE_NAME="qdyqszr"
IMAGE_TAG="v3"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔄 从上传步骤开始恢复部署...${NC}"

# 检查必要文件是否存在
if [ ! -f "${IMAGE_NAME}.tar" ]; then
    echo -e "${RED}❌ 错误: ${IMAGE_NAME}.tar 镜像文件不存在${NC}"
    echo -e "${YELLOW}💡 请先运行完整的 deploy.sh 脚本生成镜像文件${NC}"
    exit 1
fi

if [ ! -f ".env" ]; then
    echo -e "${RED}❌ 错误: .env 文件不存在${NC}"
    exit 1
fi

if [ ! -f "docker-compose.yml" ]; then
    echo -e "${RED}❌ 错误: docker-compose.yml 文件不存在${NC}"
    exit 1
fi

if [ ! -f "${SSH_KEY}" ]; then
    echo -e "${RED}❌ 错误: SSH密钥文件不存在: ${SSH_KEY}${NC}"
    exit 1
fi

if [ ! -f "Open-LLM-VTuber/conf.yaml" ]; then
    echo -e "${RED}❌ 错误: Open-LLM-VTuber/conf.yaml 配置文件不存在${NC}"
    exit 1
fi

echo -e "${BLUE}📏 镜像包大小:${NC}"
ls -lh ${IMAGE_NAME}.tar

# 1. 测试SSH连接
echo -e "${YELLOW}🔑 测试SSH连接...${NC}"
ssh -i ${SSH_KEY} -o ConnectTimeout=10 ${SERVER_USER}@${SERVER_IP} "echo 'SSH连接成功'" || {
    echo -e "${RED}❌ SSH连接失败${NC}"
    exit 1
}

# 2. 创建远程目录结构
echo -e "${YELLOW}📁 创建远程目录结构...${NC}"
ssh -i ${SSH_KEY} ${SERVER_USER}@${SERVER_IP} "
    mkdir -p ${REMOTE_PATH}
    mkdir -p ${REMOTE_PATH}/Open-LLM-VTuber/chat_history
    mkdir -p ${REMOTE_PATH}/Open-LLM-VTuber/cache
    mkdir -p ${REMOTE_PATH}/Open-LLM-VTuber/affinity_data
    mkdir -p ${REMOTE_PATH}/Open-LLM-VTuber/models
    mkdir -p ${REMOTE_PATH}/Open-LLM-VTuber/logs
"

# 3. 上传文件（使用rsync支持断点续传）
echo -e "${YELLOW}📤 上传文件到服务器（支持断点续传）...${NC}"

# 检查是否安装了rsync
if command -v rsync >/dev/null 2>&1; then
    echo "使用rsync上传镜像包（支持断点续传）..."
    rsync --progress --partial -e "ssh -i ${SSH_KEY}" ${IMAGE_NAME}.tar ${SERVER_USER}@${SERVER_IP}:${REMOTE_PATH}/
else
    echo "rsync不可用，使用scp上传镜像包..."
    scp -i ${SSH_KEY} ${IMAGE_NAME}.tar ${SERVER_USER}@${SERVER_IP}:${REMOTE_PATH}/
fi

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

# 4. 服务器部署
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

# 5. 清理本地文件
echo -e "${YELLOW}🧹 清理本地临时文件...${NC}"
read -p "是否清理本地镜像文件 ${IMAGE_NAME}.tar？(y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm ${IMAGE_NAME}.tar
    echo "已清理本地镜像文件"
else
    echo "保留本地镜像文件，便于下次续传"
fi

# 清理本地旧的镜像版本，保留最新的
echo "清理本地旧镜像..."
docker image prune -f 2>/dev/null || true

echo -e "${GREEN}🎉 续传部署成功完成！${NC}"
echo -e "${BLUE}🌐 VTuber服务地址: http://${SERVER_IP}:12393${NC}"
echo -e "${BLUE}🗄️  PostgreSQL: ${SERVER_IP}:5433${NC}"
echo -e "${BLUE}🔴 Redis: ${SERVER_IP}:6380${NC}"

# 6. 最终测试
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