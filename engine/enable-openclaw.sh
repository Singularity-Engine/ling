#!/bin/bash
# 启用 OpenClaw + Fish Audio TTS 模式

echo "🌸 启用 OpenClaw 模式..."

cd ~/Projects/qdyqszr/engine

# 停止服务
pkill -f "run_server.py" 2>/dev/null
sleep 2

# 启动 OpenClaw Bridge（如果没运行）
if ! curl -s http://localhost:12394/health | grep -q "UP"; then
    echo "🚀 启动 OpenClaw Bridge..."
    cd ~/Projects/qdyqszr/openclaw-bridge
    nohup .venv/bin/python server.py > /tmp/openclaw-bridge.log 2>&1 &
    sleep 3
    cd ~/Projects/qdyqszr/engine
fi

# 修改 LLM 配置
sed -i '' 's/llm_provider: "gemini_llm"/llm_provider: "openai_compatible_llm"/' conf.yaml

# 修改 TTS 配置
sed -i '' 's/tts_model: "edge_tts"/tts_model: "fish_api_tts"/' conf.yaml

# 重启数字人服务
nohup .venv/bin/python run_server.py > /tmp/vtuber.log 2>&1 &

sleep 5
if curl -s http://localhost:12393/health | grep -q "UP"; then
    echo "✅ OpenClaw 模式已启用（初音未来控制数字人）"
else
    echo "❌ 服务启动失败，请检查日志: /tmp/vtuber.log"
fi
