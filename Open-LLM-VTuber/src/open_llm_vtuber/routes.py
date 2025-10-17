import json
from uuid import uuid4
import numpy as np
from datetime import datetime, timedelta
from fastapi import APIRouter, WebSocket, UploadFile, File, Response, HTTPException, Depends, Body
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from starlette.websockets import WebSocketDisconnect
from loguru import logger
from .service_context import ServiceContext
from .websocket_handler import WebSocketHandler
from .utils.sentence_divider import segment_text_by_pysbd

# 简单的用户存储（生产环境应使用数据库）
USERS = {
    "admin": {
        "password": "admin123",  # 生产环境应使用加密密码
        "role": "admin"
    },
    "user": {
        "password": "user123",
        "role": "user"
    }
}

# 简单的会话存储（生产环境应使用Redis等）
SESSIONS = {}

# 安全令牌
security = HTTPBearer()

# 登录请求模型
class LoginRequest(BaseModel):
    username: str
    password: str

# 登出请求模型
class LogoutRequest(BaseModel):
    token: str

def create_token(user_id: str) -> str:
    """创建简单的token（生产环境应使用JWT）"""
    token = str(uuid4())
    SESSIONS[token] = {
        "user_id": user_id,
        "created_at": datetime.now(),
        "expires_at": datetime.now() + timedelta(hours=24)
    }
    return token

def verify_token(token: str) -> dict:
    """验证token"""
    if token not in SESSIONS:
        return None

    session = SESSIONS[token]
    if datetime.now() > session["expires_at"]:
        del SESSIONS[token]
        return None

    return session

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """获取当前用户"""
    token = credentials.credentials
    session = verify_token(token)
    if not session:
        raise HTTPException(status_code=401, detail="无效的认证token")
    return session

async def create_routes(default_context_cache: ServiceContext) -> APIRouter:
    """
    Create and return API routes for handling WebSocket connections.

    Args:
        default_context_cache: Default service context cache for new sessions.

    Returns:
        APIRouter: Configured router with WebSocket endpoint.
    """

    router = APIRouter()
    ws_handler = WebSocketHandler(default_context_cache)

    # 在异步上下文中初始化WebSocketHandler
    await ws_handler.initialize()

    # 添加BFF集成路由
    try:
        # 检查是否启用BFF集成
        config = default_context_cache.config
        bff_integration = getattr(config, 'bff_integration', None)

        # 处理BFF配置（可能是dataclass或字典）
        if bff_integration is None:
            bff_enabled = False
        elif hasattr(bff_integration, 'enabled'):
            # dataclass格式
            bff_enabled = bff_integration.enabled
        elif isinstance(bff_integration, dict):
            # 字典格式
            bff_enabled = bff_integration.get('enabled', False)
        else:
            bff_enabled = False

        # 调试信息
        logger.info(f"🔍 BFF集成调试信息:")
        logger.info(f"🔍 config类型: {type(config)}")
        logger.info(f"🔍 bff_integration类型: {type(bff_integration)}")
        logger.info(f"🔍 bff_integration值: {bff_integration}")
        logger.info(f"🔍 bff_enabled: {bff_enabled}")

        # 临时强制启用BFF集成进行测试
        import os
        if os.getenv('BFF_INTEGRATION_ENABLED', '').lower() == 'true':
            logger.info("🔧 通过环境变量强制启用BFF集成")
            bff_enabled = True

        if bff_enabled:
            logger.info("🔧 开始注册BFF集成路由...")

            # 导入BFF路由模块
            from .bff_integration.api.auth_routes import create_auth_router
            from .bff_integration.api.user_routes import create_user_router
            from .bff_integration.api.health_routes import create_health_router

            # 获取数据库管理器
            db_manager = getattr(default_context_cache, 'database_manager', None)

            # 创建并注册健康检查路由（无需认证）
            health_router = create_health_router()
            router.include_router(health_router)
            logger.info("✅ BFF健康检查路由已注册")

            # 创建并注册认证路由
            auth_router = create_auth_router(config, db_manager)
            router.include_router(auth_router)
            logger.info("✅ BFF认证路由已注册")

            # 创建并注册用户路由
            user_router = create_user_router(config, db_manager)
            router.include_router(user_router)
            logger.info("✅ BFF用户路由已注册")

            logger.info("🎉 BFF集成路由注册完成")
        else:
            logger.info("ℹ️ BFF集成未启用，跳过BFF路由注册")
    except Exception as e:
        logger.error(f"❌ 注册BFF路由失败: {str(e)}")
        import traceback
        logger.error(f"错误堆栈: {traceback.format_exc()}")
        # 不阻塞应用启动，继续执行

    @router.post("/api/login")
    async def login(request: LoginRequest):
        """用户登录"""
        if request.username not in USERS or USERS[request.username]["password"] != request.password:
            raise HTTPException(status_code=401, detail="用户名或密码错误")

        token = create_token(request.username)
        return {
            "success": True,
            "token": token,
            "user": {
                "username": request.username,
                "role": USERS[request.username]["role"]
            }
        }

    @router.post("/api/logout")
    async def logout(request: LogoutRequest):
        """用户登出"""
        if request.token in SESSIONS:
            del SESSIONS[request.token]
        return {"success": True}

    @router.get("/api/verify")
    async def verify_auth(current_user: dict = Depends(get_current_user)):
        """验证用户认证状态"""
        return {
            "success": True,
            "user": {
                "username": current_user["user_id"],
                "role": USERS[current_user["user_id"]]["role"]
            }
        }

    @router.websocket("/client-ws")
    async def websocket_endpoint(websocket: WebSocket):
        """WebSocket endpoint for client connections"""
        await websocket.accept()
        client_uid = str(uuid4())

        try:
            # 🔧 在建立WebSocket连接时尝试设置用户上下文
            await _setup_websocket_user_context(websocket, client_uid)
            
            await ws_handler.handle_new_connection(websocket, client_uid)
            await ws_handler.handle_websocket_communication(websocket, client_uid)
        except WebSocketDisconnect:
            await ws_handler.handle_disconnect(client_uid)
        except Exception as e:
            logger.error(f"Error in WebSocket connection: {e}")
            await ws_handler.handle_disconnect(client_uid)
            raise
        finally:
            # 🔧 连接结束时清理用户上下文
            try:
                from .bff_integration.auth.user_context import UserContextManager
                UserContextManager.clear_user_context()
            except Exception as cleanup_error:
                logger.debug(f"清理用户上下文时出错: {cleanup_error}")
    
    async def _setup_websocket_user_context(websocket: WebSocket, client_uid: str = None):
        """设置WebSocket连接的用户上下文"""
        try:
            logger.info("🔄 WebSocket: 开始设置用户上下文...")
            
            # 使用新的jwt_helper模块从WebSocket Cookie中提取用户ID
            from .bff_integration.auth.jwt_helper import extract_session_cookie_from_websocket, decode_session_token
            from .bff_integration.auth.user_context import UserContextManager, UserContext
            from .bff_integration.auth.websocket_user_cache import cache_user_for_websocket_client
            
            # 提取internal_access_token Cookie（这个逻辑现在主要作为备用机制）
            websocket_headers = dict(websocket.headers)
            logger.info(f"🔧 调试WebSocket请求头: {websocket_headers}")
            session_cookie = extract_session_cookie_from_websocket(websocket_headers)
            
            if session_cookie:
                logger.info(f"🍪 WebSocket: 检测到会话Cookie，长度: {len(session_cookie)}")
                
                # 解码JWT获取用户信息
                user_info = decode_session_token(session_cookie)
                
                if user_info and user_info.get("user_id"):
                    # 创建用户上下文对象
                    user_context = UserContext(
                        user_id=user_info["user_id"],
                        username=user_info["username"],
                        email=user_info.get("email"),
                        roles=user_info.get("roles", []),
                        token=session_cookie
                    )
                    
                    # 设置用户上下文
                    UserContextManager.set_user_context(user_context)
                    
                    # 如果有客户端ID，则缓存用户信息
                    if client_uid:
                        cache_user_for_websocket_client(
                            client_uid=client_uid,
                            user_id=user_info["user_id"],
                            username=user_info["username"],
                            email=user_info.get("email"),
                            roles=user_info.get("roles", []),
                            token=session_cookie
                        )
                    
                    logger.info(f"✅ WebSocket: 用户上下文设置成功!")
                    logger.info(f"   👤 用户ID: {user_context.user_id}")
                    logger.info(f"   📝 用户名: {user_context.username}")
                    logger.info(f"   📧 邮箱: {user_context.email}")
                    logger.info(f"   🏷️ 角色: {user_context.roles}")
                    logger.info(f"   🗂️ 客户端缓存: {'已缓存' if client_uid else '未缓存'}")
                else:
                    logger.warning("⚠️ WebSocket: 无法从session token中提取用户信息，将使用默认用户")
            else:
                logger.info("🔍 WebSocket: 未检测到internal_access_token Cookie，将使用默认用户")
                
        except Exception as e:
            logger.warning(f"⚠️ WebSocket: 设置用户上下文失败: {e}，将使用默认用户")
            import traceback
            logger.debug(f"详细错误信息: {traceback.format_exc()}")

    @router.get("/web-tool")
    async def web_tool_redirect():
        """Redirect /web-tool to /web_tool/index.html"""
        return Response(status_code=302, headers={"Location": "/web-tool/index.html"})

    @router.get("/web_tool")
    async def web_tool_redirect_alt():
        """Redirect /web-tool to /web_tool/index.html"""
        return Response(status_code=302, headers={"Location": "/web-tool/index.html"})

    @router.get("/test-login")
    async def test_login():
        """测试登录页面 - 前后端分离模式，返回API响应"""
        return {"message": "Please use separate frontend application for login interface"}

    @router.get("/debug-login")
    async def debug_login():
        """调试登录页面 - 前后端分离模式，返回API响应"""
        return {"message": "Please use separate frontend application for debug interface"}

    @router.get("/model_dict.json")
    async def get_model_dict():
        """提供模型配置文件"""
        import os
        try:
            # 尝试多个可能的路径
            possible_paths = [
                "model_dict.json",  # 相对路径
                os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "model_dict.json"),  # 项目根目录
                os.path.join(os.getcwd(), "model_dict.json"),  # 当前工作目录
            ]

            model_dict = None
            for path in possible_paths:
                try:
                    logger.info(f"尝试读取 model_dict.json: {path}")
                    with open(path, "r", encoding="utf-8") as f:
                        model_dict = json.load(f)
                    logger.info(f"成功从 {path} 读取 model_dict.json")
                    break
                except FileNotFoundError:
                    logger.warning(f"文件不存在: {path}")
                    continue
                except Exception as e:
                    logger.warning(f"读取 {path} 时出错: {e}")
                    continue

            if model_dict is None:
                logger.error("所有路径都无法找到 model_dict.json 文件")
                return {"error": "Model dictionary not found"}, 404

            return model_dict
        except json.JSONDecodeError:
            logger.error("Invalid JSON in model_dict.json")
            return {"error": "Invalid model dictionary format"}, 500
        except Exception as e:
            logger.error(f"Error reading model_dict.json: {e}")
            return {"error": "Internal server error"}, 500

    @router.post("/asr")
    async def transcribe_audio(file: UploadFile = File(...)):
        """
        Endpoint for transcribing audio using the ASR engine
        """
        logger.info(f"Received audio file for transcription: {file.filename}")

        try:
            contents = await file.read()

            # Validate minimum file size
            if len(contents) < 44:  # Minimum WAV header size
                raise ValueError("Invalid WAV file: File too small")

            # Decode the WAV header and get actual audio data
            wav_header_size = 44  # Standard WAV header size
            audio_data = contents[wav_header_size:]

            # Validate audio data size
            if len(audio_data) % 2 != 0:
                raise ValueError("Invalid audio data: Buffer size must be even")

            # Convert to 16-bit PCM samples to float32
            try:
                audio_array = (
                    np.frombuffer(audio_data, dtype=np.int16).astype(np.float32)
                    / 32768.0
                )
            except ValueError as e:
                raise ValueError(
                    f"Audio format error: {str(e)}. Please ensure the file is 16-bit PCM WAV format."
                )

            # Validate audio data
            if len(audio_array) == 0:
                raise ValueError("Empty audio data")

            text = await default_context_cache.asr_engine.async_transcribe_np(
                audio_array
            )
            logger.info(f"Transcription result: {text}")
            return {"text": text}

        except ValueError as e:
            logger.error(f"Audio format error: {e}")
            return Response(
                content=json.dumps({"error": str(e)}),
                status_code=400,
                media_type="application/json",
            )
        except Exception as e:
            logger.error(f"Error during transcription: {e}")
            return Response(
                content=json.dumps(
                    {"error": "Internal server error during transcription"}
                ),
                status_code=500,
                media_type="application/json",
            )

    @router.websocket("/tts-ws")
    async def tts_endpoint(websocket: WebSocket):
        """WebSocket endpoint for TTS generation"""
        await websocket.accept()
        logger.info("TTS WebSocket connection established")

        try:
            while True:
                data = await websocket.receive_json()
                text = data.get("text")
                if not text:
                    continue

                logger.info(f"Received text for TTS: {text}")

                # Split text into sentences
                sentences = [s.strip() for s in text.split(".") if s.strip()]

                try:
                    # Generate and send audio for each sentence
                    for sentence in sentences:
                        sentence = sentence + "."  # Add back the period
                        file_name = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{str(uuid4())[:8]}"
                        audio_path = (
                            await default_context_cache.tts_engine.async_generate_audio(
                                text=sentence, file_name_no_ext=file_name
                            )
                        )
                        logger.info(
                            f"Generated audio for sentence: {sentence} at: {audio_path}"
                        )

                        await websocket.send_json(
                            {
                                "status": "partial",
                                "audioPath": audio_path,
                                "text": sentence,
                            }
                        )

                    # Send completion signal
                    await websocket.send_json({"status": "complete"})

                except Exception as e:
                    logger.error(f"Error generating TTS: {e}")
                    await websocket.send_json({"status": "error", "message": str(e)})

        except WebSocketDisconnect:
            logger.info("TTS WebSocket client disconnected")
        except Exception as e:
            logger.error(f"Error in TTS WebSocket connection: {e}")
            await websocket.close()

    @router.websocket("/tts-ws-stream")
    async def tts_stream_endpoint(websocket: WebSocket):
        """WebSocket endpoint for TTS generation with sentence boundary streaming"""
        await websocket.accept()
        logger.info("TTS Streaming WebSocket connection established")

        try:
            while True:
                data = await websocket.receive_json()
                text = data.get("text")
                if not text:
                    continue

                logger.info(f"[stream] Received text for TTS: {text}")

                # Use pysbd-based segmentation (fallbacks handled inside the function)
                sentences, remaining = segment_text_by_pysbd(text)

                try:
                    # Generate and send audio for each complete sentence
                    for sentence in sentences:
                        file_name = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{str(uuid4())[:8]}"
                        audio_path = (
                            await default_context_cache.tts_engine.async_generate_audio(
                                text=sentence, file_name_no_ext=file_name
                            )
                        )
                        logger.info(
                            f"[stream] Generated audio for sentence: {sentence} at: {audio_path}"
                        )

                        await websocket.send_json(
                            {
                                "status": "partial",
                                "audioPath": audio_path,
                                "text": sentence,
                            }
                        )

                    # If there's remaining fragment (incomplete sentence), echo it as display only
                    if remaining and remaining.strip():
                        await websocket.send_json(
                            {
                                "status": "partial",
                                "audioPath": None,
                                "text": remaining.strip(),
                            }
                        )

                    # Send completion signal
                    await websocket.send_json({"status": "complete"})

                except Exception as e:
                    logger.error(f"[stream] Error generating TTS: {e}")
                    await websocket.send_json({"status": "error", "message": str(e)})

        except WebSocketDisconnect:
            logger.info("TTS Streaming WebSocket client disconnected")
        except Exception as e:
            logger.error(f"Error in TTS Streaming WebSocket connection: {e}")
            await websocket.close()

    return router
