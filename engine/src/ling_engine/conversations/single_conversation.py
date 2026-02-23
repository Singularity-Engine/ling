from typing import Union, List, Dict, Any, Optional
import asyncio
import json
from loguru import logger
import numpy as np
from datetime import datetime
from ..important import save_memory_async
from ..important import search_similar_memories
from .conversation_utils import (
    create_batch_input,
    process_agent_output,
    send_conversation_start_signals,
    process_user_input,
    finalize_conversation_turn,
    cleanup_conversation,
    EMOJI_LIST,
)
from ..utils.token_counter import token_stats, TokenCalculator, TokenUsage  # 添加TokenCalculator和TokenUsage导入
from ..utils.token_cost_tracker import token_cost_tracker
from .types import WebSocketSend
from .tts_manager import TTSTaskManager
from .global_tts_manager import global_tts_manager, TTSPriority
from ..chat_history_manager import store_message
from ..service_context import ServiceContext
import traceback




async def process_agent_response(
        context: ServiceContext,
        batch_input: Any,
        websocket_send: WebSocketSend,
        tts_manager: TTSTaskManager,
        client_uid: str = None,
        conversation_id: Optional[str] = None,
        user_id: str = "default_user",
        user_input: Union[str, np.ndarray] = None,
        enable_memory: bool = True,
) -> tuple[str, str]:
    """Process agent response and generate output"""
    full_response = ""
    input_tokens = 0
    output_tokens = 0

    # 🧠 记忆增强处理 — 每轮触发（输入 > 5 字符即搜索 top-3）
    if enable_memory and isinstance(user_input, str) and len(user_input.strip()) > 5:
        logger.info("🧠 每轮记忆召回：搜索用户相关记忆")
        try:
            results = search_similar_memories(user_input, user_id, limit=3)
            if results:
                memory_info = [item[1] for item in results if len(item) >= 2 and item[1]]
                if memory_info:
                    logger.info(f"🧠 召回 {len(memory_info)} 条相关记忆")
                    memory_context = "\n".join([f"- {info}" for info in memory_info])
                    character_name = getattr(context.character_config, 'character_name', 'AI') if hasattr(context, 'character_config') else 'AI'

                    enhanced_input = f"{user_input}\n\n[记忆上下文 — 以下是你记住的关于这位用户的信息，自然地融入回答中，不要逐条复述]\n{memory_context}"

                    if hasattr(batch_input, 'texts') and batch_input.texts:
                        batch_input.texts[0].content = enhanced_input
                    elif hasattr(batch_input, '__setitem__'):
                        batch_input['content'] = enhanced_input
                    logger.info("🧠 用户输入已增强，包含记忆信息")
        except Exception as e:
            logger.warning(f"🧠 记忆增强失败，继续正常处理: {e}")

    # 🔄 每次新对话开始时清除重复处理标记
    if context.agent_engine is not None and hasattr(context.agent_engine, '_background_processed'):
        delattr(context.agent_engine, '_background_processed')

    # 初始化模型名称为空，稍后会尝试从不同来源获取
    model_name = ""

    # 初始化用户ID变量，避免在后续使用时出现NameError
    user_id_for_affinity = "default_user"

    try:
        # Ensure emotion prompt is injected per-turn even when called directly (e.g., MCP flows)
        try:
            if context.emotion_manager:
                base_prompt = context.system_prompt_base
                if not base_prompt:
                    try:
                        base_prompt = context.construct_system_prompt(context.character_config.persona_prompt)
                        if context.live2d_model:
                            base_prompt = f"{base_prompt}\n\nYou can use these expressions in your responses: {context.live2d_model.emo_str}"
                        context.system_prompt_base = base_prompt
                    except Exception:
                        base_prompt = context.system_prompt or ""

                # 获取用户ID - 优先从WebSocket缓存，回退到Context Variable，最后使用默认值
                user_id_for_affinity = None
                try:
                    from ..bff_integration.auth.websocket_user_cache import get_user_id_for_websocket_client
                    if client_uid:
                        user_id_for_affinity = get_user_id_for_websocket_client(client_uid)
                        if user_id_for_affinity:
                            logger.debug(f"🎯 process_agent_response: 从WebSocket缓存获取用户ID: {user_id_for_affinity}")
                except Exception as cache_error:
                    logger.debug(f"WebSocket缓存获取用户ID失败: {cache_error}")

                if not user_id_for_affinity:
                    try:
                        from ..bff_integration.auth.user_context import UserContextManager
                        user_id_for_affinity = UserContextManager.get_current_user_id()
                        if user_id_for_affinity:
                            logger.debug(f"🎯 process_agent_response: 从Context Variable获取用户ID: {user_id_for_affinity}")
                    except Exception as ctx_error:
                        logger.debug(f"Context Variable获取用户ID失败: {ctx_error}")

                if not user_id_for_affinity:
                    user_id_for_affinity = context.user_id or "default_user"
                    logger.warning("⚠️ process_agent_response: 无法获取用户ID，使用默认值或Context值")

                affinity_value = context.emotion_manager.get_affinity(context.character_config.conf_uid,
                                                                      user_id_for_affinity)
                emotion_prompt = context.emotion_manager.get_emotion_prompt(affinity_value)
                dynamic_system = "\n\n".join([base_prompt, emotion_prompt])
                logger.info(f"🎭 情感提示词内容: {emotion_prompt}")
                logger.debug(f"🎭 完整系统提示词: {dynamic_system}")

                if context.agent_engine is not None:
                    if hasattr(context.agent_engine, 'set_system') and callable(
                            getattr(context.agent_engine, 'set_system')):
                        context.agent_engine.set_system(dynamic_system)
                        logger.info(
                            f"🧠 每轮注入情感提示[direct]: affinity={affinity_value}, user_id={user_id_for_affinity}")
                    elif hasattr(context.agent_engine, 'system_prompt'):
                        context.agent_engine.system_prompt = dynamic_system
                        logger.info(
                            f"🧠 每轮注入情感提示(LC)[direct]: affinity={affinity_value}, user_id={user_id_for_affinity}")
                else:
                    logger.error("❌ Agent engine is None - cannot inject emotion system prompt")


                # Console print for quick visibility
                try:
                    logger.debug(f"当前好感度（每轮）: {affinity_value}（用户: {user_id_for_affinity}）")
                except Exception:
                    pass
        except Exception as e:
            logger.warning(f"每轮注入情感提示（direct）失败: {e}")

        # 🔀 模型路由：根据用户 plan 动态切换 Anthropic 模型
        try:
            if user_id_for_affinity and user_id_for_affinity != "default_user":
                from ..bff_integration.database.ling_user_repository import LingUserRepository
                from ..bff_integration.auth.model_router import resolve_model
                _repo = LingUserRepository()
                _user_record = _repo.get_user_by_id(user_id_for_affinity)
                if _user_record:
                    target_model = resolve_model(_user_record)
                    if context.agent_engine is not None and hasattr(context.agent_engine, '_llm'):
                        llm = context.agent_engine._llm
                        old_model = getattr(llm, 'model', getattr(llm, 'model_name', 'unknown'))
                        if hasattr(llm, 'model'):
                            llm.model = target_model
                        elif hasattr(llm, 'model_name'):
                            llm.model_name = target_model
                        logger.info(f"🔀 模型路由: {old_model} → {target_model} (plan={_user_record.get('plan', 'free')})")
        except Exception as e:
            logger.warning(f"🔀 模型路由失败，使用默认模型: {e}")

        # 调用情感系统处理用户输入
        logger.debug("Starting agent response processing...")
        logger.debug(f"Agent type: {type(context.agent_engine).__name__}")

        # 获取消息内容用于token计算
        messages = []
        if hasattr(batch_input, 'texts'):
            # 构造消息列表用于token计算
            if context.agent_engine is not None and hasattr(context.agent_engine, '_conversation_history'):
                messages = context.agent_engine._conversation_history.copy()

            # 添加当前输入
            for text_data in batch_input.texts:
                messages.append({
                    "role": "user",
                    "content": text_data.content
                })
        else:
            # 尝试从agent获取历史消息
            if context.agent_engine is not None and hasattr(context.agent_engine, '_conversation_history'):
                messages = context.agent_engine._conversation_history.copy()
                messages.append({
                    "role": "user",
                    "content": str(batch_input)
                })

        # 获取模型名称 - 改进的方法
        try:
            # 首先尝试从配置中获取模型名称
            if hasattr(context, 'character_config') and hasattr(context.character_config, 'agent_config'):
                agent_config = context.character_config.agent_config

                # 检查 agent_config 是否为 AgentConfig 对象
                if hasattr(agent_config, 'agent_settings') and hasattr(agent_config, 'llm_configs'):
                    # AgentConfig 对象，直接访问属性
                    basic_memory_settings = getattr(agent_config.agent_settings, 'basic_memory_agent', {})
                    llm_provider = basic_memory_settings.get('llm_provider', '') if isinstance(basic_memory_settings, dict) else ''
                    if llm_provider:
                        logger.debug(f"当前LLM提供者: {llm_provider}")

                    # 从llm_configs中获取对应提供者的模型配置
                    llm_configs = agent_config.llm_configs
                    if isinstance(llm_configs, dict) and llm_provider:
                        if llm_provider in llm_configs:
                            provider_config = llm_configs[llm_provider]
                            if isinstance(provider_config, dict) and 'model' in provider_config:
                                model_name = provider_config['model']
                                logger.debug(f"从配置中获取到模型名称: {model_name}")
                            elif hasattr(provider_config, 'model'):
                                model_name = provider_config.model
                                logger.debug(f"从配置中获取到模型名称: {model_name}")
                            else:
                                logger.warning(f"提供者 {llm_provider} 的配置中没有找到 'model' 字段")
                        else:
                            logger.warning(f"在llm_configs中没有找到提供者 {llm_provider} 的配置")
                    elif isinstance(llm_configs, dict) and not llm_provider:
                        # 没有指定llm_provider，尝试获取第一个配置
                        if llm_configs:
                            first_provider = next(iter(llm_configs.keys()))
                            first_config = llm_configs[first_provider]
                            if isinstance(first_config, dict) and 'model' in first_config:
                                model_name = first_config['model']
                                logger.debug(f"使用第一个可用配置的模型: {model_name} (来自 {first_provider})")
                            elif hasattr(first_config, 'model'):
                                model_name = first_config.model
                                logger.debug(f"使用第一个可用配置的模型: {model_name} (来自 {first_provider})")
                    else:
                        logger.debug("没有找到有效的llm_configs配置")
                else:
                    # 字典形式的配置
                    basic_memory_settings = agent_config.get('agent_settings', {}).get('basic_memory_agent', {})
                    llm_provider = basic_memory_settings.get('llm_provider', '')
                    if llm_provider:
                        logger.debug(f"当前LLM提供者: {llm_provider}")

                    # 从llm_configs中获取对应提供者的模型配置
                    if 'llm_configs' in agent_config and llm_provider:
                        llm_configs = agent_config['llm_configs']
                        if llm_provider in llm_configs:
                            provider_config = llm_configs[llm_provider]
                            if 'model' in provider_config:
                                model_name = provider_config['model']
                                logger.debug(f"从配置中获取到模型名称: {model_name}")
                            else:
                                logger.warning(f"提供者 {llm_provider} 的配置中没有找到 'model' 字段")
                        else:
                            logger.warning(f"在llm_configs中没有找到提供者 {llm_provider} 的配置")
                            # 尝试获取第一个可用的配置
                            if llm_configs:
                                first_provider = next(iter(llm_configs.keys()))
                                first_config = llm_configs[first_provider]
                                if 'model' in first_config:
                                    model_name = first_config['model']
                                    logger.debug(f"使用第一个可用配置的模型: {model_name} (来自 {first_provider})")
                    elif 'llm_configs' in agent_config and not llm_provider:
                        # 没有指定llm_provider，尝试获取第一个配置
                        llm_configs = agent_config['llm_configs']
                        if llm_configs:
                            first_provider = next(iter(llm_configs.keys()))
                            first_config = llm_configs[first_provider]
                            if 'model' in first_config:
                                model_name = first_config['model']
                                logger.debug(f"使用第一个可用配置的模型: {model_name} (来自 {first_provider})")
                    else:
                        logger.debug("没有找到有效的llm_configs配置")

            # 如果配置中没有获取到，再尝试从agent实例中获取
            if not model_name and hasattr(context.agent_engine, '_llm'):
                llm = context.agent_engine._llm
                # 从LLM实例中获取模型名称
                if hasattr(llm, 'model'):
                    model_name = getattr(llm, 'model')
                    logger.debug(f"从LLM实例中获取到模型名称: {model_name}")
                elif hasattr(llm, 'model_name'):
                    model_name = getattr(llm, 'model_name')
                    logger.debug(f"从LLM实例中获取到模型名称: {model_name}")

        except Exception as e:
            logger.warning(f"获取模型名称时出错: {e}")
            pass

        # 如果仍然没有获取到模型名称，使用默认值
        if not model_name:
            model_name = "unknown"
            logger.warning("无法从配置或agent实例中获取模型名称，使用默认值 'unknown'")

        # 🔥 使用LangChain智能检测是否需要工具调用
        user_message = ""
        if hasattr(batch_input, 'texts') and batch_input.texts:
            user_message = batch_input.texts[0].content
        elif isinstance(batch_input, str):
            user_message = batch_input

        # 直接进行Agent对话处理，LangchainAgentWrapper已内置MCP工具调用支持
        logger.info("🚀 使用LangchainAgentWrapper内置MCP处理，开始对话")

        # 直接处理Agent对话，不需要额外的工具检测

        # 检查 agent_engine 是否为 None
        if context.agent_engine is None:
            logger.error("❌ Agent engine is None - cannot process conversation")
            error_msg = "抱歉，系统代理未正确初始化，无法处理对话。请检查系统配置。"

            # 发送错误消息到 WebSocket
            if websocket_send:
                try:
                    from ..agent.output_types import SentenceOutput, DisplayText, Actions
                    error_output = SentenceOutput(
                        display_text=DisplayText(text=error_msg),
                        tts_text=error_msg,
                        actions=Actions()
                    )
                    await websocket_send(error_output)
                except Exception as e:
                    logger.error(f"发送错误消息到WebSocket失败: {e}")

            # 返回错误消息和空模型名
            return error_msg, ""

        # 正常对话流程 - 传递client_uid确保MCP工作区消息路由正确
        if hasattr(context.agent_engine, 'chat') and hasattr(context.agent_engine.chat, '__code__'):
            # 检查chat方法是否支持context_client_uid参数
            import inspect
            sig = inspect.signature(context.agent_engine.chat)
            if 'context_client_uid' in sig.parameters:
                agent_output = context.agent_engine.chat(batch_input, context_client_uid=client_uid)
                logger.debug(f"🎯 调用Agent.chat时传递了client_uid: {client_uid}")
            else:
                agent_output = context.agent_engine.chat(batch_input)
                logger.debug("Agent.chat方法不支持context_client_uid参数，使用传统调用方式")
        else:
            agent_output = context.agent_engine.chat(batch_input)
        logger.debug("Agent chat method called successfully")

        logger.debug("Processing agent output stream...")
        first_response_recorded = False
        async for output in agent_output:
            logger.debug(f"Processing output chunk type: {type(output).__name__}")

            # 记录首次响应时间
            if not first_response_recorded and conversation_id:
                from ..utils.conversation_timer import conversation_timer
                conversation_timer.mark_first_response(conversation_id)
                first_response_recorded = True

            response_part = await process_agent_output(
                output=output,
                character_config=context.character_config,
                live2d_model=context.live2d_model,
                tts_engine=context.tts_engine,
                websocket_send=websocket_send,
                tts_manager=tts_manager,
                translate_engine=context.translate_engine,
                client_uid=client_uid,
                tts_priority=TTSPriority.NORMAL,  # 对话语音使用普通优先级
            )
            full_response += response_part
            logger.debug(f"Response part processed: {response_part[:50]}...")

        # 🔧 LangchainAgentWrapper已包含完整的MCP工具调用支持，无需额外处理

        # 计算输出token
        try:
            if isinstance(full_response, str) and full_response:
                # 使用之前获取的 model_name 变量，如果为空则尝试从 context.agent_engine._llm 中获取
                actual_model_name = model_name
                if not actual_model_name or actual_model_name == "unknown":
                    if hasattr(context.agent_engine, '_llm') and hasattr(context.agent_engine._llm, 'model'):
                        actual_model_name = context.agent_engine._llm.model
                    elif hasattr(context.agent_engine, 'model'):
                        actual_model_name = context.agent_engine.model

                # 性能优化：使用缓存的TokenCalculator实例
                if not hasattr(context, '_token_calculator') or context._token_calculator is None or getattr(context._token_calculator, 'model', '') != actual_model_name:
                    context._token_calculator = TokenCalculator(actual_model_name)
                    logger.debug(f"为模型 {actual_model_name} 创建新的TokenCalculator实例")

                output_tokens = context._token_calculator.count_tokens(full_response)
                total_tokens = input_tokens + output_tokens

                usage = TokenUsage(
                    prompt_tokens=input_tokens,
                    completion_tokens=output_tokens,
                    total_tokens=total_tokens
                )

                # 估算成本
                cost_info = context._token_calculator.estimate_cost(usage)

                # 注意：不再在这里记录token使用情况，因为LLM本身已经记录了
                # 这避免了重复记录导致"unknown, gpt-4o-mini"这样的输出


                character_name = context.character_config.character_name if hasattr(context, "character_config") else "unknown"
                logger.info(f"[Token跟踪] 主对话结束 - 角色: {character_name}, 模型: {actual_model_name}, 输出Token: {output_tokens}, " +
                           f"总Token: {total_tokens}, 成本: ${cost_info.total_cost:.6f}")
        except Exception as e:
            logger.warning(f"计算输出token时出错: {e}")

        # 🧹 工具结果现在在后台处理完成后才清理，不在这里清理

    except Exception as e:
        error_msg = (
            f"Error processing agent response:\n"
            f"Error type: {type(e).__name__}\n"
            f"Error message: {str(e)}\n"
            f"Agent type: {type(context.agent_engine).__name__}\n"
            f"Input type: {type(batch_input).__name__}\n"
            f"Current response: {full_response}"
        )
        logger.error(error_msg)
        logger.error(f"Full error: {e}")
        if hasattr(e, '__cause__'):
            logger.error(f"Error cause: {e.__cause__}")
        raise

    # 🧠 异步保存记忆（如果启用且有有效的对话内容）
    # 修复：确保user_input和full_response是有效的字符串，避免numpy数组布尔判断错误
    has_valid_user_input = user_input is not None and (isinstance(user_input, str) and user_input or isinstance(user_input, np.ndarray) and len(user_input) > 0)
    has_valid_full_response = full_response is not None and (isinstance(full_response, str) and full_response)

    if enable_memory and has_valid_user_input and has_valid_full_response:
        try:
            # 清理输入文本，移除表情标签和无关内容
            clean_user_input = str(user_input).replace('[neutral]', '').replace('[happy]', '').replace('[sad]', '').strip()
            clean_ai_response = str(full_response).replace('[neutral]', '').replace('[happy]', '').replace('[sad]', '').strip()

            # 构造清晰的对话格式用于记忆保存
            summr = f"用户说: {clean_user_input}\nAI回复: {clean_ai_response}"

            # 记忆保存完全异步，不阻塞用户响应（火忘模式）
            logger.debug("🧠 启动异步记忆保存任务（不等待完成）...")
            asyncio.create_task(save_memory_async(summr, user_id))
            # 同时记录到 EverMemOS（灵的长期记忆）
            try:
                from ..tools.evermemos_client import record_conversation
                asyncio.create_task(
                    record_conversation(clean_user_input, clean_ai_response, user_id)
                )
            except Exception:
                pass
        except Exception as e:
            logger.warning(f"🧠 记忆保存失败: {e}")

    logger.debug("Agent response processing completed")
    return full_response, model_name


async def _process_mcp_results_with_util_agent(
    context: ServiceContext,
    user_input: str,
    websocket_send: Optional[WebSocketSend] = None,
    client_uid: Optional[str] = None,
    user_id: Optional[str] = None
):
    """完全复用 LangchainAgentWrapper 中的 util agent 处理逻辑 - 支持多用户隔离"""
    logger.info("🎯🎯🎯 _process_mcp_results_with_util_agent 函数开始执行 🎯🎯🎯")

    # 多用户会话管理
    session_context = None
    if client_uid:
        try:
            from ..multi_user import get_safe_session_context
            session_context = get_safe_session_context(client_uid)
            if session_context:
                logger.info(f"✅ 获取到用户会话上下文: {session_context['composite_key']}")
                # 确保使用会话中的用户ID
                if not user_id:
                    user_id = session_context.get('user_id')
            else:
                logger.warning(f"⚠️ 无法获取客户端 {client_uid} 的会话上下文")
        except Exception as e:
            logger.warning(f"⚠️ 获取会话上下文失败: {e}")

    try:
        # 检查是否有工具调用记录
        logger.info(f"🔍 检查工具调用记录...")
        logger.info(f"   - agent_engine 类型: {type(context.agent_engine).__name__}")
        logger.info(f"   - hasattr _collected_tool_results: {hasattr(context.agent_engine, '_collected_tool_results')}")

        # 🔧 修复：由于状态管理改造，_collected_tool_results不再是实例变量
        # 新的LangchainAgentWrapper使用方法参数传递工具结果
        logger.info(f"   - 检测到多用户支持的Agent: {hasattr(context.agent_engine, 'client_conversation_histories')}")

        # 对于新的多用户Agent，工具结果处理已内置，无需额外处理
        if hasattr(context.agent_engine, 'client_conversation_histories'):
            logger.info("✅ 使用新的多用户Agent，工具结果处理已内置，跳过传统Util Agent处理")
            return

        # 对于传统Agent，保持原有逻辑
        if hasattr(context.agent_engine, '_collected_tool_results'):
            tool_results = context.agent_engine._collected_tool_results
            logger.info(f"   - _collected_tool_results 存在: {tool_results is not None}")
            logger.info(f"   - _collected_tool_results 长度: {len(tool_results) if tool_results else 0}")
            if tool_results:
                logger.info(f"   - 具体工具结果: {[r.get('name', 'unknown') for r in tool_results]}")

        if not (hasattr(context.agent_engine, '_collected_tool_results') and context.agent_engine._collected_tool_results):
            logger.info("❌ 未检测到工具调用记录，跳过 Util Agent 处理")
            return

        # 🔧 检查并尝试重新初始化 util_agent_helper（如果为None）
        if hasattr(context.agent_engine, 'util_agent_helper') and context.agent_engine.util_agent_helper is None:
            logger.info("🔧 检测到 util_agent_helper 为 None，尝试运行时重新初始化...")
            try:
                await _reinitialize_util_agent_helper(context.agent_engine)
            except Exception as reinit_error:
                logger.error(f"❌ 运行时重新初始化 util_agent_helper 失败: {reinit_error}")

        logger.info("✅ 检测到工具调用记录，继续处理...")

        # 初始化 Util Agent Helper（直接复用原agent的LLM实例）
        util_agent_helper = None
        try:
            from ..agent.mcp_util_integration import AgentMCPUtilHelper

            # 直接复用原agent的LLM实例，确保配置一致
            if hasattr(context.agent_engine, '_llm') and context.agent_engine._llm:
                util_llm = context.agent_engine._llm  # 直接使用原agent的LLM实例
                logger.info("🔧 成功复用原agent的_llm实例")
            else:
                logger.error("🔧 无法获取原agent的_llm实例，初始化失败")
                util_agent_helper = None
                logger.warning("⚠️ 将使用原有的工具结果处理方式")
                return

            util_agent_helper = AgentMCPUtilHelper(context.agent_engine, util_llm)
            logger.info("✅ Util Agent Helper 初始化成功")

        except Exception as e:
            logger.error(f"❌ Util Agent Helper 初始化失败: {e}")
            util_agent_helper = None
            logger.warning("⚠️ 将使用原有的工具结果处理方式")

        if not util_agent_helper:
            return

        # 处理每个工具结果（完全复用 LangchainAgentWrapper 的逻辑）
        for tool_result in context.agent_engine._collected_tool_results:
            tool_name = tool_result.get("name", "unknown_tool")
            out_obj = tool_result.get("result", "")

            logger.info(f"🔍 检查工具 {tool_name} 是否需要 Util Agent 处理...")
            logger.info(f"   - util_agent_helper 存在: {util_agent_helper is not None}")

            if util_agent_helper:
                should_use_util = util_agent_helper.should_use_util_agent(tool_name)
                logger.info(f"   - 工具 {tool_name} 应该使用 Util Agent: {should_use_util}")

            if tool_name != "search_similar_memories" and util_agent_helper and util_agent_helper.should_use_util_agent(tool_name):
                # 启动完全独立的异步处理，绝不影响主流程
                try:
                    def multi_user_aware_callback(processed_result, tool_name, user_query):
                        """多用户感知的处理回调 - 仅记录用户上下文信息"""
                        logger.info(f"🔧 [多用户异步] Single Conversation Util Agent 处理完成 {tool_name}")
                        logger.debug(f"🔧 [多用户异步] 处理结果: {processed_result[:200]}...")

                        # 记录用户会话信息用于调试
                        if session_context:
                            logger.info(f"🔍 [多用户] 用户会话: {session_context['composite_key']}")
                            logger.info(f"🔍 [多用户] 用户ID: {session_context.get('user_id', 'unknown')}")
                        else:
                            logger.info(f"🔍 [多用户] 客户端ID: {client_uid or 'unknown'}")

                        # Util Agent结果不保存到数据库，只用于流式返回给用户
                        # 完全静默处理，不发送任何WebSocket消息或影响主输出
                        # if websocket_send:
                        #     # 暂时禁用，确保不干扰主对话流
                        #     pass

                    # 从消息历史获取最近的用户查询
                    current_user_query = user_input

                    # 启动多用户感知的异步任务，不保留引用
                    asyncio.create_task(
                        util_agent_helper.handle_mcp_result_truly_async(
                            user_query=current_user_query,
                            tool_name=tool_name,
                            raw_result=out_obj,
                            callback=multi_user_aware_callback
                        )
                    )

                    logger.info(f"🚀 [独立异步] 已启动 {tool_name} 的独立 Util Agent 处理")
                except Exception as util_e:
                    logger.error(f"🚀 [独立异步] 启动独立 Util Agent 处理失败: {util_e}")

    except Exception as e:
        logger.error(f"❌ Util Agent 处理过程出错: {e}")
        import traceback
        logger.error(f"❌ 错误详情: {traceback.format_exc()}")


async def _handle_tool_call_in_background(context: ServiceContext, batch_input: Any, user_input: str,
                                          websocket_send=None, client_uid: str = None):
    """后台处理工具调用，util agent流式返回结果"""
    logger.info("🔥🔥🔥 开始后台工具调用处理 🔥🔥🔥")

    try:
        logger.info(f"🔧 静默调用agent收集工具结果: {user_input[:100]}...")

        # 检查 agent_engine 是否为 None
        if context.agent_engine is None:
            logger.error("❌ Agent engine is None - cannot process background tool call")
            return

        # 🔇 静默调用agent，只收集工具结果，丢弃文本输出 - 传递client_uid确保MCP工作区消息路由正确
        if hasattr(context.agent_engine, 'chat') and hasattr(context.agent_engine.chat, '__code__'):
            import inspect
            sig = inspect.signature(context.agent_engine.chat)
            if 'context_client_uid' in sig.parameters:
                agent_output = context.agent_engine.chat(batch_input, context_client_uid=client_uid)
                logger.debug(f"🎯 后台工具调用传递client_uid: {client_uid}")
            else:
                agent_output = context.agent_engine.chat(batch_input)
        else:
            agent_output = context.agent_engine.chat(batch_input)

        async for output in agent_output:
            pass  # 完全丢弃agent的文本输出

        logger.info("🔧 Agent执行完成，开始流式处理工具结果...")

        # 检查是否有工具结果
        if hasattr(context.agent_engine, '_collected_tool_results'):
            tool_results = context.agent_engine._collected_tool_results
            logger.info(f"🔍 [DEBUG] _collected_tool_results: {tool_results}")
            logger.info(f"🔍 [DEBUG] tool_results长度: {len(tool_results) if tool_results else 'None'}")
            if tool_results:
                for i, result in enumerate(tool_results):
                    logger.info(f"Found tool result {i}: {result}")
            else:
                logger.warning("🔍 [DEBUG] _collected_tool_results存在但为空或None")
        else:
            logger.warning("🔍 [DEBUG] context.agent_engine没有_collected_tool_results属性")

        # 删除MCP独立处理逻辑，让所有情况都使用标准的process_agent_response流程
        logger.info("✅ 统一使用标准对话处理流程，无论是否有MCP工具调用")

        # 🔧 实际调用MCP结果处理流程
        if hasattr(context.agent_engine, '_collected_tool_results') and context.agent_engine._collected_tool_results:
            logger.info("🎯 检测到工具结果，启动流式处理...")

            # 🚫 防止重复处理：标记已经处理过
            if not hasattr(context.agent_engine, '_background_processed'):
                context.agent_engine._background_processed = True
                await _process_mcp_results_with_util_agent_streaming(
                    context=context,
                    user_input=user_input,
                    websocket_send=websocket_send,
                    client_uid=client_uid
                )

                # 🧹 处理完成后清理工具结果
                try:
                    if hasattr(context.agent_engine, 'clear_collected_tool_results'):
                        context.agent_engine.clear_collected_tool_results()
                        logger.debug("✅ 后台处理完成，已清理工具结果")
                except Exception as e:
                    logger.warning(f"清理工具结果时出错: {e}")
            else:
                logger.info("⚠️ MCP结果已在其他地方处理过，跳过重复处理")
        else:
            logger.warning("⚠️ No relevant tools found")

    except Exception as e:
        logger.error(f"❌ 后台工具调用处理出错: {e}")
        import traceback
        logger.error(f"❌ 错误详情: {traceback.format_exc()}")


async def _process_mcp_results_with_util_agent_streaming(
        context: ServiceContext,
        user_input: str,
        websocket_send=None,
        client_uid: Optional[str] = None,
        user_id: Optional[str] = None
):
    """使用util agent流式处理MCP结果 - 支持多用户隔离"""

    logger.info("🎯🎯🎯 开始流式处理MCP结果 🎯🎯🎯")

    # 多用户会话管理
    session_context = None
    if client_uid:
        try:
            from ..multi_user import get_safe_session_context
            session_context = get_safe_session_context(client_uid)
            if session_context:
                logger.info(f"✅ [流式处理] 获取到用户会话上下文: {session_context['composite_key']}")
                # 确保使用会话中的用户ID
                if not user_id:
                    user_id = session_context.get('user_id')
            else:
                logger.warning(f"⚠️ [流式处理] 无法获取客户端 {client_uid} 的会话上下文")
        except Exception as e:
            logger.warning(f"⚠️ [流式处理] 获取会话上下文失败: {e}")

    try:
        # 直接使用util agent进行流式处理
        from ..agent.agents.mcp_result_util_agent import MCPResultUtilAgentFactory


        # 尝试多种方式获取LLM实例
        agent_llm = None
        if hasattr(context.agent_engine, '_llm') and context.agent_engine._llm:
            agent_llm = context.agent_engine._llm
        elif hasattr(context.agent_engine, 'llm') and context.agent_engine.llm:
            agent_llm = context.agent_engine.llm
        else:
            logger.info("No agent LLM found in agent engine")

        if agent_llm:
            # 尝试获取agent的MCP工具列表
            agent_tools = None

            if hasattr(context.agent_engine, 'tools') and context.agent_engine.tools:
                agent_tools = context.agent_engine.tools
                logger.info(f"🔧 从agent.tools获取到 {len(agent_tools)} 个MCP工具")
                # 打印工具详情
                for i, tool in enumerate(agent_tools[:5], 1):  # 只打印前5个工具
                    tool_name = getattr(tool, 'name', 'Unknown')
                    tool_desc = getattr(tool, 'description', 'No description')[:50]
                if len(agent_tools) > 5:
                    logger.info(f"... and {len(agent_tools) - 5} more tools")
            else:
                logger.warning("🔧 无法从agent获取MCP工具列表")

                # 尝试从mcp_client获取工具作为备选
                if hasattr(context.agent_engine, 'mcp_client') and context.agent_engine.mcp_client:
                    try:
                        import asyncio
                        agent_tools = await asyncio.wait_for(context.agent_engine.mcp_client.get_tools(), timeout=10.0)
                        if agent_tools:
                            logger.info(f"🔧 从mcp_client获取到 {len(agent_tools)} 个工具")
                        else:
                            logger.warning("No tools found from mcp_client")
                    except Exception as e:
                        logger.warning(f"从mcp_client获取工具失败: {e}")

            # 创建Utils Agent，传递工具列表
            util_agent = MCPResultUtilAgentFactory.create_util_agent(
                llm=agent_llm,
                mcp_tools=agent_tools
            )
            logger.info("✅ Util Agent 初始化成功")
        else:
            logger.error("🔧 无法获取原agent的_llm实例")
            return

        # 检查工具结果

        if not context.agent_engine._collected_tool_results:
            logger.warning("⚠️ 没有可处理的工具结果")
            return

        # 取第一个非记忆工具的结果
        first_tool_result = None
        for tool_result in context.agent_engine._collected_tool_results:
            tool_name = tool_result.get("name", "unknown_tool")

            # 强制跳过记忆工具
            if tool_name == "search_similar_memories" or 'search_similar_memories' in tool_name.lower():
                logger.info(f"⏭️ 强制跳过记忆工具: {tool_name}")
                continue

            first_tool_result = tool_result
            break

        if not first_tool_result:
            logger.warning("⚠️ 没有找到可处理的工具结果")
            return

        tool_name = first_tool_result.get("name", "unknown_tool")
        out_obj = first_tool_result.get("result", "")

        logger.info(f"🎯 使用第一个工具结果完成整个查询: {tool_name}")

        try:
            # 简单方案：让 Utils Agent 基于用户问题和第一个工具结果智能完成整个流程
            logger.info(f"🚀 启动智能处理完成整个查询")

            final_result = await util_agent.smart_process_with_tools(
                user_query=user_input,
                initial_result=out_obj,
                context={'first_tool_name': tool_name}
            )

            logger.info(f"🎉 智能处理完成: {final_result[:100]}...")

            # 🔧 修复：使用标准TTS处理流程而不是直接发送WebSocket消息
            # 这样确保MCP启用时也使用相同的语音处理和文件删除逻辑
            if websocket_send:
                try:
                    # 构造标准的输出对象，使用conversation_utils中的标准处理流程
                    from ..agent.output_types import SentenceOutput, DisplayText, Actions
                    from .conversation_utils import process_agent_output
                    from .global_tts_manager import TTSPriority

                    # 创建标准的输出对象
                    display_text = DisplayText(
                        text=final_result,
                        name=context.character_config.character_name if hasattr(context, 'character_config') else "AI",
                        avatar=context.character_config.avatar if hasattr(context, 'character_config') else ""
                    )
                    sentence_output = SentenceOutput(
                        display_text=display_text,
                        tts_text=final_result,
                        actions=Actions()
                    )

                    # 使用标准的process_agent_output处理，确保包含正确的TTS和文件路径
                    await process_agent_output(
                        output=sentence_output,
                        character_config=context.character_config,
                        live2d_model=context.live2d_model,
                        tts_engine=context.tts_engine,
                        websocket_send=websocket_send,
                        tts_manager=global_tts_manager,  # 使用全局TTS管理器
                        translate_engine=getattr(context, 'translate_engine', None),
                        client_uid=client_uid,  # 使用正确的client_uid参数
                        tts_priority=TTSPriority.NORMAL,
                    )

                    print(f"[DEBUG-STREAMING] ==> 智能处理结果已通过标准TTS流程发送")
                    logger.info("✅ 智能处理结果已通过标准TTS流程发送")

                    # 同时发送MCP完成标记（用于前端状态管理）
                    completion_message = {
                        "type": "mcp-smart-complete",
                        "result": final_result,
                        "user_query": user_input,
                        "first_tool": tool_name,
                        "timestamp": datetime.now().isoformat()
                    }
                    await websocket_send(json.dumps(final_message))
                    logger.info("✅ 智能处理结果已发送")
                except Exception as e:
                    logger.error(f"发送最终结果失败: {e}")
                    # 备用方案：如果标准流程失败，使用原来的直接发送方式
                    try:
                        final_message = {
                            "type": "mcp-smart-complete",
                            "result": final_result,
                            "user_query": user_input,
                            "first_tool": tool_name,
                            "timestamp": datetime.now().isoformat()
                        }
                        await websocket_send(json.dumps(final_message))
                        logger.info("✅ 使用备用方案发送结果")
                    except Exception as backup_error:
                        logger.error(f"备用方案也失败: {backup_error}")

        except Exception as e:
            logger.error(f"智能处理异常: {e}")
            import traceback
            logger.error(f"详细错误: {traceback.format_exc()}")
            return


    except Exception as e:
        logger.error(f"❌ 流式MCP结果处理出错: {e}")
        import traceback
        error_trace = traceback.format_exc()
        logger.error(f"❌ 错误详情: {error_trace}")



async def _reinitialize_util_agent_helper(agent_engine):
    """运行时重新初始化 util_agent_helper"""
    logger.info("🔧 开始运行时重新初始化 util_agent_helper...")

    try:
        # 导入必要的类
        from ..agent.mcp_util_integration import AgentMCPUtilHelper

        # 最简单的方法：直接复用原agent的LLM实例
        logger.info("🔧 直接复用原agent的LLM实例...")

        if hasattr(agent_engine, 'llm') and agent_engine.llm:
            util_llm = agent_engine.llm  # 直接使用原agent的ChatOpenAI实例
            logger.info("🔧 成功复用原agent的self.llm实例")
        else:
            logger.error("🔧 无法获取原agent的llm实例，初始化失败")
            return

        # 创建 util_agent_helper
        agent_engine.util_agent_helper = AgentMCPUtilHelper(agent_engine, util_llm)

        logger.info("✅ 运行时重新初始化 util_agent_helper 成功")

    except Exception as e:
        logger.error(f"❌ 运行时重新初始化失败: {e}")
        raise e
