import json
from uuid import uuid4
import numpy as np
from datetime import datetime
from fastapi import APIRouter, WebSocket, UploadFile, File, Response, HTTPException
from pydantic import BaseModel
from starlette.websockets import WebSocketDisconnect
from loguru import logger
from .service_context import ServiceContext
from .websocket_handler import WebSocketHandler
from .utils.sentence_divider import segment_text_by_pysbd

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

            from .bff_integration.api.health_routes import create_health_router

            # 健康检查路由（保留）
            health_router = create_health_router()
            router.include_router(health_router)
            logger.info("✅ BFF健康检查路由已注册")

            # Phase 1: 旧的 Clerk auth_routes 和 user_routes 已被 ling_auth_routes 替代，不再注册
            logger.info("ℹ️ 旧 BFF auth/user 路由已跳过（Phase 1 灵认证替代）")
        else:
            logger.info("ℹ️ BFF集成未启用，跳过BFF路由注册")
    except Exception as e:
        logger.error(f"❌ 注册BFF路由失败: {str(e)}")
        import traceback
        logger.error(f"错误堆栈: {traceback.format_exc()}")

    # ── 灵认证系统 (Phase 1) ──────────────────────────────────
    try:
        from .bff_integration.api.ling_auth_routes import create_ling_auth_router
        db_manager = getattr(default_context_cache, 'database_manager', None)
        ling_auth_router = create_ling_auth_router(db_manager)
        router.include_router(ling_auth_router)
        logger.info("✅ 灵认证路由已注册 (/api/auth/*)")

        # Stripe 支付路由
        from .bff_integration.api.ling_stripe_routes import create_ling_stripe_router
        from .bff_integration.auth.ling_deps import _get_repo
        ling_stripe_router = create_ling_stripe_router(_get_repo())
        router.include_router(ling_stripe_router)
        logger.info("✅ 灵 Stripe 路由已注册 (/api/stripe/*)")

        # TTS 代理路由
        from .bff_integration.api.ling_tts_routes import create_ling_tts_router
        ling_tts_router = create_ling_tts_router()
        router.include_router(ling_tts_router)
        logger.info("✅ 灵 TTS 代理路由已注册 (/api/tts/*)")

        # 管理员路由
        from .bff_integration.api.ling_admin_routes import create_ling_admin_router
        ling_admin_router = create_ling_admin_router(_get_repo())
        router.include_router(ling_admin_router)
        logger.info("✅ 灵管理员路由已注册 (/api/admin/*)")

        # 计费路由
        from .bff_integration.api.ling_billing_routes import create_ling_billing_router
        ling_billing_router = create_ling_billing_router(_get_repo())
        router.include_router(ling_billing_router)
        logger.info("✅ 灵计费路由已注册 (/api/billing/*)")
    except Exception as e:
        logger.error(f"❌ 注册灵路由失败: {e}")
        import traceback
        logger.error(traceback.format_exc())

    @router.websocket("/client-ws")
    async def websocket_endpoint(websocket: WebSocket):
        """WebSocket endpoint for client connections"""
        await websocket.accept()
        client_uid = str(uuid4())

        # 支持通过 URL 参数传递 token
        url_token = websocket.query_params.get("token")
        if url_token:
            logger.info(f"🔑 WebSocket: 检测到URL参数中的token，长度: {len(url_token)}")

        try:
            # Phase 1: 优先用灵 JWT 认证
            await _setup_ling_websocket_auth(websocket, client_uid, url_token=url_token)

            await ws_handler.handle_new_connection(websocket, client_uid)
            await ws_handler.handle_websocket_communication(websocket, client_uid)
        except WebSocketDisconnect:
            await ws_handler.handle_disconnect(client_uid)
        except Exception as e:
            logger.error(f"Error in WebSocket connection: {e}")
            await ws_handler.handle_disconnect(client_uid)
            raise
        finally:
            try:
                from .bff_integration.auth.websocket_user_cache import clear_websocket_client_cache
                clear_websocket_client_cache(client_uid)
            except Exception as cleanup_error:
                logger.debug(f"清理 WebSocket 缓存时出错: {cleanup_error}")
    
    async def _setup_ling_websocket_auth(
        websocket: WebSocket, client_uid: str, url_token: str | None = None
    ):
        """Phase 1 WebSocket 认证：用灵 JWT 验证用户。

        认证成功 → 缓存用户信息到 websocket_user_cache；
        无 token 或验证失败 → 以 guest 身份连接。
        """
        try:
            from .bff_integration.auth.ling_auth import verify_jwt_token
            from .bff_integration.auth.websocket_user_cache import cache_user_for_websocket_client

            token = url_token
            if not token:
                # 尝试从 Cookie 中读取
                cookies = websocket.cookies
                token = cookies.get("ling_token")

            if not token:
                logger.info(f"WebSocket {client_uid}: 无 token，以 guest 身份连接")
                cache_user_for_websocket_client(
                    client_uid=client_uid,
                    user_id=f"guest_{client_uid}",
                    username="guest",
                    email=None,
                    roles=[],
                    token="",
                )
                return

            payload = verify_jwt_token(token)
            if not payload:
                logger.warning(f"WebSocket {client_uid}: JWT 验证失败，以 guest 身份连接")
                cache_user_for_websocket_client(
                    client_uid=client_uid,
                    user_id=f"guest_{client_uid}",
                    username="guest",
                    email=None,
                    roles=[],
                    token="",
                )
                return

            # JWT 有效 → 查询数据库获取完整用户信息
            from .bff_integration.auth.ling_deps import _get_repo
            try:
                repo = _get_repo()
                user = repo.get_user_by_id(payload["sub"])
            except RuntimeError:
                user = None

            if user:
                cache_user_for_websocket_client(
                    client_uid=client_uid,
                    user_id=str(user["id"]),
                    username=user["username"],
                    email=user.get("email"),
                    roles=[user.get("role", "user")],
                    token=token,
                )
                logger.info(f"WebSocket {client_uid}: 认证用户 {user['username']} ({user['id']})")
            else:
                cache_user_for_websocket_client(
                    client_uid=client_uid,
                    user_id=payload["sub"],
                    username=payload.get("username", "unknown"),
                    email=payload.get("email"),
                    roles=[payload.get("role", "user")],
                    token=token,
                )
                logger.info(f"WebSocket {client_uid}: JWT 有效但数据库无此用户，使用 payload 信息")

        except Exception as e:
            logger.warning(f"WebSocket {client_uid}: 认证异常: {e}，以 guest 身份连接")
            from .bff_integration.auth.websocket_user_cache import cache_user_for_websocket_client
            cache_user_for_websocket_client(
                client_uid=client_uid,
                user_id=f"guest_{client_uid}",
                username="guest",
                email=None,
                roles=[],
                token="",
            )

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
