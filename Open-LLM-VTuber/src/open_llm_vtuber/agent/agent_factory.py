from typing import Optional, List
from loguru import logger

from .agents.agent_interface import AgentInterface
from .agents.basic_memory_agent import BasicMemoryAgent
from ..emotion_system.emotional_agent import EmotionalBasicMemoryAgent
from langchain.tools import BaseTool

class AgentFactory:
    """Factory class for creating conversation agents"""
    
    @staticmethod
    def create_agent(
        conversation_agent_choice: str,
        llm,
        system: str,
        live2d_model,
        emotion_manager=None,
        tts_preprocessor_config=None,
        tools: Optional[List[BaseTool]] = None,
        mcp_client=None,  # 添加 MCP 客户端参数
        **kwargs
    ) -> Optional[AgentInterface]:
        """Create a conversation agent
        
        Args:
            conversation_agent_choice: Type of agent to create
            llm: Language model instance
            system: System prompt
            live2d_model: Live2D model
            emotion_manager: Emotion manager (optional)
            tts_preprocessor_config: TTS preprocessor config
            tools: List of tools (if provided, will use Langchain agent)
            mcp_client: MCP client for Langchain agent
            **kwargs: Additional arguments
            
        Returns:
            AgentInterface: Created agent instance
        """
        logger.info(f"🏭 AgentFactory: 开始创建代理 {conversation_agent_choice}")
        logger.info(f"🏭 AgentFactory: MCP客户端状态 = {mcp_client is not None}")
        
        # 如果有 MCP 客户端，使用 Langchain Agent
        if mcp_client is not None:
            logger.info("🎯 AgentFactory: 检测到MCP客户端，使用LangchainAgentWrapper")
            logger.info(f"🎯 AgentFactory: MCP客户端类型: {type(mcp_client)}")
            try:
                # 强制重新加载模块以确保使用最新代码
                import importlib
                import sys
                module_name = 'src.open_llm_vtuber.agent.langchain_agent_wrapper'
                if module_name in sys.modules:
                    importlib.reload(sys.modules[module_name])
                    # logger.info(f"🔄🔄🔄 强制重新加载模块: {module_name}")
                
                from .langchain_agent_wrapper import LangchainAgentWrapper
                # logger.info(f"📦📦📦 LangchainAgentWrapper 导入成功")
                
                # 从 LLM 配置中提取需要的信息（移除硬编码默认 Key）
                llm_config = {
                    "model": "gpt-4o-mini",  # 默认模型
                    "temperature": 0.7
                }
                
                # 尝试提取 LLM 的真实配置
                try:
                    if hasattr(llm, 'model'):
                        llm_config["model"] = llm.model
                    if hasattr(llm, 'temperature'):
                        llm_config["temperature"] = llm.temperature
                    if hasattr(llm, 'client') and hasattr(llm.client, 'api_key'):
                        llm_config["api_key"] = llm.client.api_key
                    # 兼容 OpenAI 兼容端点（如 DeepSeek）：透传 base_url
                    if hasattr(llm, 'base_url'):
                        llm_config["base_url"] = getattr(llm, 'base_url', None)
                except Exception as e:
                    logger.warning(f"Could not extract LLM config: {e}, using defaults")
                
                agent = LangchainAgentWrapper(
                    mcp_client=mcp_client,
                    llm_config=llm_config,
                    system_prompt=system,
                    emotion_manager=emotion_manager,
                    **kwargs
                )
                logger.info("✅ AgentFactory: LangchainAgentWrapper创建成功")
                logger.info(f"✅ AgentFactory: 返回代理类型: {type(agent)}")
                return agent
            except Exception as e:
                logger.error(f"❌ AgentFactory: 创建LangchainAgent失败: {e}")
                logger.error(f"❌ AgentFactory: 异常详情: {str(e)}", exc_info=True)
                logger.info("⚠️ AgentFactory: 回退到基础代理（无工具）")
                mcp_client = None  # 回退到普通 agent
        
        # 使用普通的 Agent（无工具）
        logger.info(f"🔧 AgentFactory: 使用传统代理 - {conversation_agent_choice}")

        try:
            # 支持多种 agent 类型的命名方式
            if conversation_agent_choice in ["basic_memory", "basic_memory_agent"]:
                agent = BasicMemoryAgent(
                    llm=llm,
                    system=system,
                    live2d_model=live2d_model,
                    tts_preprocessor_config=tts_preprocessor_config,
                    tools=tools,  # 传递工具但不会被使用
                    **kwargs
                )
                logger.info(f"✅ AgentFactory: BasicMemoryAgent创建成功")
                return agent
            elif conversation_agent_choice in ["emotional_basic_memory", "emotional_basic_memory_agent"]:
                agent = EmotionalBasicMemoryAgent(
                    llm=llm,
                    system=system,
                    live2d_model=live2d_model,
                    emotion_manager=emotion_manager,
                    tts_preprocessor_config=tts_preprocessor_config,
                    tools=tools,  # 传递工具但不会被使用
                    **kwargs
                )
                logger.info(f"✅ AgentFactory: EmotionalBasicMemoryAgent创建成功")
                return agent
            else:
                logger.error(f"Unknown agent type: {conversation_agent_choice}")
                # 回退到默认的 basic_memory_agent
                logger.info("Falling back to basic_memory_agent")
                agent = BasicMemoryAgent(
                    llm=llm,
                    system=system,
                    live2d_model=live2d_model,
                    tts_preprocessor_config=tts_preprocessor_config,
                    tools=tools,
                    **kwargs
                )
                logger.info(f"✅ AgentFactory: BasicMemoryAgent (fallback) 创建成功")
                return agent
        except Exception as e:
            logger.error(f"❌ AgentFactory: 传统代理创建也失败: {e}", exc_info=True)
            # 最后的安全网 - 创建最基本的 BasicMemoryAgent
            try:
                logger.info("🚨 AgentFactory: 尝试创建最基本的代理（最后安全网）")
                agent = BasicMemoryAgent(
                    llm=llm,
                    system=system or "You are a helpful assistant.",
                    live2d_model=live2d_model,
                    tts_preprocessor_config=None,  # 使用默认值
                    tools=None,  # 不传递工具
                )
                logger.info(f"✅ AgentFactory: 基本代理（安全网）创建成功")
                return agent
            except Exception as final_e:
                logger.error(f"❌ AgentFactory: 所有代理创建尝试都失败: {final_e}", exc_info=True)
                logger.error("❌ AgentFactory: 返回 None - 系统将无法处理对话")
                return None
