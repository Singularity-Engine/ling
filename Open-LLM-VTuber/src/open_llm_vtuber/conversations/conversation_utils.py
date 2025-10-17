import asyncio
import re
from typing import Optional, Union, Any, List, Dict
import numpy as np
import json
from loguru import logger

from ..message_handler import message_handler
from .types import WebSocketSend, BroadcastContext
from .tts_manager import TTSTaskManager
from .global_tts_manager import global_tts_manager, TTSPriority
from ..agent.output_types import SentenceOutput, AudioOutput
from ..agent.input_types import BatchInput, TextData, ImageData, TextSource, ImageSource
from ..asr.asr_interface import ASRInterface
from ..live2d_model import Live2dModel
from ..tts.tts_interface import TTSInterface
from ..utils.stream_audio import prepare_audio_payload
from ..service_context import ServiceContext


# Convert class methods to standalone functions
def create_batch_input(
        input_text: str,
        images: Optional[List[Dict[str, Any]]],
        from_name: str,
) -> BatchInput:
    """Create batch input for agent processing"""
    return BatchInput(
        texts=[
            TextData(source=TextSource.INPUT, content=input_text, from_name=from_name)
        ],
        images=[
            ImageData(
                source=ImageSource(img["source"]),
                data=img["data"],
                mime_type=img["mime_type"],
            )
            for img in (images or [])
        ]
        if images is not None and (isinstance(images, list) and len(images) > 0)
        else None,
    )


async def process_agent_output(
        output: Union[AudioOutput, SentenceOutput],
        character_config: Any,
        live2d_model: Live2dModel,
        tts_engine: TTSInterface,
        websocket_send: WebSocketSend,
        tts_manager: TTSTaskManager,
        translate_engine: Optional[Any] = None,
        client_uid: str = None,
        tts_priority: TTSPriority = TTSPriority.NORMAL,
) -> str:
    """Process agent output with character information and optional translation"""
    output.display_text.name = character_config.character_name
    output.display_text.avatar = character_config.avatar

    full_response = ""
    try:
        # 检查是否是工具调用
        if hasattr(output, "tool_calls") and output.tool_calls:
            logger.info(f"Processing tool calls: {output.tool_calls}")
            for tool_call in output.tool_calls:
                tool_name = tool_call.get("name")
                tool_args = tool_call.get("arguments")
                logger.info(f"Tool call: {tool_name} with args: {tool_args}")
                # 工具调用结果会在后续的输出中返回
                # 对于search_similar_memories工具，我们需要特殊处理，让它直接显示结果
                if tool_name == "search_similar_memories":
                    # 不显示工具调用提示，直接等待工具结果
                    pass
                else:
                    full_response += f"[调用工具: {tool_name}]\n"

        # 检查是否是工具调用结果
        if hasattr(output, "tool_output") and output.tool_output is not None:
            logger.info(f"Processing tool output: {output.tool_output}")
            tool_name = output.tool_output.get("name", "unknown_tool")
            tool_result = output.tool_output.get("result", "")
            logger.info(f"Tool result from {tool_name}: {tool_result}")
            # 对于search_similar_memories工具，直接显示结果
            if tool_name == "search_similar_memories":
                # 直接将结果添加到响应中，让AI基于这些信息生成回复
                # 但我们不直接显示给用户，而是让AI基于这些信息生成自然语言回复
                # 将工具结果添加到对话历史中，确保AI能看到
                if hasattr(output, 'agent') and hasattr(output.agent, 'conversation_history'):
                    output.agent.conversation_history.append({
                        "role": "system",
                        "content": f"工具 {tool_name} 的搜索结果:\n{tool_result}"
                    })
            # 对于其他工具，不直接显示工具调用结果，让AI来解释结果
            # 其他工具的结果将被添加到对话历史中，供AI参考

        # 处理常规输出
        if isinstance(output, SentenceOutput):
            response = await handle_sentence_output(
                output,
                live2d_model,
                tts_engine,
                websocket_send,
                tts_manager,
                translate_engine,
                client_uid,
                tts_priority,
            )
            full_response += response
        elif isinstance(output, AudioOutput):
            response = await handle_audio_output(output, websocket_send)
            full_response += response
        else:
            logger.warning(f"Unknown output type: {type(output)}")
    except Exception as e:
        logger.error(f"Error processing agent output: {e}")
        await websocket_send(
            json.dumps(
                {"type": "error", "message": f"Error processing response: {str(e)}"}
            )
        )

    return full_response


async def handle_sentence_output(
        output: SentenceOutput,
        live2d_model: Live2dModel,
        tts_engine: TTSInterface,
        websocket_send: WebSocketSend,
        tts_manager: TTSTaskManager,
        translate_engine: Optional[Any] = None,
        client_uid: str = None,
        tts_priority: TTSPriority = TTSPriority.NORMAL,
) -> str:
    """Handle sentence output type with optional translation support"""
    full_response = ""
    async for display_text, tts_text, actions in output:

        # 🔧 备用表情提取逻辑 - 如果Actions为空，直接提取表情
        if not actions or not actions.to_dict():

            # 从显示文本中提取表情
            if display_text and display_text.text:
                extracted_expressions = live2d_model.extract_emotion(display_text.text)
                if extracted_expressions:
                    # 🚨 限制表情数量，避免系统过载
                    if len(extracted_expressions) > 3:
                        extracted_expressions = extracted_expressions[:3]

                    # 🎯 去重处理，避免重复表情
                    unique_expressions = []
                    seen = set()
                    for expr in extracted_expressions:
                        if expr not in seen:
                            unique_expressions.append(expr)
                            seen.add(expr)
                    extracted_expressions = unique_expressions

                    logger.debug(f"备用提取成功表情: {extracted_expressions}")

                    # 创建新的Actions对象
                    from ..agent.output_types import Actions
                    if not actions:
                        actions = Actions()
                    actions.expressions = extracted_expressions
                    # 🎭 设置播放模式为序列播放
                    actions.isPlaylist = True

        # 翻译处理
        if translate_engine:
            if len(re.sub(r'[\s.,!?，。！？\'"』」）】\s]+', "", tts_text)):
                tts_text = translate_engine.translate(tts_text)

        full_response += display_text.text
        
        # 直接使用全局TTS管理器，简化逻辑
        logger.info(f"🎵 准备调用global_tts_manager.speak，文本: {tts_text[:100]}...")
        task_id = await global_tts_manager.speak(
            tts_text=tts_text,
            display_text=display_text,
            actions=actions,
            live2d_model=live2d_model,
            tts_engine=tts_engine,
            websocket_send=websocket_send,
            priority=tts_priority,
            client_uid=client_uid,
            enable_sentence_split=True,  # 默认启用断句功能
        )
        logger.info(f"🎵 global_tts_manager.speak 调用完成，任务ID: {task_id}")
    return full_response


async def handle_audio_output(
        output: AudioOutput,
        websocket_send: WebSocketSend,
) -> str:
    """Process and send AudioOutput directly to the client"""
    full_response = ""
    async for audio_path, display_text, transcript, actions in output:
        full_response += transcript
        audio_payload = prepare_audio_payload(
            audio_path=audio_path,
            display_text=display_text,
            actions=actions.to_dict() if actions else None,
        )
        await websocket_send(json.dumps(audio_payload))
    return full_response


async def send_conversation_start_signals(websocket_send: WebSocketSend) -> None:
    """Send initial conversation signals"""
    await websocket_send(
        json.dumps(
            {
                "type": "control",
                "text": "conversation-chain-start",
            }
        )
    )
    await websocket_send(json.dumps({"type": "full-text", "text": "Thinking..."}))


async def process_user_input(
        user_input: Union[str, np.ndarray],
        asr_engine: ASRInterface,
        websocket_send: WebSocketSend,
) -> str:
    """Process user input, converting audio to text if needed"""
    if isinstance(user_input, np.ndarray):
        logger.info("Transcribing audio input...")
        input_text = await asr_engine.async_transcribe_np(user_input)
        await websocket_send(
            json.dumps({"type": "user-input-transcription", "text": input_text})
        )
        return input_text
    return user_input


async def finalize_conversation_turn(
        tts_manager: TTSTaskManager,
        websocket_send: WebSocketSend,
        client_uid: str,
        context: ServiceContext = None
) -> None:
    """Finalize a conversation turn

    Args:
        tts_manager: TTSTaskManager instance
        websocket_send: WebSocket send function
        client_uid: Client unique identifier
        context: Optional service context for sending affinity updates
    """
    # 等待所有TTS任务完成后再发送结束信号
    logger.info("🎯 finalize_conversation_turn: 开始等待TTS任务完成...")
    logger.info(f"📊 TTS管理器类型: {type(tts_manager).__name__}")

    tts_completed = await tts_manager.wait_for_all_tasks_complete(timeout=8.0)
    if not tts_completed:
        logger.warning("⏰ TTS任务等待超时或失败，延迟发送结束信号")
        # 即使超时，也给一点额外时间让音频播放
        await asyncio.sleep(2.0)
    else:
        logger.info("✅ TTS任务全部完成，准备发送结束信号")

    # 创建并行任务列表
    tasks = []

    # 添加发送结束信号任务
    tasks.append(send_conversation_end_signal(websocket_send))

    # 如果有情感系统，添加发送情感更新任务
    if context and context.emotion_manager:
        async def send_affinity_update():
            try:
                character_id = context.character_config.conf_uid
                
                # 获取用户ID - 优先从WebSocket缓存，回退到Context Variable，最后使用默认值
                user_id = None
                try:
                    from ..bff_integration.auth.websocket_user_cache import get_user_id_for_websocket_client
                    user_id = get_user_id_for_websocket_client(client_uid)
                except Exception:
                    pass
                
                if not user_id:
                    try:
                        from ..bff_integration.auth.user_context import UserContextManager
                        user_id = UserContextManager.get_current_user_id()
                    except Exception:
                        pass
                        
                if not user_id:
                    user_id = "default_user"
                
                affinity = context.emotion_manager.get_affinity(character_id, user_id)
                level = context.emotion_manager.get_affinity_level(affinity)

                await websocket_send(json.dumps({
                    "type": "affinity-update",
                    "affinity": affinity,
                    "level": level
                }))
            except Exception as e:
                logger.error(f"发送情感更新错误: {e}")
        
        tasks.append(send_affinity_update())
    
    # 并行执行所有任务，设置超时避免卡死
    if tasks:
        try:
            # 设置1秒超时，避免无限等待
            await asyncio.wait_for(
                asyncio.gather(*tasks, return_exceptions=True), 
                timeout=1.0
            )
        except asyncio.TimeoutError:
            logger.warning("结束对话任务超时，继续执行")
        except Exception as e:
            logger.error(f"结束对话轮次错误: {e}")


async def send_conversation_end_signal(
        websocket_send: WebSocketSend,
        broadcast_ctx: Optional[BroadcastContext] = None,
        session_emoji: str = "😊",
) -> None:
    """Send conversation chain end signal"""
    chain_end_msg = {
        "type": "control",
        "text": "conversation-chain-end",
    }

    await websocket_send(json.dumps(chain_end_msg))

    if broadcast_ctx and broadcast_ctx.broadcast_func and broadcast_ctx.group_members:
        await broadcast_ctx.broadcast_func(
            broadcast_ctx.group_members,
            chain_end_msg,
        )

    logger.info(f"😎👍✅ Conversation Chain {session_emoji} completed!")


def cleanup_conversation(tts_manager: TTSTaskManager, session_emoji: str) -> None:
    """Clean up conversation resources"""
    # 只有传统的TTSTaskManager才需要清理，全局管理器不应被单个对话清理
    if hasattr(tts_manager, '__class__') and tts_manager.__class__.__name__ == 'TTSTaskManager':
        tts_manager.clear()
        logger.debug(f"🧹 Clearing up local TTS manager for conversation {session_emoji}.")
    else:
        # 全局TTS管理器不需要清理，因为可能有其他对话在使用
        logger.debug(f"🧹 Conversation {session_emoji} ended, but keeping global TTS manager active.")


EMOJI_LIST = [
    "🐶",
    "🐱",
    "🐭",
    "🐹",
    "🐰",
    "🦊",
    "🐻",
    "🐼",
    "🐨",
    "🐯",
    "🦁",
    "🐮",
    "🐷",
    "🐸",
    "🐵",
    "🐔",
    "🐧",
    "🐦",
    "🐤",
    "🐣",
    "🐥",
    "🦆",
    "🦅",
    "🦉",
    "🦇",
    "🐺",
    "🐗",
    "🐴",
    "🦄",
    "🐝",
    "🌵",
    "🎄",
    "🌲",
    "🌳",
    "🌴",
    "🌱",
    "🌿",
    "☘️",
    "🍀",
    "🍂",
    "🍁",
    "🍄",
    "🌾",
    "💐",
    "🌹",
    "🌸",
    "🌛",
    "🌍",
    "⭐️",
    "🔥",
    "🌈",
    "🌩",
    "⛄️",
    "🎃",
    "🎄",
    "🎉",
    "🎏",
    "🎗",
    "🀄️",
    "🎭",
    "🎨",
    "🧵",
    "🪡",
    "🧶",
    "🥽",
    "🥼",
    "🦺",
    "👔",
    "👕",
    "👜",
    "👑",
]
