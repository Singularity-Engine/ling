#!/usr/bin/env python3
"""
OpenClaw Bridge Server
让数字人后端调用 OpenClaw Agent（初音未来）

提供 OpenAI 兼容的 /v1/chat/completions API
"""

import os
import json
import subprocess
import asyncio
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import time
import uuid

app = FastAPI(title="OpenClaw Bridge", version="1.0.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# OpenClaw CLI 路径
OPENCLAW_CLI = os.environ.get(
    "OPENCLAW_CLI", 
    "/Users/caoruipeng/.nvm/versions/node/v25.5.0/bin/openclaw"
)

# 默认 session id（用于保持对话上下文）
DEFAULT_SESSION_ID = "vtuber-avatar"


class Message(BaseModel):
    role: str
    content: str


class ChatCompletionRequest(BaseModel):
    model: str = "openclaw"
    messages: List[Message]
    temperature: Optional[float] = 0.7
    max_tokens: Optional[int] = 2048
    stream: Optional[bool] = False


class ChatCompletionResponse(BaseModel):
    id: str
    object: str = "chat.completion"
    created: int
    model: str
    choices: List[Dict[str, Any]]
    usage: Dict[str, int]


async def call_openclaw(message: str, session_id: str = DEFAULT_SESSION_ID) -> str:
    """调用 OpenClaw CLI 获取回复"""
    try:
        cmd = [
            OPENCLAW_CLI,
            "agent",
            "--message", message,
            "--session-id", session_id,
            "--json",
            "--timeout", "120"
        ]
        
        print(f"[OpenClaw Bridge] 调用: {' '.join(cmd[:4])}...")
        
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        stdout, stderr = await asyncio.wait_for(
            process.communicate(), 
            timeout=130
        )
        
        if process.returncode != 0:
            error_msg = stderr.decode('utf-8', errors='ignore')
            print(f"[OpenClaw Bridge] 错误: {error_msg}")
            return f"抱歉，我遇到了一些问题: {error_msg[:200]}"
        
        # 解析 JSON 输出
        output = stdout.decode('utf-8', errors='ignore')
        try:
            result = json.loads(output)
            # OpenClaw 返回格式: result.payloads[0].text
            if isinstance(result, dict):
                if result.get('status') == 'ok' and 'result' in result:
                    payloads = result.get('result', {}).get('payloads', [])
                    if payloads and len(payloads) > 0:
                        reply = payloads[0].get('text', '')
                        if reply:
                            return reply
                # 备用解析
                reply = (
                    result.get('reply') or 
                    result.get('response') or 
                    result.get('content') or
                    result.get('message') or
                    str(result)
                )
            else:
                reply = str(result)
            return reply
        except json.JSONDecodeError:
            # 如果不是 JSON，直接返回输出
            return output.strip()
            
    except asyncio.TimeoutError:
        return "抱歉，思考太久了，请再试一次~"
    except Exception as e:
        print(f"[OpenClaw Bridge] 异常: {e}")
        return f"抱歉，出了点问题: {str(e)[:100]}"


@app.get("/health")
async def health():
    return {"status": "UP", "service": "OpenClaw Bridge"}


@app.get("/v1/models")
async def list_models():
    """列出可用模型"""
    return {
        "object": "list",
        "data": [
            {
                "id": "openclaw",
                "object": "model",
                "created": int(time.time()),
                "owned_by": "openclaw",
                "permission": [],
                "root": "openclaw",
                "parent": None
            }
        ]
    }


@app.post("/v1/chat/completions")
async def chat_completions(request: ChatCompletionRequest):
    """OpenAI 兼容的 chat completions API"""
    
    # 获取最后一条用户消息
    user_messages = [m for m in request.messages if m.role == "user"]
    if not user_messages:
        raise HTTPException(status_code=400, detail="No user message found")
    
    last_message = user_messages[-1].content
    
    # 调用 OpenClaw
    reply = await call_openclaw(last_message)
    
    # 构造 OpenAI 兼容的响应
    return ChatCompletionResponse(
        id=f"chatcmpl-{uuid.uuid4().hex[:8]}",
        created=int(time.time()),
        model="openclaw",
        choices=[
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": reply
                },
                "finish_reason": "stop"
            }
        ],
        usage={
            "prompt_tokens": len(last_message),
            "completion_tokens": len(reply),
            "total_tokens": len(last_message) + len(reply)
        }
    )


if __name__ == "__main__":
    print("🌸 OpenClaw Bridge 启动中...")
    print(f"   OpenClaw CLI: {OPENCLAW_CLI}")
    print(f"   Session ID: {DEFAULT_SESSION_ID}")
    print("   API: http://localhost:12394/v1/chat/completions")
    uvicorn.run(app, host="0.0.0.0", port=12394)
