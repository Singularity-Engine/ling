#!/bin/bash
# Soul Memory Fabric — MongoDB 每日备份
# 安装: 通过 deploy.sh 写入 /etc/cron.d/soul-backup
# Usage: bash soul_backup.sh

set -euo pipefail

BACKUP_DIR="/home/open-llm-vtuber-deploy/backups/soul"
RETENTION_DAYS=7
MONGO_HOST="${MONGO_HOST:-memsys-mongodb}"
MONGO_PORT="${MONGO_PORT:-27017}"
MONGO_DB="${MONGO_DB:-ling_soul}"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="${BACKUP_DIR}/${MONGO_DB}_${DATE}"

echo "[$(date)] Starting Soul Fabric backup..."

# 创建备份目录
mkdir -p "${BACKUP_DIR}"

# 执行备份
docker exec memsys-mongodb mongodump \
    --host="${MONGO_HOST}" \
    --port="${MONGO_PORT}" \
    --db="${MONGO_DB}" \
    --gzip \
    --out="/tmp/soul_backup_${DATE}" 2>&1

# 从容器复制到宿主机
docker cp "memsys-mongodb:/tmp/soul_backup_${DATE}" "${BACKUP_PATH}"

# 清理容器内临时文件
docker exec memsys-mongodb rm -rf "/tmp/soul_backup_${DATE}" 2>/dev/null || true

# 删除过期备份
find "${BACKUP_DIR}" -maxdepth 1 -type d -name "${MONGO_DB}_*" -mtime +${RETENTION_DAYS} -exec rm -rf {} \;

BACKUP_SIZE=$(du -sh "${BACKUP_PATH}" 2>/dev/null | cut -f1)
echo "[$(date)] Backup complete: ${BACKUP_PATH} (${BACKUP_SIZE})"
echo "[$(date)] Retained backups (last ${RETENTION_DAYS} days):"
ls -1d "${BACKUP_DIR}/${MONGO_DB}_"* 2>/dev/null | tail -5
