import asyncio
import json
import time
from typing import Dict, Optional, Callable

import numpy as np
from fastapi import WebSocket
from loguru import logger

from ..chat_group import ChatGroupManager
from ..chat_history_manager import store_message
from ..service_context import ServiceContext
from .group_conversation import process_group_conversation
from .single_conversation import process_agent_response
from .conversation_utils import EMOJI_LIST, create_batch_input, send_conversation_start_signals, process_user_input, finalize_conversation_turn, cleanup_conversation
from .global_tts_manager import global_tts_manager
from .types import GroupConversationState
from ..agent.agents.basic_memory_agent import BasicMemoryAgent
from ..agent.langchain_agent_wrapper import LangchainAgentWrapper
from ..utils.conversation_timer import conversation_timer
import base64
from pathlib import Path
from pydub import AudioSegment
from pydub.utils import make_chunks
from io import BytesIO


async def _play_preset_audio_direct(websocket, preset_key: str, message: str, character_name: str, expression: str = "neutral") -> None:
    """直接播放预设音频文件"""
    try:
        preset_audio_dir = Path("audio/presets")
        audio_file = preset_audio_dir / f"{preset_key}.mp3"

        if not audio_file.exists():
            logger.warning(f"⚠️ 预设音频文件不存在: {audio_file}")
            return

        # 读取音频文件
        with open(audio_file, 'rb') as f:
            audio_data = f.read()

        if len(audio_data) < 100:
            logger.warning(f"⚠️ 预设音频文件可能损坏: {audio_file}")
            return

        # 处理音频数据
        audio = AudioSegment.from_file(BytesIO(audio_data), format="mp3")
        audio_wav = audio.export(format="wav")
        audio_wav_bytes = audio_wav.read()

        # 计算音量数组
        chunks = make_chunks(audio, 20)  # 20ms chunks
        volumes = [chunk.rms for chunk in chunks]
        max_volume = max(volumes) if volumes else 1
        normalized_volumes = [vol / max_volume for vol in volumes]

        # 创建音频payload（保持与正常TTS音频相同的格式）
        payload = {
            "type": "audio",
            "audio": base64.b64encode(audio_wav_bytes).decode("utf-8"),
            "volumes": normalized_volumes,
            "slice_length": 20,
            "display_text": {
                "name": character_name,
                "text": message,
                "is_partial": False
            },
            "actions": {
                "expressions": [expression]
            },
            "forwarded": False
        }

        # 发送音频
        await websocket.send_text(json.dumps(payload))
        logger.info(f"✅ 成功播放预设音频: {preset_key} - {message}")

    except Exception as e:
        logger.error(f"❌ 播放预设音频失败 {preset_key}: {e}")


async def _play_login_required_tts(context: ServiceContext, websocket) -> None:
    """播放需要登录的预设音频（英文）"""
    try:
        login_message = "Please log in first to start a conversation with me."
        character_name = context.character_config.character_name if context.character_config else "Assistant"

        logger.info(f"🎵 开始播放登录提示预设音频: {login_message}")

        # 直接播放预设音频
        await _play_preset_audio_direct(
            websocket=websocket,
            preset_key="login_required_1",
            message=login_message,
            character_name=character_name,
            expression="shy"  # 使用害羞表情
        )

    except Exception as e:
        logger.error(f"❌ 播放登录提示预设音频失败: {e}")
        # 不发送任何回退消息，保持静默


async def _play_insufficient_credits_tts(context: ServiceContext, websocket) -> None:
    """播放积分不足的预设音频（英文）

    【积分不足用户体验优化】
    当用户积分不足时，不仅发送文本消息，还播放预设音频提示，提升用户体验
    使用英文提示确保国际化兼容性
    """
    try:
        credits_message = "Sorry, you don't have enough credits to start a conversation. Please recharge your credits first."
        character_name = context.character_config.character_name if context.character_config else "Assistant"

        logger.info(f"🎵 开始播放积分不足提示预设音频: {credits_message}")

        # 直接播放预设音频
        await _play_preset_audio_direct(
            websocket=websocket,
            preset_key="insufficient_credits_1",
            message=credits_message,
            character_name=character_name,
            expression="sad"  # 使用遗憾表情
        )

    except Exception as e:
        logger.error(f"❌ 播放积分不足提示预设音频失败: {e}")
        # 不发送任何回退消息，保持静默


async def handle_conversation_trigger(
    msg_type: str,
    data: dict,
    client_uid: str,
    context: ServiceContext,
    websocket: WebSocket,
    client_contexts: Dict[str, ServiceContext],
    client_connections: Dict[str, WebSocket],
    chat_group_manager: ChatGroupManager,
    received_data_buffers: Dict[str, np.ndarray],
    current_conversation_tasks: Dict[str, Optional[asyncio.Task]],
    broadcast_to_group: Callable,
    websocket_handler=None,  # Add websocket_handler parameter
) -> None:
    """Handle triggers that start a conversation"""
    logger.debug(f"开始处理对话触发，Agent类型: {type(context.agent_engine).__name__}")

    # 验证用户是否有权限进行对话
    try:
        from ..utils.user_context_helper import get_user_id_from_websocket_cookie_only
        websocket_headers = dict(websocket.headers) if hasattr(websocket, 'headers') else {}
        extracted_user_id = get_user_id_from_websocket_cookie_only(client_uid, websocket_headers, "default_user")

# [DEMO MODE]         # 如果用户是default_user，拒绝对话并播放TTS提示
# [DEMO MODE]         if extracted_user_id == "default_user":
# [DEMO MODE]             logger.warning(f"🚫 客户端 {client_uid} 使用default_user身份，拒绝对话")
# [DEMO MODE] 
# [DEMO MODE]             # 发送阻止消息
# [DEMO MODE]             await websocket.send_text(json.dumps({
# [DEMO MODE]                 "type": "conversation-blocked",
# [DEMO MODE]                 "message": "Please log in first to start a conversation"
# [DEMO MODE]             }))
# [DEMO MODE] 
# [DEMO MODE]             # 播放英文TTS提示
# [DEMO MODE]             await _play_login_required_tts(context, websocket)
# [DEMO MODE]             return

        logger.info(f"✅ 用户 {extracted_user_id} 验证通过，允许对话")

        # 【第一道防线：积分余额预检查】- 已注释（普通对话不扣积分）
        # 在对话开始前检查用户是否有足够积分，避免启动对话后再发现积分不足
        # try:
        #     from ..bff_integration.database.credit_repository import CreditRepository
        #     credit_repo = CreditRepository()

        #     # 检查积分是否充足（每次对话消耗1积分）
        #     # 注意：这里只是预检查，真正的扣除在对话开始时进行
        #     has_sufficient_credits = credit_repo.check_sufficient_credits(extracted_user_id, 1.0)

        #     if not has_sufficient_credits:
        #         logger.warning(f"🚫 用户 {extracted_user_id} 积分不足，拒绝对话")

        #         # 发送积分不足消息到前端
        #         await websocket.send_text(json.dumps({
        #             "type": "conversation-blocked",
        #             "message": "Insufficient credits to start conversation"
        #         }))

        #         # 播放积分不足TTS提示，提升用户体验
        #         await _play_insufficient_credits_tts(context, websocket)
        #         return

        #     logger.info(f"✅ 用户 {extracted_user_id} 积分充足，继续对话")

        # except Exception as e:
        #     logger.error(f"❌ 积分预检查失败: {e}")
        #     # 积分检查失败时，为了用户体验，暂时允许对话继续
        #     # 真正的扣除会在后续步骤中再次尝试
        #     logger.warning("⚠️ 积分预检查失败，允许对话继续")

    except Exception as e:
        logger.error(f"❌ 用户验证失败: {e}")

        # 为了安全起见，如果验证失败也拒绝对话
        await websocket.send_text(json.dumps({
            "type": "conversation-blocked",
            "message": "Authentication failed, unable to start conversation"
        }))

        # 播放英文TTS提示
        await _play_login_required_tts(context, websocket)
        return

    # 在开始新对话前，发送音频停止信号给前端，停止当前播放的TTS音频
    try:
        stop_payload = {
            "type": "audio-stop",
            "message": "Stop current audio playback for new conversation"
        }
        await websocket.send_text(json.dumps(stop_payload))
        logger.info("🛑 新对话开始前已发送音频停止信号给前端")
    except Exception as e:
        logger.warning(f"⚠️ 发送音频停止信号时出错: {e}")

    # Set websocket for agent if it supports WebSocket
    if isinstance(context.agent_engine, BasicMemoryAgent):
        logger.debug("为 BasicMemoryAgent 设置 WebSocket")
        context.agent_engine.set_websocket(websocket, websocket_handler, client_uid)
    elif isinstance(context.agent_engine, LangchainAgentWrapper):
        logger.debug("为 LangchainAgentWrapper 设置 WebSocket")
        context.agent_engine.set_websocket(websocket, websocket_handler, client_uid)
        logger.debug(f"set_websocket 方法调用完成，客户端: {client_uid}")
    elif hasattr(context.agent_engine, 'set_websocket'):
        # For other agents that support WebSocket
        logger.debug(f"为 {type(context.agent_engine).__name__} 设置 WebSocket (通用方法)")
        context.agent_engine.set_websocket(websocket, websocket_handler, client_uid)
        logger.debug(f"通用 set_websocket 方法调用完成，客户端: {client_uid}")
    else:
        logger.warning(f"Agent {type(context.agent_engine).__name__} 不支持 WebSocket")

    # 检测是否是AI主动发起的对话
    is_ai_initiated = (msg_type == "ai-speak-signal")

    if msg_type == "ai-speak-signal":
        user_input = "Please start a conversation with me."  # AI主动发起对话的触发提示
        logger.info("🤖 检测到AI主动发起对话，将使用无MCP搜索提示的系统提示词")
        await websocket.send_text(
            json.dumps(
                {
                    "type": "full-text",
                    "text": "AI wants to speak something...",
                }
            )
        )
    elif msg_type == "text-input":
        user_input = data.get("text", "")
    elif msg_type == "mic-audio-end":
        # 检查数组是否为空
        if len(received_data_buffers[client_uid]) > 0:
            user_input = received_data_buffers[client_uid]
        else:
            user_input = np.array([])  # 或者使用其他默认值
        received_data_buffers[client_uid] = np.array([])

    images = data.get("images")
    
    # 优先从用户上下文获取真实用户ID
    user_id = None
    try:
        from ..bff_integration.auth.user_context import UserContextManager
        user_id = UserContextManager.get_current_user_id()
        if user_id:
            logger.debug(f"✅ 从用户上下文获取用户ID: {user_id}")
        else:
            logger.warning("⚠️ 用户上下文中无用户ID")
    except Exception as e:
        logger.warning(f"⚠️ 获取用户上下文失败: {e}")
    
    # 如果无法从上下文获取，尝试从消息中获取
    if not user_id:
        user_id = data.get("user_id")
        if user_id:
            logger.debug(f"📨 从消息获取用户ID: {user_id}")
        else:
            logger.warning("⚠️ 消息中也无用户ID")
    
    # 最后的回退方案：使用客户端ID作为用户ID（确保每个客户端有唯一的用户标识）
    if not user_id:
        user_id = f"client_{client_uid}"
        logger.warning(f"⚠️ 使用客户端ID作为用户ID: {user_id}")
    
    session_emoji = np.random.choice(EMOJI_LIST)
    logger.debug(f"🎯 最终使用的用户ID: {user_id}")
    
    # 更新ServiceContext的user_id
    context.set_user_id(user_id)

    # 如果是AI主动发起的对话，临时修改Agent的系统提示词
    original_system_prompt = None
    logger.info(f"🔍 AI主动发起检查: is_ai_initiated={is_ai_initiated}, agent类型={type(context.agent_engine).__name__}")
    logger.info(f"🔍 Agent是否有set_system方法: {hasattr(context.agent_engine, 'set_system')}")

    if is_ai_initiated and hasattr(context.agent_engine, 'set_system'):
        try:
            # 保存原始系统提示词
            if hasattr(context.agent_engine, '_system'):
                original_system_prompt = context.agent_engine._system

            # 获取AI主动对话专用的系统提示词
            ai_initiated_system_prompt = context.get_system_prompt_for_ai_initiated()

            # 临时设置新的系统提示词
            context.agent_engine.set_system(ai_initiated_system_prompt)
            logger.info("✅ 已为AI主动对话临时设置专用系统提示词（跳过MCP搜索提示）")

        except Exception as e:
            logger.error(f"❌ 设置AI主动对话系统提示词失败: {e}")
            # 如果失败，继续使用原有的系统提示词
            is_ai_initiated = False

    group = chat_group_manager.get_client_group(client_uid)
    if group and len(group.members) > 1:
        # Set websocket for all group members' agents
        for member_uid in group.members:
            if member_uid in client_contexts:
                member_context = client_contexts[member_uid]
                if isinstance(member_context.agent_engine, BasicMemoryAgent):
                    member_context.agent_engine.set_websocket(
                        client_connections.get(member_uid)
                    )

        # Use group_id as task key for group conversations
        task_key = group.group_id
        if (
            task_key not in current_conversation_tasks
            or current_conversation_tasks[task_key].done()
        ):
            logger.info(f"Starting new group conversation for {task_key}")

            async def group_conversation_with_cleanup():
                try:
                    await process_group_conversation(
                        client_contexts=client_contexts,
                        client_connections=client_connections,
                        broadcast_func=broadcast_to_group,
                        group_members=group.members,
                        initiator_client_uid=client_uid,
                        user_input=user_input,
                        images=images,
                        session_emoji=session_emoji,
                        initiator_user_id=user_id,
                    )
                finally:
                    # 恢复原始系统提示词
                    if is_ai_initiated and original_system_prompt is not None:
                        try:
                            context.agent_engine.set_system(original_system_prompt)
                            logger.info("✅ 已恢复AI主动对话前的原始系统提示词（群组对话）")
                        except Exception as e:
                            logger.error(f"❌ 恢复原始系统提示词失败（群组对话）: {e}")

            current_conversation_tasks[task_key] = asyncio.create_task(group_conversation_with_cleanup())
    else:
        # Check the actual agent type and use appropriate processing method
        logger.info(f"🔍 检测到 Agent 类型: {type(context.agent_engine).__name__}")
        
        # 统一使用 process_single_conversation 处理所有Agent类型
        # 这样确保MCP开启和关闭时使用相同的TTS处理流程和信号发送时机
        logger.info("✅ 统一使用 single_conversation 处理方式")

        async def single_conversation_with_cleanup():
            # 生成对话唯一标识符
            conversation_id = f"conv_{client_uid}_{int(time.time() * 1000)}"

            try:
                # 开始对话计时
                conversation_timer.start_conversation(conversation_id, extracted_user_id)

                # 【第二道防线：实际积分扣除】- 已注释（普通对话不扣积分）
                # 在对话真正开始时执行积分扣除，确保资源消耗的准确计费
                # try:
                #     from ..bff_integration.database.credit_repository import CreditRepository
                #     credit_repo = CreditRepository()

                #     # 实际扣除1积分 - 使用事务确保扣除的原子性和一致性
                #     consumption_result = credit_repo.consume_credits(extracted_user_id, 1.0)

                #     if consumption_result["success"]:
                #         logger.info(f"✅ 成功扣除用户 {extracted_user_id} 积分: {consumption_result['consumed_amount']}")
                #         logger.info(f"💰 用户剩余积分: {consumption_result['remaining_credits']}")
                #         logger.info(f"📊 积分消耗详情: {consumption_result['consumption_details']}")
                #     else:
                #         # 扣除失败的情况：
                #         # 1. 积分不足（在预检查和实际扣除之间被其他对话消耗）
                #         # 2. 并发冲突（多个对话同时尝试扣除）
                #         # 3. 数据库连接问题
                #         logger.error(f"❌ 积分实际扣除失败: {consumption_result['error_message']}")
                #         # 注意：此时对话流程已经启动，为避免用户体验中断，记录错误但继续
                #         # 在生产环境中，可考虑在此处中断对话或采用补偿机制
                #         logger.warning("⚠️ 积分扣除失败但对话继续进行")

                # except Exception as e:
                #     # 系统异常情况处理
                #     logger.error(f"❌ 积分扣除系统异常: {e}")
                #     # 积分扣除异常，记录错误但允许对话继续，避免系统故障影响用户体验
                #     logger.warning("⚠️ 积分扣除异常但对话继续进行")

                # 直接处理对话流程，集成原process_single_conversation的功能
                # 记录用户请求开始时间
                conversation_start_time = time.time()
                logger.info(f"🚀 用户对话开始计时: {user_id}")

                # 使用全局TTS管理器，与原process_single_conversation保持一致
                tts_manager = global_tts_manager
                # 设置对话开始时间用于计算总响应时间
                tts_manager._conversation_start_time = conversation_start_time

                try:
                    # Send initial signals
                    await send_conversation_start_signals(websocket.send_text)
                    logger.info(f"New Conversation Chain {session_emoji} started for user {user_id}!")

                    # Process user input
                    logger.debug(f"Processing user input from {user_id}...")
                    input_text = await process_user_input(
                        user_input, context.asr_engine, websocket.send_text
                    )
                    logger.info(f"User input from {user_id}: {input_text[:100]}...")

                    # Create batch input
                    logger.debug("Creating batch input...")
                    batch_input = create_batch_input(
                        input_text=input_text,
                        images=images,
                        from_name=context.character_config.human_name,
                    )

                    # Store user message（需要 history_uid）
                    if context.history_uid:
                        logger.debug(f"Storing user message for {user_id}...")
                        store_message(
                            conf_uid=context.character_config.conf_uid,
                            history_uid=context.history_uid,
                            role="human",
                            content=input_text,
                            name=context.character_config.human_name,
                            avatar=None,  # 用户通常不需要头像，或者可以添加默认头像
                            user_id=user_id,
                        )

                    # Process agent response - 现在使用process_agent_response
                    logger.debug("Processing agent response...")
                    logger.debug(f"Agent engine状态: {context.agent_engine is not None}")
                    if context.agent_engine is None:
                        logger.error("❌ Agent engine 为 None，无法处理对话")
                        await websocket.send_text(json.dumps({"type": "error", "message": "系统代理未正确初始化"}))
                        raise ValueError("Agent engine is None")

                    full_response, model_name = await process_agent_response(
                        context=context,
                        batch_input=batch_input,
                        websocket_send=websocket.send_text,
                        tts_manager=tts_manager,
                        client_uid=client_uid,
                        conversation_id=conversation_id,
                        user_id=user_id,
                        user_input=user_input,
                        enable_memory=True,
                    )
                    logger.info(f"✅ Agent响应处理完成，响应长度: {len(full_response)}")

                    # Finalize conversation turn
                    logger.debug("Finalizing conversation turn...")
                    await finalize_conversation_turn(
                        tts_manager=tts_manager,
                        websocket_send=websocket.send_text,
                        client_uid=client_uid,
                        context=context
                    )

                    if context.history_uid and (isinstance(full_response, str) and full_response):
                        logger.debug(f"Storing AI response for {user_id}...")
                        store_message(
                            conf_uid=context.character_config.conf_uid,
                            history_uid=context.history_uid,
                            role="ai",
                            content=full_response,
                            name=context.character_config.character_name,
                            avatar=context.character_config.avatar,
                            user_id=user_id,
                        )

                    # 记录对话处理总时间
                    conversation_end_time = time.time()
                    total_time = conversation_end_time - conversation_start_time
                    logger.info(f"⏱️ 对话处理总耗时: {total_time:.2f}秒, 用户: {user_id}")

                except Exception as e:
                    logger.error(f"处理对话时发生错误: {e}")
                    await websocket.send_text(
                        json.dumps({"type": "error", "message": f"Conversation error: {str(e)}"})
                    )
                    raise
                finally:
                    cleanup_conversation(tts_manager, session_emoji)
            finally:
                # 结束对话计时
                conversation_timer.end_conversation(conversation_id)

                # 恢复原始系统提示词
                if is_ai_initiated and original_system_prompt is not None:
                    try:
                        context.agent_engine.set_system(original_system_prompt)
                        logger.info("✅ 已恢复AI主动对话前的原始系统提示词")
                    except Exception as e:
                        logger.error(f"❌ 恢复原始系统提示词失败: {e}")

        current_conversation_tasks[client_uid] = asyncio.create_task(single_conversation_with_cleanup())


async def handle_individual_interrupt(
    client_uid: str,
    current_conversation_tasks: Dict[str, Optional[asyncio.Task]],
    context: ServiceContext,
    heard_response: str,
):
    if client_uid in current_conversation_tasks:
        task = current_conversation_tasks[client_uid]
        if task and not task.done():
            task.cancel()
            logger.info("🛑 Conversation task was successfully interrupted")

        try:
            context.agent_engine.handle_interrupt(heard_response)
        except Exception as e:
            logger.error(f"Error handling interrupt: {e}")

        if context.history_uid:
            store_message(
                conf_uid=context.character_config.conf_uid,
                history_uid=context.history_uid,
                role="ai",
                content=heard_response,
                name=context.character_config.character_name,
                avatar=context.character_config.avatar,
            )
            store_message(
                conf_uid=context.character_config.conf_uid,
                history_uid=context.history_uid,
                role="system",
                content="[Interrupted by user]",
            )


async def handle_group_interrupt(
    group_id: str,
    heard_response: str,
    current_conversation_tasks: Dict[str, Optional[asyncio.Task]],
    chat_group_manager: ChatGroupManager,
    client_contexts: Dict[str, ServiceContext],
    broadcast_to_group: Callable,
) -> None:
    """Handles interruption for a group conversation"""
    task = current_conversation_tasks.get(group_id)
    if not task or task.done():
        return

    # Get state and speaker info before cancellation
    state = GroupConversationState.get_state(group_id)
    current_speaker_uid = state.current_speaker_uid if state else None

    # Get context from current speaker
    context = None
    group = chat_group_manager.get_group_by_id(group_id)
    if current_speaker_uid:
        context = client_contexts.get(current_speaker_uid)
        logger.info(f"Found current speaker context for {current_speaker_uid}")
    if not context and group and group.members:
        logger.warning(f"No context found for group {group_id}, using first member")
        context = client_contexts.get(next(iter(group.members)))

    # Now cancel the task
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        logger.info(f"🛑 Group conversation {group_id} cancelled successfully.")

    current_conversation_tasks.pop(group_id, None)
    GroupConversationState.remove_state(group_id)  # Clean up state after we've used it

    # Store messages with speaker info
    if context and group:
        for member_uid in group.members:
            if member_uid in client_contexts:
                try:
                    member_ctx = client_contexts[member_uid]
                    member_ctx.agent_engine.handle_interrupt(heard_response)
                    store_message(
                        conf_uid=member_ctx.character_config.conf_uid,
                        history_uid=member_ctx.history_uid,
                        role="ai",
                        content=heard_response,
                        name=context.character_config.character_name,
                        avatar=context.character_config.avatar,
                    )
                    store_message(
                        conf_uid=member_ctx.character_config.conf_uid,
                        history_uid=member_ctx.history_uid,
                        role="system",
                        content="[Interrupted by user]",
                    )
                except Exception as e:
                    logger.error(f"Error handling interrupt for {member_uid}: {e}")

    await broadcast_to_group(
        list(group.members),
        {
            "type": "interrupt-signal",
            "text": "conversation-interrupted",
        },
    )
