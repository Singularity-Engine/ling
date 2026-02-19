#!/bin/bash
# 回退到 Gemini + Edge TTS 模式

echo "🔄 回退 OpenClaw 配置..."

cd ~/Projects/qdyqszr/Open-LLM-VTuber

# 停止服务
pkill -f "run_server.py" 2>/dev/null
pkill -f "openclaw-bridge" 2>/dev/null
sleep 2

# 修改 LLM 配置
sed -i '' 's/llm_provider: "openai_compatible_llm"/llm_provider: "gemini_llm"/' conf.yaml

# 修改 TTS 配置
sed -i '' 's/tts_model: "fish_api_tts"/tts_model: "edge_tts"/' conf.yaml

# 重启服务
nohup .venv/bin/python run_server.py > /tmp/vtuber.log 2>&1 &

sleep 5
if curl -s http://localhost:12393/health | grep -q "UP"; then
    echo "✅ 已回退到 Gemini + Edge TTS 模式"
else
    echo "❌ 服务启动失败，请检查日志: /tmp/vtuber.log"
fi
