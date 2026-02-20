#!/bin/bash
# Ling Service Health Check
# Usage: ./scripts/health-check.sh [base_url]
#
# Checks all Ling services and reports status.
# Can be used as a cron job for monitoring.

set -euo pipefail

BASE_URL="${1:-http://localhost}"
ENGINE_URL="${BASE_URL}:12393"
WEB_URL="${BASE_URL}:3001"
TTS_URL="${BASE_URL}:12394"
GATEWAY_URL="${BASE_URL}:18789"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ERRORS=0

check_service() {
    local name="$1"
    local url="$2"
    local timeout="${3:-5}"

    if curl -sf --max-time "$timeout" "$url" > /dev/null 2>&1; then
        echo -e "${GREEN}[OK]${NC}  $name ($url)"
    else
        echo -e "${RED}[FAIL]${NC} $name ($url)"
        ERRORS=$((ERRORS + 1))
    fi
}

echo "=== Ling Service Health Check ==="
echo "Time: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo ""

check_service "Ling Engine"     "$ENGINE_URL/health"
check_service "Ling Web"        "$WEB_URL"
check_service "TTS Proxy"       "$TTS_URL/health"
check_service "OpenClaw Gateway" "$GATEWAY_URL/health" 3

echo ""

# Check database and redis via docker if available
if command -v docker &> /dev/null; then
    if docker ps --format '{{.Names}}' | grep -q ling-postgres; then
        if docker exec ling-postgres pg_isready -U ling > /dev/null 2>&1; then
            echo -e "${GREEN}[OK]${NC}  PostgreSQL"
        else
            echo -e "${RED}[FAIL]${NC} PostgreSQL"
            ERRORS=$((ERRORS + 1))
        fi
    fi

    if docker ps --format '{{.Names}}' | grep -q ling-redis; then
        if docker exec ling-redis redis-cli ping > /dev/null 2>&1; then
            echo -e "${GREEN}[OK]${NC}  Redis"
        else
            echo -e "${RED}[FAIL]${NC} Redis"
            ERRORS=$((ERRORS + 1))
        fi
    fi
fi

echo ""
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}All services healthy.${NC}"
    exit 0
else
    echo -e "${RED}$ERRORS service(s) failed.${NC}"
    exit 1
fi
