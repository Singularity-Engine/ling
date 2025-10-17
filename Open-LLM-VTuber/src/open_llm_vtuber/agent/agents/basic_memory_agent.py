from typing import AsyncIterator, List, Dict, Any, Callable, Literal, Optional
from loguru import logger
import json
import os
from langchain.tools import BaseTool

from .agent_interface import AgentInterface
from ..output_types import SentenceOutput, DisplayText
from ...agent.stateless_llm.stateless_llm_interface import StatelessLLMInterface
from ...chat_history_manager import get_history
from ..transformers import (
    sentence_divider,
    actions_extractor,
    tts_filter,
    display_processor,
)
from ...config_manager import TTSPreprocessorConfig
from ..input_types import BatchInput, TextSource, ImageSource


def load_prompt(prompt_name: str) -> str:
    """Load a prompt from the prompts directory"""
    try:
        # Get the path to the prompts directory
        current_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.abspath(os.path.join(current_dir, "..", "..", "..", ".."))
        prompt_path = os.path.join(project_root, "prompts", "utils", f"{prompt_name}.txt")
        
        with open(prompt_path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception as e:
        logger.warning(f"Failed to load prompt {prompt_name}: {e}")
        return ""

class BasicMemoryAgent(AgentInterface):
    """
    Agent with basic chat memory using a list to store messages.
    Implements text-based responses with sentence processing pipeline.
    """

    _system: str = """You are an error message repeater. 
        Your job is repeating this error message: 
        'No system prompt set. Please set a system prompt'. 
        Don't say anything else.
        """

    def __init__(
        self,
        llm: StatelessLLMInterface,
        system: str,
        live2d_model,
        tts_preprocessor_config: TTSPreprocessorConfig = None,
        faster_first_response: bool = True,
        segment_method: str = "pysbd",
        interrupt_method: Literal["system", "user"] = "user",
        emotion_manager=None,
        max_history_length: int = 30,
        tools: Optional[List[BaseTool]] = None,  # 更新类型注解
    ):
        """
        Initialize the agent with LLM, system prompt and configuration

        Args:
            llm: `StatelessLLMInterface` - The LLM to use
            system: `str` - System prompt
            live2d_model: `Live2dModel` - Model for expression extraction
            tts_preprocessor_config: `TTSPreprocessorConfig` - Configuration for TTS preprocessing
            faster_first_response: `bool` - Whether to enable faster first response
            segment_method: `str` - Method for sentence segmentation
            interrupt_method: `Literal["system", "user"]` -
                Methods for writing interruptions signal in chat history.
            max_history_length: `int` - Maximum number of messages to keep in history
            tools: Optional[List[BaseTool]] - List of tools available to the agent
        """
        super().__init__()
        self._conversation_history = []
        self._live2d_model = live2d_model
        self._tts_preprocessor_config = tts_preprocessor_config
        self._faster_first_response = faster_first_response
        self._segment_method = segment_method
        self.interrupt_method = interrupt_method
        self._max_history_length = max_history_length
        self._tools = tools or []  # 初始化工具列表
        # Flag to ensure a single interrupt handling per conversation
        self._interrupt_handled = False
        self._set_llm(llm)
        
        # 添加工具描述到系统提示
        if self._tools:
            tools_desc = "\n\n可用工具:\n" + "\n".join(
                f"- {tool.name}: {tool.description}" 
                for tool in self._tools
            )
            system = f"{system}{tools_desc}"
            
        self.set_system(system)
        self._messages: List[Dict[str, Any]] = []
        self._websocket = None
        self._websocket_handler = None
        self._client_uid = None
        
        # 添加工具结果收集属性，用于Util Agent处理
        self._collected_tool_results: List[Dict[str, Any]] = []
        
        # ✅ 重新启用MCP功能
        # MCP相关状态 - 防止重复请求
        self._mcp_request_sent = False
        
        # Load MCP prompts
        self._mcp_prompt = load_prompt("mcp_prompt")
        mcp_search_prompt = load_prompt("mcp_search_prompt")
        
        # 构建完整的MCP提示词
        mcp_full_prompt = ""
        if self._mcp_prompt:
            mcp_full_prompt += f"\n\n{self._mcp_prompt}"
        if mcp_search_prompt:
            mcp_full_prompt += f"\n\n{mcp_search_prompt}"
            
        if mcp_full_prompt:
            # Add MCP prompt to system prompt
            self._system = f"{self._system}{mcp_full_prompt}"
            logger.info("MCP prompts loaded and added to system prompt")

    def set_websocket(self, websocket, websocket_handler=None, client_uid=None):
        """Set the websocket connection for this agent"""
        self._websocket = websocket
        self._websocket_handler = websocket_handler
        self._client_uid = client_uid

    def _set_llm(self, llm: StatelessLLMInterface):
        """
        Set the (stateless) LLM to be used for chat completion.
        Instead of assigning directly to `self.chat`, store it to `_chat_function`
        so that the async method chat remains intact.

        Args:
            llm: StatelessLLMInterface - the LLM instance.
        """
        self._llm = llm
        self.chat = self._chat_function_factory(llm.chat_completion)

    def set_system(self, system: str):
        """
        Set the system prompt
        system: str
            the system prompt
        """
        logger.debug(f"Memory Agent: Setting system prompt: '''{system}'''")

        if self.interrupt_method == "user":
            system = f"{system}\n\nIf you received `[interrupted by user]` signal, you were interrupted."

        self._system = system

    def set_memory_from_history(self, conf_uid: str, history_uid: str) -> None:
        """Load the memory from chat history"""
        # 获取用户ID用于历史查询
        user_id = "default_user"
        try:
            from ...bff_integration.auth.user_context import UserContextManager
            context_user_id = UserContextManager.get_current_user_id()
            if context_user_id and context_user_id != "default_user":
                user_id = context_user_id
        except Exception:
            pass

        # 如果是default_user，get_history会返回空列表，不加载任何历史记录
        messages = get_history(conf_uid, history_uid, user_id)

        self._conversation_history = []
        self._conversation_history.append(
            {
                "role": "system",
                "content": self._system,
            }
        )

        for msg in messages:
            self._conversation_history.append(
                {
                    "role": "user" if msg["role"] == "human" else "assistant",
                    "content": msg["content"],
                }
            )

    def handle_interrupt(self, heard_response: str) -> None:
        """
        Handle an interruption by the user.

        Args:
            heard_response: str - The part of the AI response heard by the user before interruption
        """
        if self._interrupt_handled:
            return

        self._interrupt_handled = True

        if self._conversation_history and self._conversation_history[-1]["role"] == "assistant":
            self._conversation_history[-1]["content"] = heard_response + "..."
        else:
            if heard_response:
                self._conversation_history.append(
                    {
                        "role": "assistant",
                        "content": heard_response + "...",
                    }
                )
        self._conversation_history.append(
            {
                "role": "system" if self.interrupt_method == "system" else "user",
                "content": "[Interrupted by user]",
            }
        )

    def _to_text_prompt(self, input_data: BatchInput) -> str:
        """
        Format BatchInput into a prompt string for the LLM.

        Args:
            input_data: BatchInput - The input data containing texts and images

        Returns:
            str - Formatted message string
        """
        message_parts = []

        # Process text inputs in order
        for text_data in input_data.texts:
            if text_data.source == TextSource.INPUT:
                message_parts.append(text_data.content)
            elif text_data.source == TextSource.CLIPBOARD:
                message_parts.append(f"[Clipboard content: {text_data.content}]")

        # Process images in order
        if input_data.images:
            message_parts.append("\nImages in this message:")
            for i, img_data in enumerate(input_data.images, 1):
                source_desc = {
                    ImageSource.CAMERA: "captured from camera",
                    ImageSource.SCREEN: "screenshot",
                    ImageSource.CLIPBOARD: "from clipboard",
                    ImageSource.UPLOAD: "uploaded",
                }[img_data.source]
                message_parts.append(f"- Image {i} ({source_desc})")

        return "\n".join(message_parts)

    def _to_messages(self, input_data: BatchInput) -> List[Dict[str, Any]]:
        """
        Prepare messages list with image support.
        """
        messages = self._conversation_history.copy()

        if input_data.images:
            content = []
            text_content = self._to_text_prompt(input_data)
            content.append({"type": "text", "text": text_content})

            for img_data in input_data.images:
                content.append(
                    {
                        "type": "image_url",
                        "image_url": {"url": img_data.data, "detail": "auto"},
                    }
                )

            user_message = {"role": "user", "content": content}
        else:
            user_message = {"role": "user", "content": self._to_text_prompt(input_data)}

        messages.append(user_message)
        # 不在这里添加到历史，等待chat完成后统一处理
        return messages

    def _add_message(
        self,
        message: str | List[Dict[str, Any]],
        role: str,
        display_text: DisplayText | None = None,
    ):
        """
        Add a message to the memory

        Args:
            message: Message content (string or list of content items)
            role: Message role
            display_text: Optional display information containing name and avatar
        """
        if isinstance(message, list):
            text_content = ""
            for item in message:
                if item.get("type") == "text":
                    text_content += item["text"]
        else:
            text_content = message

        message_data = {
            "role": role,
            "content": text_content,
        }

        # Add display information if provided
        if display_text:
            if display_text.name:
                message_data["name"] = display_text.name
            if display_text.avatar:
                message_data["avatar"] = display_text.avatar

        self._conversation_history.append(message_data)

    def _chat_function_factory(self, chat_func: Callable[[List[Dict[str, Any]], str], AsyncIterator[str]]):
        """
        Create the chat pipeline with transformers and tool support

        The pipeline:
        LLM tokens -> sentence_divider -> actions_extractor -> display_processor -> tts_filter
        """
        async def chat_with_memory(input_data: BatchInput) -> AsyncIterator[str]:
            """
            Chat with memory management and tool support (真正异步版本)
            """
            messages = self._to_messages(input_data)

            # 原有的正常对话流程
            complete_response = ""
            token_stream = chat_func(messages, self._system)
            try:
                async for token in token_stream:
                    complete_response += token
                    yield token

            except Exception as e:
                logger.error(f"Error in chat stream: {e}")
                yield f"抱歉，发生了一些错误: {str(e)}"

            # 更新对话历史 - 添加用户消息（避免重复）
            user_content = ""
            if isinstance(input_data, BatchInput):
                for text_data in input_data.texts:
                    if (text_data.source == TextSource.INPUT and 
                        text_data.from_name != "MCP_SYSTEM"):
                        user_content = text_data.content
                        break
            
            # 只有当历史中最后一条消息不是这个用户消息时才添加
            if (not self._conversation_history or 
                self._conversation_history[-1]["role"] != "user" or 
                self._conversation_history[-1]["content"] != user_content):
                if user_content:
                    self._conversation_history.append({
                        "role": "user",
                        "content": user_content
                    })

            # 添加助手回复
            self._conversation_history.append({
                "role": "assistant",
                "content": complete_response
            })

            # 保持对话历史在合理长度
            while len(self._conversation_history) > self._max_history_length:
                self._conversation_history.pop(0)

        # 应用装饰器（从内到外）
        base_chat = chat_with_memory
        
        # 1. 句子分割
        base_chat = sentence_divider(
            faster_first_response=self._faster_first_response,
            segment_method=self._segment_method,
            valid_tags=["think"]
        )(base_chat)
        
        # 2. 动作提取
        base_chat = actions_extractor(self._live2d_model)(base_chat)
        
        # 3. 显示处理
        base_chat = display_processor()(base_chat)
        
        # 4. TTS 过滤
        base_chat = tts_filter(self._tts_preprocessor_config)(base_chat)

        return base_chat

    async def chat(self, input_data: BatchInput) -> AsyncIterator[SentenceOutput]:
        """Placeholder chat method that will be replaced at runtime"""
        return self.chat(input_data)

    def reset_interrupt(self) -> None:
        """
        Reset the interrupt handled flag for a new conversation.
        """
        self._interrupt_handled = False

    def start_group_conversation(self, human_name: str, ai_participants: List[str]) -> None:
        """
        Start a group conversation by adding a system message that informs the AI about
        the conversation participants.

        Args:
            human_name: str - Name of the human participant
            ai_participants: List[str] - Names of other AI participants in the conversation
        """
        other_ais = ", ".join(name for name in ai_participants)

        # Load and format the group conversation prompt
        group_prompt = load_prompt("group_conversation_prompt")
        if group_prompt:
            group_context = group_prompt.format(
                human_name=human_name,
                other_ais=other_ais
            )
            self._conversation_history.append({
                "role": "user",
                "content": group_context
            })
            logger.debug(f"Added group conversation context: '''{group_context}'''")
        else:
            logger.warning("Failed to load group conversation prompt")

    def collect_tool_result(self, tool_name: str, tool_result: Any) -> None:
        """收集工具调用结果，用于Util Agent处理
        
        Args:
            tool_name: 工具名称
            tool_result: 工具调用结果
        """
        logger.info(f"🔧 收集工具结果 - 工具: {tool_name}, 结果长度: {len(str(tool_result)) if tool_result else 0}")
        
        self._collected_tool_results.append({
            "name": tool_name,
            "result": tool_result
        })
        
        logger.info(f"📊 当前收集的工具结果数量: {len(self._collected_tool_results)}")

    def clear_collected_tool_results(self) -> None:
        """清空已收集的工具结果"""
        logger.debug(f"🧹 清空已收集的工具结果 (数量: {len(self._collected_tool_results)})")
        self._collected_tool_results = []
