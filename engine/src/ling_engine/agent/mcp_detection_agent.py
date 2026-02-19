"""
LangChain-based MCP Detection Agent
智能检测用户查询是否需要MCP工具调用，替代硬编码关键词检测
"""

from typing import Dict, Any, Optional, List, Union
from pydantic import BaseModel, Field
from langchain_core.output_parsers import JsonOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.language_models.base import BaseLanguageModel
from langchain_core.messages import BaseMessage, AIMessage
from langchain_core.callbacks.manager import CallbackManagerForLLMRun
from langchain_core.outputs import LLMResult
from loguru import logger
import json


class StatelessLLMAdapter(BaseLanguageModel):
    """
    将StatelessLLMInterface适配为LangChain BaseLanguageModel
    """

    def __init__(self, stateless_llm):
        """初始化适配器

        Args:
            stateless_llm: StatelessLLMInterface实例
        """
        super().__init__()
        self.stateless_llm = stateless_llm

    def _generate(
        self,
        messages: List[BaseMessage],
        stop: Optional[List[str]] = None,
        run_manager: Optional[CallbackManagerForLLMRun] = None,
        **kwargs: Any,
    ) -> LLMResult:
        """同步生成（不推荐使用）"""
        raise NotImplementedError("Use async methods instead")

    async def _agenerate(
        self,
        messages: List[BaseMessage],
        stop: Optional[List[str]] = None,
        run_manager: Optional[CallbackManagerForLLMRun] = None,
        **kwargs: Any,
    ) -> LLMResult:
        """异步生成"""
        try:
            # 将LangChain消息转换为文本
            text_content = ""
            for message in messages:
                if hasattr(message, 'content'):
                    text_content += str(message.content) + "\n"
                else:
                    text_content += str(message) + "\n"

            # 调用StatelessLLM
            if hasattr(self.stateless_llm, 'ainvoke'):
                response = await self.stateless_llm.ainvoke(text_content.strip())
            elif hasattr(self.stateless_llm, 'invoke'):
                response = self.stateless_llm.invoke(text_content.strip())
            else:
                # 尝试直接调用
                response = await self.stateless_llm(text_content.strip())

            # 提取响应内容
            if hasattr(response, 'content'):
                response_text = response.content
            elif hasattr(response, 'text'):
                response_text = response.text
            else:
                response_text = str(response)

            # 包装为LangChain格式
            from langchain_core.outputs import Generation
            generation = Generation(text=response_text)
            return LLMResult(generations=[[generation]])

        except Exception as e:
            logger.error(f"StatelessLLM适配器调用失败: {e}")
            # 返回空结果
            from langchain_core.outputs import Generation
            generation = Generation(text=f"LLM调用失败: {str(e)}")
            return LLMResult(generations=[[generation]])

    @property
    def _llm_type(self) -> str:
        """返回LLM类型"""
        return "stateless_llm_adapter"


class MCPAnalysisResult(BaseModel):
    """MCP需求分析结果的结构化输出"""
    needs_mcp: bool = Field(description="是否需要MCP工具调用")
    confidence: float = Field(description="置信度 (0.0-1.0)", ge=0.0, le=1.0)
    reasoning: str = Field(description="分析推理过程")
    suggested_tools: List[str] = Field(default=[], description="建议使用的工具类型")
    task_type: str = Field(description="任务类型: information_query, action_request, casual_chat")
    urgency: str = Field(description="紧急程度: high, medium, low")


class MCPDetectionAgent:
    """LangChain-based智能MCP检测代理"""

    def __init__(self, llm: Union[BaseLanguageModel, Any]):
        # 自动适配StatelessLLM
        if not isinstance(llm, BaseLanguageModel):
            logger.debug("🔧 MCPDetectionAgent: 使用StatelessLLM适配器")
            self.llm = StatelessLLMAdapter(llm)
        else:
            self.llm = llm
        self.parser = JsonOutputParser(pydantic_object=MCPAnalysisResult)
        self.prompt = self._create_detection_prompt()
        self.chain = self.prompt | self.llm | self.parser

    def _create_detection_prompt(self) -> ChatPromptTemplate:
        """创建MCP检测提示词"""
        format_instructions = self.parser.get_format_instructions()

        prompt_template = """You are an intelligent task analysis assistant that needs to determine whether user queries require calling MCP (Model Context Protocol) tools.

**Currently Available Tools (11 total):**

🌤️ **Weather Tools (6)** - US Weather Information
- get_current_weather: Get current weather for a US location
- get_weather_forecast: Get daily weather forecast (up to 7 days)
- get_hourly_forecast: Get hourly weather forecast
- get_weather_alerts: Get active weather alerts for a location
- find_weather_stations: Find nearby weather observation stations
- get_local_time: Get current local time for a location

🎵 **Music Generation (1)** - AI Music Creation
- suno-generate-music-with-stream: Generate music with Suno AI, supports streaming download

🎨 **Image Generation Tools (3)** - AI Image Creation & Editing
- generate_image: Generate images using AI models (DALL-E, Gemini, etc.)
- edit_image: Edit existing images with AI
- create_image_variation: Create variations of an existing image

🔍 **Search Tool (1)** - MCP Service Discovery
- search_mcp_tools: Search and discover additional MCP tools from the marketplace

User query: "{user_input}"

Please analyze this query and provide a structured judgment result.

**Analysis Guidelines:**

1. **Weather Queries** → Use weather tools
   - Keywords: "天气", "weather", "温度", "temperature", "预报", "forecast", "警报", "alert"
   - Locations: Must be US cities (New York, Los Angeles, Chicago, etc.)
   - Confidence: 0.9+ if clear weather request

2. **Image Generation** → Use image tools
   - Keywords: "生成图片", "画一张", "创建图像", "draw", "generate image", "create picture"
   - Art styles: "油画", "卡通", "写实", "动漫", "oil painting", "cartoon", "realistic"
   - Actions: "编辑图片", "修改图片", "图片变体", "edit image", "image variation"
   - Confidence: 0.9+ for generation, 0.85+ for editing

3. **Music Generation** → Use music tool
   - Keywords: "生成音乐", "创作音乐", "generate music", "create song", "作曲", "compose"
   - Genres: "流行", "古典", "摇滚", "pop", "classical", "rock"
   - Confidence: 0.9+ for clear music requests

4. **Tool Discovery** → Use search tool
   - Keywords: "查找工具", "搜索工具", "有什么工具", "find tools", "search tools", "available tools"
   - Confidence: 0.85+

5. **Casual Chat** → No tools needed
   - Greetings, general questions, philosophical discussions
   - Confidence: 0.1-0.3

**Output Format:**
{format_instructions}

Please ensure the output is in valid JSON format."""

        return ChatPromptTemplate.from_template(prompt_template)

    async def analyze_user_input(self, user_input: str, context: Optional[Dict[str, Any]] = None) -> MCPAnalysisResult:
        """
        分析用户输入，判断是否需要MCP工具

        Args:
            user_input: 用户输入文本
            context: 可选的上下文信息

        Returns:
            MCPAnalysisResult: 结构化的分析结果
        """
        try:
            logger.info(f"🔍 [MCPDetection] 开始分析用户输入: {user_input[:100]}...")

            # 准备输入数据
            chain_input = {
                "user_input": user_input,
                "format_instructions": self.parser.get_format_instructions()
            }

            # 调用LangChain链
            result = await self.chain.ainvoke(chain_input)

            # 确保结果是MCPAnalysisResult对象
            if isinstance(result, dict):
                analysis_result = MCPAnalysisResult(**result)
            else:
                analysis_result = result

            logger.info(f"🎯 [MCPDetection] 分析完成: needs_mcp={analysis_result.needs_mcp}, confidence={analysis_result.confidence}")
            logger.debug(f"🎯 [MCPDetection] 推理过程: {analysis_result.reasoning}")

            return analysis_result

        except Exception as e:
            logger.error(f"❌ [MCPDetection] 分析失败: {e}")
            # 返回默认的保守结果
            return MCPAnalysisResult(
                needs_mcp=False,
                confidence=0.0,
                reasoning=f"分析过程出错: {str(e)}",
                suggested_tools=[],
                task_type="casual_chat",
                urgency="low"
            )

    def should_trigger_mcp(self, analysis: MCPAnalysisResult, threshold: float = 0.7) -> bool:
        """
        基于分析结果判断是否应该触发MCP

        Args:
            analysis: MCP分析结果
            threshold: 置信度阈值

        Returns:
            bool: 是否应该触发MCP
        """
        return analysis.needs_mcp and analysis.confidence >= threshold


class LangChainTaskAnalyzer:
    """LangChain-based任务完成度分析"""

    def __init__(self, llm: Union[BaseLanguageModel, Any]):
        # 自动适配StatelessLLM
        if not isinstance(llm, BaseLanguageModel):
            logger.debug("🔧 LangChainTaskAnalyzer: 使用StatelessLLM适配器")
            self.llm = StatelessLLMAdapter(llm)
        else:
            self.llm = llm
        self.completion_prompt = self._create_completion_prompt()

    def _create_completion_prompt(self) -> ChatPromptTemplate:
        """创建任务完成度分析提示词"""
        prompt_template = """You are a task completion analysis assistant. Please analyze whether the current tool execution results fully satisfy the user's query requirements.

User's original query: "{user_query}"
Executed tool: {tool_name}
Tool execution result: {tool_result}

**Analysis Rules (by query type):**

**Weather Query**: If user queries weather information, usually one call can get complete results
- Contains temperature, weather conditions, city information → is_complete: true, completion_percentage: 1.0
- Only basic information but meets query needs → completion_percentage: 0.9+

**Ticket Query**: If user queries train/ticket information
- Only station codes/station information → is_complete: false, completion_percentage: 0.2, suggested_next_tools: ["get-tickets"]
- Contains ticket prices but lacks availability information → completion_percentage: 0.7, suggested_next_tools: ["get-tickets"]
- Contains complete ticket information (prices, availability, schedule times, etc.) → completion_percentage: 1.0, suggested_next_tools: []

**Image Generation Query**: If user requests image creation or artwork
- Successfully generated image with proper response format including base64 data → is_complete: true, completion_percentage: 1.0
- Generated image but with basic metadata only → completion_percentage: 0.9
- Tool execution started but no image data returned → is_complete: false, completion_percentage: 0.3, suggested_next_tools: ["generate_image", "create_image"]
- Error in generation process → completion_percentage: 0.1, suggested_next_tools: ["generate_image"]

**Music Generation Query**: If user requests music or audio creation
- Successfully generated music with streaming URL or file → is_complete: true, completion_percentage: 1.0
- Generated music metadata but no playable content → completion_percentage: 0.4, suggested_next_tools: ["suno-generate-music"]

**General Information Query**:
- Completely answers user's question → completion_percentage: 1.0
- Partial answer but has practical value → completion_percentage: 0.6-0.9
- Irrelevant or useless information → completion_percentage: 0.1-0.3

**Key Evaluation Principles:**
1. First determine the query type, then apply corresponding rules
2. Focus on evaluating whether the user's specific needs are resolved
3. For simple and clear queries (like weather), don't over-require additional information

Please respond in JSON format:
{{
    "is_complete": boolean,
    "completion_percentage": float (0.0-1.0),
    "missing_aspects": [string],
    "suggested_next_tools": [string],
    "quality_score": float (0.0-1.0),
    "user_friendly_response": "If completion_percentage >= 1.0, please provide a user-friendly final answer directly (natural and friendly language, highlight key information, concise and clear)"
}}

**Important**:
1. is_complete must be consistent with completion_percentage:
   - completion_percentage >= 1.0 → is_complete: true
   - completion_percentage < 1.0 → is_complete: false
2. If is_complete is false, please specify the tools that might be needed in suggested_next_tools
3. Based on the user query's actual needs and current result deficiencies, intelligently recommend the most relevant tools"""

        return ChatPromptTemplate.from_template(prompt_template)

    async def analyze_task_completion(
        self,
        user_query: str,
        tool_name: str,
        tool_result: Any
    ) -> Dict[str, Any]:
        """
        分析任务完成情况

        Args:
            user_query: 用户原始查询
            tool_name: 执行的工具名称
            tool_result: 工具执行结果

        Returns:
            Dict: 任务完成度分析结果
        """
        try:
            logger.info(f"📊 [TaskAnalyzer] 分析任务完成度: {user_query[:50]}...")

            # 准备工具结果的字符串表示
            result_str = str(tool_result)[:1000]  # 限制长度避免token过多

            chain_input = {
                "user_query": user_query,
                "tool_name": tool_name,
                "tool_result": result_str
            }

            # 创建临时链
            chain = self.completion_prompt | self.llm | JsonOutputParser()
            result = await chain.ainvoke(chain_input)

            logger.info(f"✅ [TaskAnalyzer] 完成度分析结果: {result.get('completion_percentage', 0.0)}")

            return result

        except Exception as e:
            logger.error(f"❌ [TaskAnalyzer] 分析失败: {e}")
            return {
                "is_complete": True,  # 保守策略，避免无限循环
                "completion_percentage": 0.5,
                "missing_aspects": [],
                "suggested_next_tools": [],
                "quality_score": 0.5
            }


class LangChainMCPOrchestrator:
    """LangChain-based MCP工具编排器"""

    def __init__(self, llm: Union[BaseLanguageModel, Any]):
        # 自动适配StatelessLLM
        if not isinstance(llm, BaseLanguageModel):
            logger.debug("🔧 LangChainMCPOrchestrator: 使用StatelessLLM适配器")
            adapted_llm = StatelessLLMAdapter(llm)
        else:
            adapted_llm = llm

        self.detection_agent = MCPDetectionAgent(adapted_llm)
        self.task_analyzer = LangChainTaskAnalyzer(adapted_llm)
        self.max_iterations = 3  # 防止无限循环

    async def should_use_mcp(self, user_input: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        智能判断是否需要使用MCP工具

        Args:
            user_input: 用户输入
            context: 上下文信息

        Returns:
            Dict: 包含判断结果和分析信息
        """
        try:
            # 使用LangChain进行智能分析
            analysis = await self.detection_agent.analyze_user_input(user_input, context)

            # 基于置信度判断
            should_use = self.detection_agent.should_trigger_mcp(analysis, threshold=0.7)

            return {
                "should_use_mcp": should_use,
                "analysis": analysis.model_dump(),
                "confidence": analysis.confidence,
                "reasoning": analysis.reasoning,
                "suggested_tools": analysis.suggested_tools
            }

        except Exception as e:
            logger.error(f"❌ [MCPOrchestrator] MCP判断失败: {e}")
            # 返回保守结果
            return {
                "should_use_mcp": False,
                "analysis": {},
                "confidence": 0.0,
                "reasoning": f"判断过程出错: {str(e)}",
                "suggested_tools": []
            }

    async def analyze_iteration_need(
        self,
        user_query: str,
        completed_tools: List[Dict[str, Any]],
        iteration_count: int = 0
    ) -> Dict[str, Any]:
        """
        分析是否需要继续迭代使用更多工具

        Args:
            user_query: 用户原始查询
            completed_tools: 已完成的工具列表
            iteration_count: 当前迭代次数

        Returns:
            Dict: 迭代需求分析结果
        """
        try:
            # 防止无限循环
            if iteration_count >= self.max_iterations:
                logger.warning(f"⚠️ [MCPOrchestrator] 达到最大迭代次数 {self.max_iterations}")
                return {
                    "needs_more_tools": False,
                    "reason": "达到最大迭代次数限制"
                }

            if not completed_tools:
                return {
                    "needs_more_tools": False,
                    "reason": "没有已完成的工具"
                }

            # 分析最后一个工具的完成情况
            last_tool = completed_tools[-1]
            tool_name = last_tool.get("name", "unknown")
            tool_result = last_tool.get("result", "")

            # 调试：打印传入的参数
            logger.debug(f"🔍 [TaskAnalyzer DEBUG] user_query: {user_query}")
            logger.debug(f"🔍 [TaskAnalyzer DEBUG] tool_name: {tool_name}")
            logger.debug(f"🔍 [TaskAnalyzer DEBUG] tool_result: {str(tool_result)[:200]}...")

            completion_analysis = await self.task_analyzer.analyze_task_completion(
                user_query, tool_name, tool_result
            )

            # 基于完成度判断是否需要更多工具
            is_complete = completion_analysis.get("is_complete", True)
            completion_percentage = completion_analysis.get("completion_percentage", 1.0)

            needs_more = not is_complete and completion_percentage < 0.8

            # 调试：详细记录判断过程
            logger.info(f"🔍 [完成度判断] is_complete: {is_complete}, completion_percentage: {completion_percentage}, needs_more: {needs_more}")

            return {
                "needs_more_tools": needs_more,
                "completion_analysis": completion_analysis,
                "iteration_count": iteration_count,
                "reason": f"任务完成度: {completion_percentage:.1%}"
            }

        except Exception as e:
            logger.error(f"❌ [MCPOrchestrator] 迭代分析失败: {e}")
            return {
                "needs_more_tools": False,
                "reason": f"分析失败: {str(e)}"
            }


# 单例实例，供外部调用
_mcp_orchestrator: Optional[LangChainMCPOrchestrator] = None

def get_mcp_orchestrator(llm: Union[BaseLanguageModel, Any]) -> LangChainMCPOrchestrator:
    """获取MCP编排器单例实例

    Args:
        llm: LangChain BaseLanguageModel 或 StatelessLLMInterface

    Returns:
        LangChainMCPOrchestrator实例
    """
    global _mcp_orchestrator
    if _mcp_orchestrator is None:
        # 检查是否需要适配器
        if not isinstance(llm, BaseLanguageModel):
            # 假设是StatelessLLMInterface，使用适配器
            logger.info("🔧 检测到StatelessLLM，使用适配器转换为LangChain格式")
            adapted_llm = StatelessLLMAdapter(llm)
        else:
            adapted_llm = llm

        _mcp_orchestrator = LangChainMCPOrchestrator(adapted_llm)
    return _mcp_orchestrator