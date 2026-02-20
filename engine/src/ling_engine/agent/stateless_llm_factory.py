from typing import Type, Optional

from loguru import logger

from .stateless_llm.stateless_llm_interface import StatelessLLMInterface
from .stateless_llm.openai_compatible_llm import AsyncLLM as OpenAICompatibleLLM
from .stateless_llm.ollama_llm import OllamaLLM
from .stateless_llm.claude_llm import AsyncLLM as ClaudeLLM
from ..config_manager import Config


def create_llm(config: Config) -> Optional[StatelessLLMInterface]:
    """Create LLM based on configuration

    Args:
        config: Configuration object

    Returns:
        LLM instance or None if creation fails
    """
    try:
        logger.info("🔍 分析配置结构...")

        if not config:
            logger.error("❌ Config 对象为 None")
            return None

        if not config.character_config:
            logger.error("❌ character_config 为 None")
            return None

        if not config.character_config.agent_config:
            logger.error("❌ agent_config 为 None")
            return None

        agent_config = config.character_config.agent_config
        llm_provider = agent_config.conversation_agent_choice
        logger.info(f"🔍 检测到对话代理选择: {llm_provider}")

        # Get LLM config based on provider
        if llm_provider == "basic_memory_agent":
            if not agent_config.agent_settings:
                logger.error("❌ agent_settings 为 None")
                return None
            if not agent_config.agent_settings.basic_memory_agent:
                logger.error("❌ basic_memory_agent 设置为 None")
                return None

            basic_memory_settings = agent_config.agent_settings.basic_memory_agent
            llm_provider = basic_memory_settings.llm_provider
            logger.info(f"🔍 从 basic_memory_agent 设置中获取 LLM 提供商: {llm_provider}")

        if not llm_provider:
            logger.error("❌ LLM provider not specified")
            logger.error("❌ 请在配置文件中设置 LLM 提供商")
            return None

        # Get LLM config
        if not agent_config.llm_configs:
            logger.error("❌ llm_configs 为 None")
            return None

        llm_config = agent_config.llm_configs.dict().get(llm_provider, {})
        if not llm_config:
            logger.error(f"❌ 找不到 LLM 提供商的配置: {llm_provider}")
            available_configs = list(agent_config.llm_configs.dict().keys())
            logger.error(f"❌ 可用的配置: {available_configs}")
            return None

        logger.info(f"✅ 找到 LLM 配置: {llm_provider}")
        logger.debug(f"🔍 LLM 配置内容: {llm_config}")

        return LLMFactory.create_llm(
            llm_provider=llm_provider,
            **llm_config
        )
    except Exception as e:
        logger.error(f"❌ Failed to create LLM: {e}", exc_info=True)
        return None

class LLMFactory:
    @staticmethod
    def create_llm(llm_provider: str, **kwargs) -> Type[StatelessLLMInterface]:
        """Create an LLM based on the configuration.

        Args:
            llm_provider: The type of LLM to create
            **kwargs: Additional arguments
        """
        logger.info(f"🔧 正在初始化 LLM: {llm_provider}")
        logger.debug(f"🔍 LLM 参数: {kwargs}")

        try:
            if (
                llm_provider == "openai_compatible_llm"
                or llm_provider == "openai_llm"
                or llm_provider == "gemini_llm"
                or llm_provider == "zhipu_llm"
                or llm_provider == "deepseek_llm"
                or llm_provider == "groq_llm"
                or llm_provider == "mistral_llm"
            ):
                # 检查必需的参数
                required_params = ["model", "llm_api_key"]
                missing_params = [param for param in required_params if not kwargs.get(param)]
                if missing_params:
                    logger.error(f"❌ OpenAI 兼容 LLM 缺少必需参数: {missing_params}")
                    return None

                logger.info(f"✅ 创建 OpenAI 兼容 LLM: {kwargs.get('model')}")
                return OpenAICompatibleLLM(
                    model=kwargs.get("model"),
                    base_url=kwargs.get("base_url"),
                    llm_api_key=kwargs.get("llm_api_key"),
                    organization_id=kwargs.get("organization_id"),
                    project_id=kwargs.get("project_id"),
                    temperature=kwargs.get("temperature", 1.0),
                    tier=kwargs.get("tier"),
                )

            elif llm_provider == "ollama_llm":
                logger.info(f"✅ 创建 Ollama LLM: {kwargs.get('model')}")
                return OllamaLLM(
                    model=kwargs.get("model"),
                    base_url=kwargs.get("base_url"),
                    llm_api_key=kwargs.get("llm_api_key"),
                    organization_id=kwargs.get("organization_id"),
                    project_id=kwargs.get("project_id"),
                    temperature=kwargs.get("temperature"),
                    keep_alive=kwargs.get("keep_alive"),
                    unload_at_exit=kwargs.get("unload_at_exit"),
                )

            elif llm_provider == "llama_cpp_llm":
                from .stateless_llm.llama_cpp_llm import LLM as LlamaLLM

                logger.info(f"✅ 创建 Llama.cpp LLM: {kwargs.get('model_path')}")
                return LlamaLLM(
                    model_path=kwargs.get("model_path"),
                )

            elif llm_provider == "claude_llm":
                logger.info(f"✅ 创建 Claude LLM: {kwargs.get('model')}")
                return ClaudeLLM(
                    system=kwargs.get("system_prompt"),
                    base_url=kwargs.get("base_url"),
                    model=kwargs.get("model"),
                    llm_api_key=kwargs.get("llm_api_key"),
                )

            elif llm_provider == "anthropic_llm":
                # Anthropic native — 创建一个 OpenAI 兼容的薄包装
                # 实际的 ChatAnthropic 在 LangchainAgentWrapper 中创建
                logger.info(f"✅ 创建 Anthropic LLM (native): {kwargs.get('model')}")
                return OpenAICompatibleLLM(
                    model=kwargs.get("model", "claude-sonnet-4-20250514"),
                    base_url=kwargs.get("base_url", "https://api.anthropic.com/v1"),
                    llm_api_key=kwargs.get("llm_api_key"),
                    temperature=kwargs.get("temperature", 0.7),
                )

            else:
                logger.error(f"❌ 不支持的 LLM 提供商: {llm_provider}")
                supported_providers = [
                    "openai_compatible_llm", "openai_llm", "gemini_llm",
                    "zhipu_llm", "deepseek_llm", "groq_llm", "mistral_llm",
                    "ollama_llm", "llama_cpp_llm", "claude_llm", "anthropic_llm"
                ]
                logger.error(f"❌ 支持的提供商: {supported_providers}")
                return None

        except Exception as e:
            logger.error(f"❌ LLM 创建过程中发生异常: {e}", exc_info=True)
            return None

__all__ = ['LLMFactory', 'create_llm']
