"""
MCP 结果处理工具代理 (Util Agent)

这个模块专门用于处理 MCP 工具调用返回的原始结果，将其转换为用户友好的格式。
工作流程：原 agent -> 判断需要 MCP -> 调用 MCP 工具 -> Util Agent 处理结果 -> 返回给用户

设计原则：
1. 专注于结果处理，不进行工具调用
2. 将技术性结果转换为自然语言
3. 复用现有的 LLM 调用能力
4. 排除记忆相关处理
5. 保持轻量和高效
"""

import asyncio
import logging
import re
from typing import Dict, List, Any, Optional, Union, Callable, Tuple

# 复用现有的 stateless LLM 接口
from ...agent.stateless_llm.stateless_llm_interface import StatelessLLMInterface

logger = logging.getLogger(__name__)


class MCPResultUtilAgent:
    """
    MCP 结果处理工具代理
    
    专门用于处理 MCP 工具调用的返回结果，将原始的技术性数据
    转换为用户友好的自然语言回答。
    """

    def __init__(self, llm: StatelessLLMInterface, mcp_tools_accessor: Optional[Callable] = None,
                 mcp_tools: Optional[List] = None):
        """初始化结果处理代理
        
        Args:
            llm: StatelessLLM 实例，用于处理结果
            mcp_tools_accessor: 获取MCP工具的回调函数，用于依赖链调用（向后兼容）
            mcp_tools: 直接传入的MCP工具列表（推荐方式）
        """

        self.llm = llm
        self.mcp_tools_accessor = mcp_tools_accessor  # 保留向后兼容性
        self.mcp_tools = mcp_tools or []  # 直接保存工具列表
        self.system_prompt = self._build_system_prompt()

        # 如果直接提供了工具列表，显示工具信息
        if self.mcp_tools:
            logger.info(f"Initialized with {len(self.mcp_tools)} MCP tools")

        logger.info(
            f"MCPResultUtilAgent 初始化完成，直接获取工具: {len(self.mcp_tools)}, 支持依赖链调用: {bool(mcp_tools_accessor)}")

    def _build_system_prompt(self) -> str:
        base_prompt = """You are an MCP tool result processing assistant, specialized in converting technical data returned by tools into user-friendly responses.

        Responsibilities:
        - Convert technical results into natural language
        - Extract key information and remove redundant content
        - Organize clear response structure

        Response style:
        - Natural and friendly language
        - Clear organization with line breaks and dashes to separate content
        - Highlight important information, concise and refined"""

        return base_prompt

    def _format_result_simple(self, result, user_query=""):
        """简单格式化结果，处理常见的数据格式问题"""
        try:
            result_str = str(result)

            # 🔧 处理Unicode转义序列
            if '\\u' in result_str:
                try:
                    # 解码Unicode转义序列
                    import codecs
                    result_str = codecs.decode(result_str, 'unicode_escape')
                except:
                    try:
                        # 尝试使用JSON解码
                        import json
                        result_str = json.loads(f'"{result_str}"')
                    except:
                        # 如果解码失败，尝试手动替换常见的Unicode序列
                        result_str = result_str.replace('\\u6210\\u90fd', '成都')
                        result_str = result_str.replace('\\u591a\\u4e91', '多云')
                        result_str = result_str.replace('\\u6674', '晴')
                        result_str = result_str.replace('\\u', '')

            # 处理元组格式 ('data', None)
            if result_str.startswith("('") and result_str.endswith("', None)"):
                result_str = result_str[2:-8]  # 移除 ('  和 ', None)
            elif result_str.startswith('("') and result_str.endswith('", None)'):
                result_str = result_str[2:-8]  # 移除 ("  和 ", None)

            # 通用的不完整结果提示
            if len(result_str) < 30 and not any(char in result_str for char in ['{', '°', '%', '￥']):
                return f"Initial information retrieved: {result_str}, querying for more details..."

            # 尝试解析JSON
            import json
            try:
                if result_str.startswith('{') and result_str.endswith('}'):
                    data = json.loads(result_str)
                    # 针对天气数据格式化
                    if 'temperature' in data and 'city' in data:
                        city = data.get('city', 'Unknown City')
                        temp = data.get('temperature', 'N/A')
                        desc = data.get('description', 'Unknown Weather')
                        humidity = data.get('humidity', 'N/A')
                        wind = data.get('wind_speed', 'N/A')

                        return f"""Based on the query results, current weather in {city}:
- Weather conditions: {desc}
- Temperature: {temp}°C
- Humidity: {humidity}%
- Wind speed: {wind}m/s"""
            except:
                pass

            # 如果无法解析，直接返回清理后的字符串
            if len(result_str) > 8000:
                result_str = result_str[:8000] + "..."

            return f"Based on your query, here is the information retrieved:\n{result_str}"

        except Exception as e:
            return f"数据处理出现问题：{str(result)[:2000]}"

    async def _simple_completion_analysis(self, user_query: str, result: Any) -> Dict[str, Any]:
        """简单的完成度分析，使用LLM判断是否需要更多工具"""
        try:
            result_str = str(result)[:3000]  # 限制长度

            prompt = f"""用户查询：{user_query}
当前结果：{result_str}

请判断这个结果是否完整回答了用户的查询。

返回JSON格式：
{{
    "is_complete": true/false,
    "reason": "判断原因",
    "suggested_tools": ["建议的工具名"]
}}"""

            response = await self.llm.ainvoke(prompt)
            result_text = response.content if hasattr(response, 'content') else str(response)

            # 简单解析JSON
            import json
            try:
                return json.loads(result_text)
            except:
                # 如果解析失败，返回保守结果
                return {
                    "suggested_tools": [],
                    "is_complete": True,
                    "reason": "无法解析LLM响应"
                }
        except Exception as e:
            logger.error(f"完成度分析失败: {e}")
            return {
                "suggested_tools": [],
                "is_complete": True,
                "reason": f"分析失败: {str(e)}"
            }

    async def get_available_mcp_tools(self) -> List[Any]:
        """获取可用的MCP工具列表（优先使用直接传入的工具）"""
        # 优先使用直接传入的工具列表
        if self.mcp_tools:
            return self.mcp_tools

        # 回退到工具访问器
        if not self.mcp_tools_accessor:
            logger.warning("没有工具可用于依赖链调用")
            return []

        try:
            tools = await self.mcp_tools_accessor()
            logger.info(f"通过访问器获取到 {len(tools) if tools else 0} 个MCP工具用于依赖链调用")
            return tools or []
        except Exception as e:
            logger.error(f"通过访问器获取MCP工具列表失败: {e}")
            return []

    async def call_mcp_tool_for_dependency(self, tool_name: str, tool_args: Dict[str, Any]) -> Any:
        """调用MCP工具获取依赖数据"""

        try:
            # 获取可用工具
            available_tools = await self.get_available_mcp_tools()
            if not available_tools:
                return None

            # 查找目标工具
            target_tool = None
            for tool in available_tools:
                if hasattr(tool, 'name') and tool.name == tool_name:
                    target_tool = tool
                    break

            if not target_tool:
                logger.warning(f"找不到依赖工具: {tool_name}")
                return None

            # 调用工具
            if hasattr(target_tool, '_arun'):
                try:
                    # 尝试新版本API
                    result = await target_tool._arun(**tool_args, config={})
                except TypeError:
                    # 回退到旧版本API
                    result = await target_tool._arun(**tool_args)
            elif hasattr(target_tool, 'arun'):
                try:
                    result = await target_tool.arun(**tool_args, config={})
                except TypeError:
                    result = await target_tool.arun(**tool_args)
            else:
                logger.error(f"工具 {tool_name} 不支持异步调用")
                return None

            logger.info(f"依赖链调用成功: {tool_name}")
            return result

        except Exception as e:
            logger.error(f"依赖链调用 {tool_name} 失败: {e}")
            return None

    async def call_any_mcp_tool(self, tool_name: str, tool_args: Dict[str, Any], retry_count: int = 2) -> Any:
        """直接调用任意可用的MCP工具（保底机制）
        
        Args:
            tool_name: 要调用的工具名称
            tool_args: 工具参数
            retry_count: 重试次数
            
        Returns:
            工具调用结果，失败时返回None
        """

        for attempt in range(retry_count + 1):
            try:
                if attempt > 0:
                    await asyncio.sleep(0.5 * attempt)  # 递增延迟

                # 获取可用工具
                available_tools = await self.get_available_mcp_tools()
                if not available_tools:
                    continue

                # 查找目标工具
                target_tool = None
                for tool in available_tools:
                    if hasattr(tool, 'name') and tool.name == tool_name:
                        target_tool = tool
                        break

                if not target_tool:
                    continue

                # 验证和处理参数
                processed_args = self._validate_and_process_tool_args(target_tool, tool_args)
                if processed_args is None:
                    continue

                # 调用工具，尝试多种API
                result = await self._execute_tool_with_fallback(target_tool, processed_args)

                if result is not None:
                    logger.info(f"保底机制成功调用工具: {tool_name}")
                    return result
                else:
                    continue

            except Exception as e:
                logger.warning(f"保底调用工具 {tool_name} 失败: {e}")
                if attempt == retry_count:
                    logger.error(f"保底机制最终失败: {tool_name}, 错误: {e}")

        return None

    def _validate_and_process_tool_args(self, tool, args: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """验证和处理工具参数"""
        try:
            # 基础验证：确保参数是字典类型
            if not isinstance(args, dict):
                return None

            # 获取工具名称以进行特定验证
            tool_name = getattr(tool, 'name', 'unknown')

            # 如果工具有参数定义，可以在这里进行更详细的验证
            # 这里做基础处理，确保参数符合基本要求
            processed_args = {}
            for key, value in args.items():
                if isinstance(value, str):
                    # 字符串参数，去除首尾空格
                    processed_args[key] = value.strip()
                elif value is not None:
                    # 非空值直接使用
                    processed_args[key] = value

            # 针对特定工具的参数映射修正
            processed_args = self._fix_tool_parameter_mapping(tool_name, processed_args)

            return processed_args

        except Exception as e:
            logger.warning(f"工具参数验证出错: {e}")
            return args  # 验证失败时返回原参数

    def _fix_tool_parameter_mapping(self, tool_name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """修正特定工具的参数映射问题"""
        if tool_name == 'get-station-code-of-citys':
            # 修正参数名映射：city -> citys
            if 'city' in args and 'citys' not in args:
                fixed_args = args.copy()
                fixed_args['citys'] = args['city']
                del fixed_args['city']
                return fixed_args

        # 其他工具的参数映射修正可以在这里添加

        return args

    async def _execute_tool_with_fallback(self, tool, args: Dict[str, Any]) -> Any:
        """使用多种方式尝试执行工具"""
        execution_methods = [
            # 方法1：异步执行（新版API）
            lambda: self._try_arun_with_config(tool, args),
            # 方法2：异步执行（旧版API）
            lambda: self._try_arun_without_config(tool, args),
            # 方法3：异步执行（备用方法）
            lambda: self._try_alternative_async(tool, args),
        ]

        for i, method in enumerate(execution_methods, 1):
            try:
                result = await method()
                if result is not None:
                    return result
            except Exception as e:
                continue

        return None

    async def _try_arun_with_config(self, tool, args: Dict[str, Any]) -> Any:
        """尝试使用新版API调用工具"""
        try:
            if hasattr(tool, '_arun'):
                # 尝试传入 config 参数
                return await tool._arun(**args, config={})
            elif hasattr(tool, 'arun'):
                return await tool.arun(**args, config={})
            else:
                raise AttributeError("工具不支持 _arun 或 arun 方法")
        except TypeError as e:
            if "config" in str(e):
                # 如果config参数有问题，尝试不传config
                if hasattr(tool, '_arun'):
                    return await tool._arun(**args)
                elif hasattr(tool, 'arun'):
                    return await tool.arun(**args)
            raise e

    async def _try_arun_without_config(self, tool, args: Dict[str, Any]) -> Any:
        """尝试使用旧版API调用工具"""
        if hasattr(tool, '_arun'):
            return await tool._arun(**args)
        elif hasattr(tool, 'arun'):
            return await tool.arun(**args)
        else:
            raise AttributeError("工具不支持 _arun 或 arun 方法")

    async def _try_alternative_async(self, tool, args: Dict[str, Any]) -> Any:
        """尝试其他异步执行方法"""
        # 如果工具有特殊的调用方法，可以在这里添加
        if hasattr(tool, 'ainvoke'):
            return await tool.ainvoke(args)
        elif hasattr(tool, '__call__'):
            # 尝试直接调用
            result = tool(**args)
            # 如果结果是协程，等待它
            if asyncio.iscoroutine(result):
                return await result
            return result
        else:
            raise AttributeError("找不到合适的异步执行方法")

    async def process_with_first_mcp_result(
            self,
            user_query: str,
            first_tool_name: str,
            first_result: Any,
            stream_callback=None,
            workspace_callback=None,
            previous_tool_calls: List[Dict] = None
    ) -> str:
        """基于第一次MCP结果，让模型决定要不要继续调用其他MCP工具
        
        Args:
            user_query: 用户原始问题
            first_tool_name: 第一次调用的工具名
            first_result: 第一次MCP的结果
            stream_callback: 流式输出回调
            workspace_callback: 工作区发送回调
            previous_tool_calls: Main Agent已经调用过的工具列表
            
        Returns:
            最终综合结果
        """
        if stream_callback:
            await self._stream_output(stream_callback, f"📥 收到第一次MCP结果：{first_tool_name}")

        # 处理previous_tool_calls，如果没有提供则使用空列表
        if previous_tool_calls is None:
            previous_tool_calls = []

        # 确保current tool也在列表中
        current_tool_found = any(tool.get('name') == first_tool_name for tool in previous_tool_calls)
        if not current_tool_found:
            previous_tool_calls.append({
                'name': first_tool_name,
                'status': 'completed'
            })

        # 让LLM分析是否需要更多工具
        prompt = f"""
用户问题：{user_query}

我已经调用了工具 {first_tool_name}，得到结果：
{str(first_result)[:500]}

请分析：
1. 用户的真实需求是什么？
2. 当前工具结果是否足以完全回答用户问题？
3. 如果不够，还需要什么信息？需要调用什么工具？

判断原则：
- 如果用户需要详细信息（如具体数据、实时信息等），但当前只有基础信息，则需要更多工具
- 如果当前结果已经能满足用户需求，则可以直接回答
- 根据用户查询类型智能判断是否需要进一步的工具调用

请按格式回答：
如果当前信息足够：FINAL_ANSWER: [你的最终回答]
如果需要更多工具：NEED_MORE: [说明需要什么工具和原因]
"""

        if stream_callback:
            await self._stream_output(stream_callback, "[ANALYZE] 分析是否需要更多工具...")

        decision = await self._invoke_llm(prompt)

        if "FINAL_ANSWER:" in decision:
            final_answer = decision.split("FINAL_ANSWER:", 1)[1].strip()
            if stream_callback:
                await self._stream_output(stream_callback, "[SUCCESS] 生成最终回答")

            # 不在这里发送工作区数据，交给 smart_process_with_tools 统一处理
            return final_answer

        elif "NEED_MORE:" in decision:
            # 实际调用get-tickets工具
            if stream_callback:
                await self._stream_output(stream_callback, "[TOOL] 检测到需要更多工具，准备调用...")

            # 让LLM智能分析是否需要调用更多工具以及如何处理
            analysis_prompt = f"""
请分析以下情况，决定下一步操作。

**重要**：第一个工具结果可能包含系统错误信息（如"⚠️ 系统提示：LLM服务暂时不可用"），请忽略这些错误信息，只关注实际的数据内容。

用户问题：{user_query}
第一个工具结果：{str(first_result)[:3000]}
LLM初步决定：{decision}

请执行以下分析：

1. **需求分析**：用户真正需要什么信息？
2. **结果评估**：
   - 当前工具结果是否包含系统错误信息（如"系统提示"、"LLM服务暂时不可用"等）？
   - 如果有错误信息，请从中提取有用的数据部分
   - 是否足够回答用户问题？
   - 如果是车票查询，用户需要的是具体车次、时间、价格等详细信息
3. **工具规划**：
   - 如果需要更多工具，应该调用什么工具？
   - 对于车票查询，通常需要get-tickets工具，参数包括：
     * fromStation: 出发站代码（如CDW代表成都）
     * toStation: 到达站代码（如BJP代表北京）
     * date: 日期（YYYY-MM-DD格式）
   - 请从当前结果中智能提取这些参数信息

请按以下格式返回：
```json
{{
    "needs_more_tools": true/false,
    "reason": "分析原因",
    "next_tool": "工具名称或null",
    "tool_params": {{"参数名": "参数值"}},
    "has_errors": true/false,
    "clean_data": "从结果中提取的纯净数据（去除系统提示、错误信息等）",
    "can_answer_now": true/false
}}
```

重要：请基于实际内容做出智能判断，不要依赖硬编码的规则。
"""

            analysis_result = await self._invoke_llm(analysis_prompt)

            # 解析LLM分析结果
            try:
                import json
                # 提取JSON部分
                json_match = re.search(r'```json\s*(\{.*?\})\s*```', analysis_result, re.DOTALL)
                if json_match:
                    analysis_data = json.loads(json_match.group(1))
                else:
                    # 尝试直接解析
                    analysis_data = json.loads(analysis_result)

                if analysis_data.get("needs_more_tools") and analysis_data.get("next_tool"):
                    tool_name = analysis_data.get("next_tool")
                    tool_params = analysis_data.get("tool_params", {})

                    # 直接使用LLM建议的工具和参数
                    try:
                        # 发送工具调用状态更新（追加模式，保持Main Agent的工具显示）
                        if workspace_callback:
                            tools_update = {
                                "type": "mcp-workspace-update",
                                "timestamp": __import__('datetime').datetime.now().isoformat(),
                                "user_query": user_query,
                                "status": "in_progress",
                                "tool_calls": previous_tool_calls + [{
                                    "name": tool_name,
                                    "status": "in_progress"
                                }],
                                "tool_results": [{
                                    "name": tool["name"],
                                    "status": "completed",
                                    "result": str(first_result)[:200] if tool[
                                                                             "name"] == first_tool_name else analysis_data.get(
                                        "clean_data", "已完成")
                                } for tool in previous_tool_calls if tool["status"] == "completed"],
                                "partial_answer": f"Calling {tool_name} tool..."
                            }

                            if asyncio.iscoroutinefunction(workspace_callback):
                                await workspace_callback(tools_update)
                            else:
                                workspace_callback(tools_update)

                        # 调用LLM建议的工具
                        tool_result = await self.call_any_mcp_tool(tool_name, tool_params)

                        if tool_result:
                            # 让LLM智能判断工具结果是否有错误
                            error_check_prompt = f"""
请分析以下工具调用结果，判断是否存在错误或问题：

工具名称: {tool_name}
工具参数: {tool_params}
工具结果: {str(tool_result)[:5000]}

请分析：
1. 结果是否包含错误信息？
2. 结果是否满足用户的查询需求？
3. 如果有错误，主要错误类型是什么？

请按以下格式返回：
```json
{{
    "has_error": true/false,
    "error_type": "错误类型描述或null",
    "is_useful": true/false,
    "clean_result": "提取的有用信息",
    "suggestion": "对用户的建议"
}}
```
"""

                            error_analysis = await self._invoke_llm(error_check_prompt)

                            try:
                                # 解析错误分析结果
                                error_json_match = re.search(r'```json\s*(\{.*?\})\s*```', error_analysis, re.DOTALL)
                                if error_json_match:
                                    error_data = json.loads(error_json_match.group(1))
                                else:
                                    error_data = json.loads(error_analysis)

                                if error_data.get("has_error", False):
                                    if stream_callback:
                                        await self._stream_output(stream_callback,
                                                                  f"[ERROR] {error_data.get('error_type')}")

                                    # 让LLM生成友好的错误回答
                                    error_response_prompt = f"""
根据以下信息，为用户生成一个友好、有帮助的错误回答：

用户查询: {user_query}
错误类型: {error_data.get('error_type')}
LLM建议: {error_data.get('suggestion')}

请生成一个专业、友好的回答，解释问题并提供解决建议。
"""
                                    error_answer = await self._invoke_llm(error_response_prompt)
                                    return error_answer.strip()

                            except Exception as e:
                                # 如果解析失败，继续正常流程
                                logger.info(f"Failed to parse tool result for error handling: {e}")

                            if stream_callback:
                                await self._stream_output(stream_callback, "[SUCCESS] 获取信息成功")

                            # 生成用户友好的最终回答（详细版本）
                            final_prompt = f"""
请基于获取的工具数据，为用户生成非常详细、专业、完整的回答：

用户查询：{user_query}
工具名称：{tool_name}
工具结果：{str(tool_result)}

请按以下格式生成详细回答：
1. 开头：确认查询的路线和日期，包含出发地和目的地的完整信息
2. 路线概述：简要介绍该路线的总体情况（距离、主要停靠站等）
3. 车次分类推荐：
   a) 高铁G字头车次（2-3个车次，优先推荐最快和最实惠的）
   b) 动车D字头车次（2-3个车次）  
   c) 快速T/K字头车次（1-2个车次）
4. 每个推荐车次的详细信息：
   - 车次号（如：G308）
   - 出发时间 → 到达时间（如：08:15 → 16:23）
   - 行程时长（如：8小时8分钟）
   - 所有可用座位类型和对应价格（商务座、一等座、二等座等）
   - **余票情况（必须具体显示剩余张数，如：还剩38张、充足、紧张等具体状态）**
   - 列车设施特点（如：WiFi、餐车、充电插座等）
5. 价格对比表：不同车次的票价比较
6. 出行建议：
   - 最快车次推荐
   - 最经济车次推荐  
   - 最舒适车次推荐
   - 购票时机建议
7. 注意事项：
   - 检票时间和地点
   - 行李限制
   - 改签退票政策

**重要要求：**
- 回答长度要求：至少800-1200字，内容要非常详细丰富
- 余票状态必须明确显示具体数量或状态，如"还剩XX张"、"票源充足"、"仅剩少量"等
- 提供完整的价格信息，包括所有座位类型
- 重点突出时间、价格和余票状态的对比
- 语言要专业友好，结构清晰
- 尽可能多展示可用车次，给用户更多选择
- 每个段落都要有具体的数据支撑
- 提供实用的出行建议和购票指导
"""
                            final_answer = await self._invoke_llm(final_prompt, max_tokens=5000)  # 增加token限制到5000
                            
                            # 清理格式：移除markdown粗体标记
                            final_answer = final_answer.replace("**", "")
                            
                            # 发送完成状态的workspace更新（包含所有3个工具）
                            if workspace_callback:
                                completed_update = {
                                    "type": "mcp-workspace-update",
                                    "timestamp": __import__('datetime').datetime.now().isoformat(),
                                    "user_query": user_query,
                                    "status": "completed",
                                    "tool_calls": previous_tool_calls + [{
                                        "name": tool_name,
                                        "status": "completed"
                                    }],
                                    "tool_results": [{
                                        "name": tool["name"],
                                        "status": "completed",
                                        "result": (
                                            str(first_result)[:200] if tool["name"] == first_tool_name
                                            else analysis_data.get("clean_data", "已完成")
                                        )
                                    } for tool in previous_tool_calls if tool["status"] == "completed"] + [{
                                        "name": tool_name,
                                        "status": "completed",
                                        "result": str(tool_result)[:2000]
                                    }],
                                    "final_answer": final_answer
                                }

                                if asyncio.iscoroutinefunction(workspace_callback):
                                    await workspace_callback(completed_update)
                                else:
                                    workspace_callback(completed_update)

                            return final_answer
                        else:
                            if stream_callback:
                                await self._stream_output(stream_callback, f"[ERROR] {tool_name}工具调用失败")

                            # 让LLM生成失败情况的回答
                            fallback_prompt = f"""
用户查询：{user_query}
第一个工具结果：{str(first_result)[:500]}
第二个工具（{tool_name}）调用失败

请基于现有信息为用户生成有用的回答，并说明后续工具调用失败的原因。
"""
                            return await self._invoke_llm(fallback_prompt)

                    except Exception as e:
                        if stream_callback:
                            await self._stream_output(stream_callback, f"[ERROR] 工具调用异常: {e}")

                        # 异常情况的处理
                        return f"很抱歉，在处理您的查询时遇到了技术问题。获取到的信息：{str(first_result)[:300]}..."

                else:
                    # 不需要更多工具，直接生成回答

                    final_prompt = f"""
请基于以下信息为用户生成完整的回答：

用户查询：{user_query}
工具结果：{str(first_result)}

请生成一个专业、详细的回答。
"""
                    return await self._invoke_llm(final_prompt, max_tokens=5000)

            except Exception as e:
                # 分析失败时的备用处理
                return f"根据您的查询，我获取了以下信息：{str(first_result)[:500]}..."

        else:
            # 默认处理
            if stream_callback:
                await self._stream_output(stream_callback, "[SUCCESS] 使用现有结果生成回答")
            return f"根据您的查询「{user_query}」，通过工具{first_tool_name}获得：{str(first_result)}"

    def process_with_first_mcp_result_truly_async(
            self,
            user_query: str,
            first_tool_name: str,
            first_result: Any,
            stream_callback=None,
            completion_callback=None,
            workspace_callback=None,
            previous_tool_calls: List[Dict] = None
    ) -> asyncio.Task:
        """真正异步处理第一次MCP结果 - 立即返回任务
        
        Args:
            user_query: 用户问题
            first_tool_name: 第一次工具名
            first_result: 第一次结果
            stream_callback: 流式回调
            completion_callback: 完成回调
            workspace_callback: 工作区发送回调
            
        Returns:
            asyncio.Task: 异步任务
        """

        async def process_task():
            try:
                result = await self.process_with_first_mcp_result(
                    user_query, first_tool_name, first_result, stream_callback, workspace_callback, previous_tool_calls
                )

                if completion_callback:
                    if asyncio.iscoroutinefunction(completion_callback):
                        await completion_callback(result, first_tool_name, user_query)
                    else:
                        completion_callback(result, first_tool_name, user_query)

                return result

            except Exception as e:
                logger.error(f"异步处理第一次MCP结果失败: {e}")
                if stream_callback:
                    await self._stream_output(stream_callback, f"[ERROR] 处理失败: {e}")
                return f"处理您的查询时遇到问题：{str(e)}"

        # 添加异常处理包装
        async def _safe_process_task():
            try:
                return await process_task()
            except Exception as e:
                logger.error(f"第一次MCP结果处理后台任务异常: {e}")
                return f"后台处理异常: {e}"

        return asyncio.create_task(_safe_process_task())

    # 已删除：后续工具分析已集成到smart_process_with_tools的一次LLM调用中

    # 已删除：_execute_tool_chain 和 _adjust_tool_args_based_on_previous_results 方法已集成到主流程中

    # 已删除：_generate_comprehensive_result、_format_result_for_context 和 _simple_combine_results 方法已集成到主流程中

    async def _stream_output(self, callback, message: str):
        """流式输出到回调"""
        try:
            if asyncio.iscoroutinefunction(callback):
                await callback(message)
            else:
                callback(message)
        except Exception as e:
            logger.error(f"流式输出失败: {e}")

    async def _invoke_llm(self, prompt: str, max_tokens: int = 5000) -> str:
        """统一的LLM调用方法，兼容不同的LLM接口"""

        # 检查LLM类型并使用相应的调用方法
        if hasattr(self.llm, 'ainvoke'):
            # LangChain式接口，尝试传递max_tokens
            from langchain_core.messages import SystemMessage, HumanMessage
            messages = [
                SystemMessage(content=self.system_prompt),
                HumanMessage(content=prompt)
            ]

            # 尝试设置max_tokens（如果LLM支持的话）
            try:
                if hasattr(self.llm, 'max_tokens') or hasattr(self.llm, 'model_kwargs'):
                    # 临时修改max_tokens设置
                    original_max_tokens = getattr(self.llm, 'max_tokens', None)
                    if hasattr(self.llm, 'max_tokens'):
                        self.llm.max_tokens = max_tokens
                    elif hasattr(self.llm, 'model_kwargs'):
                        self.llm.model_kwargs = self.llm.model_kwargs or {}
                        self.llm.model_kwargs['max_tokens'] = max_tokens

                    response = await self.llm.ainvoke(messages)

                    # 恢复原设置
                    if hasattr(self.llm, 'max_tokens') and original_max_tokens is not None:
                        self.llm.max_tokens = original_max_tokens

                    return response.content.strip()
                else:
                    response = await self.llm.ainvoke(messages)
                    return response.content.strip()
            except Exception as e:
                response = await self.llm.ainvoke(messages)
                return response.content.strip()

        elif hasattr(self.llm, 'chat_completion'):
            # StatelessLLM接口
            messages = [{"role": "user", "content": prompt}]
            result_chunks = []
            async for chunk in self.llm.chat_completion(messages, system=self.system_prompt):
                result_chunks.append(chunk)
            return "".join(result_chunks).strip()

        else:
            raise ValueError(f"不支持的LLM类型: {type(self.llm)}")

    # 已删除：_extract_date_from_query 和 _extract_cities_from_query 方法未被使用

    async def smart_process_with_tools(self, user_query: str, initial_result: Any = None,
                                       context: Dict[str, Any] = None, workspace_callback=None,
                                       initial_tool_name: str = None) -> str:
        """智能处理：复用Main Agent的工具进行分析和调用
        
        Args:
            user_query: 用户查询
            initial_result: 初始结果（可选）
            context: 上下文信息
            workspace_callback: 工作区发送回调
            
        Returns:
            处理后的结果
        """

        try:
            # 使用传入的工具列表
            available_tools = self.mcp_tools or []

            # 过滤掉记忆相关工具
            filtered_tools = []
            for tool in available_tools:
                tool_name = getattr(tool, 'name', '').lower()
                if 'memory' not in tool_name and 'search_similar' not in tool_name:
                    filtered_tools.append(tool)
                else:
                    logger.info(f"Filtering out memory/search tool: {tool_name}")

            # 创建工具映射以便查找
            tool_map = {}
            for tool in filtered_tools:
                tool_name = getattr(tool, 'name', '')
                tool_map[tool_name] = tool

            # 🚀 使用LangChain编排器进行智能迭代控制
            from ..mcp_detection_agent import get_mcp_orchestrator

            orchestrator = get_mcp_orchestrator(self.llm)

            # 记录已完成的工具调用
            completed_tools = []
            if initial_result:
                completed_tools.append({
                    "name": initial_tool_name or "initial_tool",
                    "result": initial_result
                })

            iteration_count = 0
            current_result = initial_result
            actual_tool_name = initial_tool_name  # 默认使用初始工具名称

            # 🔄 智能迭代循环，由LangChain控制
            while iteration_count < 3:  # 安全上限，实际由LangChain智能控制
                logger.info(f"🔄 [智能迭代] 第 {iteration_count + 1} 轮分析")

                # 使用LangChain分析是否需要继续迭代
                iteration_analysis = await orchestrator.analyze_iteration_need(
                    user_query=user_query,
                    completed_tools=completed_tools,
                    iteration_count=iteration_count
                )

                needs_more = iteration_analysis.get("needs_more_tools", False)
                reason = iteration_analysis.get("reason", "")

                logger.info(f"🧠 [迭代分析] 需要更多工具: {needs_more}, 原因: {reason}")

                if not needs_more:
                    # LangChain判断任务已完成
                    logger.info("✅ [智能迭代] LangChain判断任务已完成")
                    break

                # 使用传统的任务完成分析获取工具建议
                # 直接使用现有的完成度分析结果
                completion_data = iteration_analysis.get("completion_analysis", {})
                suggested_tools = completion_data.get("suggested_next_tools", [])

                # 🔍 Debug: 打印完成度分析的详细信息
                logger.info(f"🔍 [DEBUG] completion_data: {completion_data}")
                logger.info(f"🔍 [DEBUG] suggested_tools from completion: {suggested_tools}")

                # 🔧 Fix: 如果suggested_tools为空但needs_more=True，让LLM分析应该使用什么工具
                if not suggested_tools and needs_more:
                    tool_suggestion_prompt = f"""
分析用户查询并建议下一个工具调用：

用户查询: {user_query}
当前已执行工具: {[tool["name"] for tool in completed_tools]}
已获得结果: {str(current_result)[:300]}

请基于用户的真实需求分析，建议下一个最合适的工具：
- 对于票务查询，如果只有车站信息，通常需要get-tickets工具获取具体票务信息
- 对于天气查询，如果信息不完整，可能需要天气相关工具
- 根据查询内容和缺失信息智能判断

请只返回工具名称，多个工具用逗号分隔，如: get-tickets
还有要根据用户的语言就行对应的返回，例如英语就返回英语，中文返回中文
"""
                    tool_suggestion = await self._invoke_llm(tool_suggestion_prompt)
                    if tool_suggestion.strip():
                        suggested_tools = [t.strip() for t in tool_suggestion.strip().split(',')]
                        logger.info(f"🔧 [LLM工具建议] 基于分析推荐工具: {suggested_tools}")

                analysis_result = {
                    "suggested_tools": suggested_tools,
                    "is_complete": completion_data.get("is_complete", True)
                }

                if not analysis_result or not analysis_result.get("suggested_tools"):
                    logger.info("⚠️ [智能迭代] 没有更多工具建议，结束迭代")
                    break

                # 使用第一个建议的工具
                suggested_tools = analysis_result.get("suggested_tools", [])
                if suggested_tools:
                    actual_tool_name = suggested_tools[0]  # 更新实际工具名称

                    logger.info(f"🔧 [迭代执行] 调用工具: {actual_tool_name}")

                    # 调用建议的工具
                    additional_result = await self._continue_processing(
                        user_query,
                        current_result,
                        tool_map,
                        suggested_tools,
                        analysis_result.get("tool_params", {}),
                        workspace_callback
                    )

                    if additional_result:
                        # 更新当前结果
                        current_result = additional_result

                        # 记录这次工具调用
                        completed_tools.append({
                            "name": actual_tool_name,
                            "result": additional_result
                        })

                        logger.info(f"✅ [迭代执行] 工具 {actual_tool_name} 执行成功")
                    else:
                        logger.warning(f"⚠️ [迭代执行] 工具 {actual_tool_name} 未返回结果")
                        break

                iteration_count += 1

            # 生成最终结果
            if iteration_count > 0:
                result = current_result or "多轮处理完成"
            else:
                # 单轮处理
                # 简单处理结果格式
                result = self._format_result_simple(initial_result, user_query)

            # 发送最终的工作区更新
            await self._send_incremental_workspace_updates(
                user_query, actual_tool_name, result, workspace_callback,
                initial_result, current_result if current_result != initial_result else None
            )

            logger.info(f"🎉 [智能迭代] 完成 {iteration_count} 轮处理，最终工具: {actual_tool_name}")

            return result

        except Exception as e:
            logger.error(f"智能工具处理出错: {e}")

            # 如果是连接错误，尝试基于已有结果生成回答
            if "Connection error" in str(e) or "connection" in str(e).lower():

                # 检查捕获的工具结果
                if hasattr(self, '_captured_results') and self._captured_results:
                    for captured_result in self._captured_results:
                        result_str = str(captured_result)
                        # 简单检查结果长度来判断是否是有效数据，避免硬编码模式匹配
                        if len(result_str) > 100:  # 假设有效结果通常较长
                            # 使用AI格式化结果，而不是硬编码格式
                            return await self._format_with_ai(str(captured_result))

                if initial_result and "station_code" in str(initial_result):
                    return f"已获取到车站信息：{initial_result}。请稍后再试获取详细票务信息。"
                elif initial_result:
                    return f"查询结果：{initial_result}"

            return await self._generate_basic_response(user_query)

    async def _generate_basic_response(self, user_query: str) -> str:
        """生成基础回答"""
        return f"抱歉，我无法处理您的查询：{user_query}"

    def process_mcp_result_truly_async(
            self,
            user_query: str,
            tool_name: str,
            raw_result: Any,
            context: Dict[str, Any] = None,
            callback=None,
            workspace_callback=None
    ) -> asyncio.Task:
        """真正异步处理单个 MCP 工具调用结果 - 立即返回，不阻塞
        
        Args:
            user_query: 用户原始查询
            tool_name: 调用的工具名称
            raw_result: MCP 工具返回的原始结果
            context: 额外的上下文信息
            callback: 处理完成回调
            workspace_callback: 工作区发送回调
            
        Returns:
            asyncio.Task: 后台处理任务
        """

        async def _async_process():
            try:
                # 使用smart_process_with_tools处理
                result = await self.smart_process_with_tools(
                    user_query=user_query,
                    initial_result=raw_result,
                    context=context or {},
                    workspace_callback=workspace_callback,
                    initial_tool_name=tool_name  # 传递正确的工具名称
                )

                if callback is not None and callable(callback):
                    try:
                        # 智能判断callback需要的参数数量
                        import inspect
                        sig = inspect.signature(callback)
                        param_count = len(sig.parameters)

                        # 根据参数数量调用callback
                        if param_count == 1:
                            if asyncio.iscoroutinefunction(callback):
                                await callback(result)
                            else:
                                callback(result)
                        elif param_count == 3:
                            if asyncio.iscoroutinefunction(callback):
                                await callback(result, tool_name, user_query)
                            else:
                                callback(result, tool_name, user_query)
                        else:
                            # 默认尝试3个参数
                            if asyncio.iscoroutinefunction(callback):
                                await callback(result, tool_name, user_query)
                            else:
                                callback(result, tool_name, user_query)
                    except Exception as e:
                        # 不重新抛出异常，避免中断主流程
                        logger.warning(f"Callback execution failed: {e}")

                return result
            except Exception as e:
                logger.error(f"异步处理失败: {e}")
                return f"处理失败: {e}"

        # 创建并返回任务，添加异常处理
        async def _safe_async_process():
            try:
                return await _async_process()
            except Exception as e:
                logger.error(f"后台任务异常: {e}")
                # 不重新抛出异常，避免未处理的异常警告
                return f"后台处理异常: {e}"

        task = asyncio.create_task(_safe_async_process())
        return task

    async def _handle_general_query(self, user_query: str, initial_result: Any, tool_map: Dict[str, Any],
                                    workspace_callback=None, initial_tool_name: str = None) -> str:
        """通用查询处理 - 智能判断是否需要继续处理"""

        # 使用LLM判断初始结果是否足够回答用户问题
        # 简化逻辑：直接格式化初始结果
        return self._format_result_simple(initial_result, user_query)

    async def _analyze_task_completion(self, user_query: str, initial_result: Any) -> Dict[str, Any]:
        """使用LangChain智能分析任务是否完成，替代硬编码逻辑"""

        try:
            # 使用LangChain-based任务分析器
            from ..mcp_detection_agent import LangChainTaskAnalyzer

            # 创建任务分析器
            task_analyzer = LangChainTaskAnalyzer(self.llm)

            # 使用智能分析，无需硬编码车票查询逻辑
            completion_result = await task_analyzer.analyze_task_completion(
                user_query=user_query,
                tool_name="initial_tool",  # 这里可以传入实际工具名
                tool_result=initial_result
            )

            logger.info(f"🧠 [LangChain任务分析] 完成度: {completion_result.get('completion_percentage', 0.0)}")
            logger.debug(f"🧠 [LangChain任务分析] 详细结果: {completion_result}")

            # 获取可用工具列表用于工具建议
            available_tools = await self.get_available_mcp_tools()
            tool_names = [getattr(tool, 'name', None) or getattr(tool, '_name', None) or str(tool.__class__.__name__)
                          for tool in available_tools]

            # 转换为兼容的格式
            is_complete = completion_result.get("is_complete", True)
            completion_percentage = completion_result.get("completion_percentage", 1.0)
            suggested_tools = completion_result.get("suggested_next_tools", [])

            # 过滤建议工具，只保留可用的工具
            filtered_suggestions = []
            for suggested_tool in suggested_tools:
                # 模糊匹配可用工具
                for available_tool in tool_names:
                    if (suggested_tool.lower() in available_tool.lower() or
                            available_tool.lower() in suggested_tool.lower()):
                        filtered_suggestions.append(available_tool)
                        break

            # 如果没有找到匹配的工具，但完成度很低，提供一般性建议
            if not filtered_suggestions and completion_percentage < 0.5:
                # 基于用户查询类型提供智能工具建议
                if any(keyword in user_query.lower() for keyword in ["车票", "火车", "票"]):
                    filtered_suggestions = [tool for tool in tool_names if
                                            "ticket" in tool.lower() or "12306" in tool.lower()]
                elif any(keyword in user_query.lower() for keyword in ["天气", "weather"]):
                    filtered_suggestions = [tool for tool in tool_names if "weather" in tool.lower()]

            # 构建智能响应 - 对票务查询采用更严格的完成标准
            is_ticket_query = any(
                keyword in user_query.lower() for keyword in ["车票", "火车", "票", "ticket", "train"])

            # 票务查询需要更高的完成度标准
            completion_threshold = 0.9 if is_ticket_query else 0.8

            if is_complete and completion_percentage > completion_threshold:
                response = await self._generate_complete_response(user_query, initial_result)
            else:
                missing_aspects = completion_result.get("missing_aspects", [])

                # 特别处理票务查询：如果只有车站信息，明确表示需要查询票价和余票
                if is_ticket_query and "station" in str(initial_result).lower():
                    response = f"已获取车站信息，正在查询票价和余票情况..."
                else:
                    response = f"正在获取更多信息... 当前结果: {str(initial_result)[:200]}..."
                    if missing_aspects:
                        response += f" 还需要: {', '.join(missing_aspects[:3])}"  # 限制显示前3个

            return {
                "is_complete": is_complete,
                "user_intent": f"完成度{completion_percentage:.1%}的查询",
                "current_status": f"LangChain分析: 质量评分{completion_result.get('quality_score', 0.5):.2f}",
                "missing_info": ", ".join(completion_result.get("missing_aspects", [])),
                "suggested_tools": filtered_suggestions,
                "tool_params": {},  # LangChain会动态生成参数
                "response": response
            }

        except Exception as e:
            logger.error(f"❌ LangChain任务分析失败: {e}")
            # 降级到保守策略
            return {
                "is_complete": False,
                "user_intent": f"分析失败: {str(e)}",
                "current_status": "LangChain分析异常",
                "missing_info": "无法进行智能分析",
                "suggested_tools": [],
                "response": f"处理中，当前结果: {initial_result}"
            }

    async def _generate_complete_response(self, user_query: str, initial_result: Any) -> str:
        """生成完整的响应（当任务完成度高时）"""
        try:
            # 使用LLM生成用户友好的完整回答
            complete_prompt = f"""
基于用户查询和获取的完整信息，生成一个专业、详细的回答。

用户查询：{user_query}
完整信息：{str(initial_result)}

请生成一个用户友好的回答，包含：
1. 直接回应用户的问题
2. 关键信息的清晰展示
3. 必要的说明和建议

回答要求：
- 语言自然流畅
- 信息准确完整
- 格式清晰易读
"""
            return await self._invoke_llm(complete_prompt, max_tokens=5000)
        except Exception as e:
            logger.error(f"生成完整响应失败: {e}")
            return f"Based on your query, here is the information retrieved: {str(initial_result)[:500]}"

    async def _continue_processing(self, user_query: str, initial_result: Any, tool_map: Dict[str, Any],
                                   suggested_tools: List[str], tool_params: Dict[str, Dict] = None,
                                   workspace_callback=None) -> str:
        """实际调用建议的工具并处理结果"""

        try:
            # 如果没有建议的工具，直接返回基于现有结果的回答
            if not suggested_tools:
                formatted_result = await self._format_tool_result_for_display(initial_result)
                return f"根据您的查询，我获取到了以下信息：{formatted_result}"

            # 执行每个建议的工具
            tool_results = {}
            for tool_name in suggested_tools:
                if tool_name in tool_map:
                    try:
                        tool = tool_map[tool_name]

                        # 获取工具参数
                        params = tool_params.get(tool_name, {}) if tool_params else {}

                        # 让LLM智能处理参数，确保参数完整性
                        if not params or len(params) == 0:
                            # 智能获取准确的日期信息
                            current_date = None
                            try:
                                # 优先使用get-current-date工具获取准确日期
                                if "get-current-date" in tool_map:
                                    date_result = await self.call_any_mcp_tool("get-current-date", {})
                                    if date_result:
                                        if isinstance(date_result, tuple) and len(date_result) > 0:
                                            current_date = str(date_result[0])
                                        elif isinstance(date_result, str):
                                            current_date = date_result
                                        else:
                                            current_date = str(date_result)
                                        logger.info(f"📅 ✅ MCP工具获取当前日期成功: {current_date}")
                                    else:
                                        logger.warning("📅 ⚠️ MCP工具返回空结果")
                                else:
                                    logger.info("📅 ℹ️ get-current-date工具不可用")
                            except Exception as e:
                                logger.error(f"📅 ❌ MCP工具调用异常: {e}")

                            # 如果无法获取日期，让LLM智能处理
                            if not current_date:
                                current_date = "请使用当前日期"
                                logger.warning("📅 ⚠️ 无法获取当前日期，将由LLM智能推断")

                            param_prompt = f"""
请为工具 {tool_name} 生成完整的参数。

用户查询：{user_query}
初始结果：{str(initial_result)[:3000]}
系统提供的日期信息：{current_date}

工具参数要求：
- 如果是get-tickets或12306-ticket-query工具，需要：fromStation（出发站代码），toStation（到达站代码），date（日期）
- 请从初始结果或用户查询中提取相关信息
- 如果初始结果包含站点代码（如CDW、BJP、SHH、GZS等），请使用这些代码
- 如果系统提供了具体日期（如2025-09-15），请使用该日期
- 如果系统要求"请使用当前日期"，请根据上下文推断合理的日期
- 日期必须使用YYYY-MM-DD格式，确保不使用过期日期

智能分析规则：
1. 从初始结果中寻找车站代码映射（如 "CDW": "成都东", "BJP": "北京西"）
2. 成都相关：CDW（成都东）、CDS（成都南）、ICW（成都西）
3. 北京相关：BJP（北京西）、VNP（北京南）、BXP（北京）
4. 确保日期格式为YYYY-MM-DD，不要使用过去的日期

请只返回JSON格式的参数对象，例如：
{{"fromStation": "CDW", "toStation": "BJP", "date": "{current_date}"}}
"""
                            param_response = await self._invoke_llm(param_prompt)
                            try:
                                import json
                                import re
                                json_match = re.search(r'\{.*\}', param_response, re.DOTALL)
                                if json_match:
                                    params = json.loads(json_match.group())
                            except Exception as e:
                                params = {}

                        # 调用工具

                        if hasattr(tool, 'ainvoke'):
                            result = await tool.ainvoke(params)
                        elif hasattr(tool, 'invoke'):
                            result = tool.invoke(params)
                        else:
                            result = await tool(params)

                        tool_results[tool_name] = result

                    except Exception as e:
                        tool_results[tool_name] = f"工具执行失败: {e}"
                else:
                    tool_results[tool_name] = "工具不可用"

            # 合并所有结果
            if tool_results:

                # 构建最终回答
                all_info = f"初始信息: {initial_result}\n\n"
                for tool_name, result in tool_results.items():
                    all_info += f"{tool_name}结果: {result}\n\n"

                # 使用LLM智能生成用户友好的最终回答  
                final_prompt = f"""
请基于获取的信息，为用户生成专业完整的回答：

用户查询: {user_query}
所有获取的数据: {all_info}

请智能分析数据内容，生成合适的回答格式：
1. 根据数据类型选择合适的展示格式
2. 突出用户最关心的关键信息
3. 确保信息完整性和准确性
4. 使用清晰、专业、友好的语言

要求：
- 不要重复显示相同信息
- 根据实际数据内容决定展示格式
- 语言自然流畅
- 结构清晰易懂
"""

                response = await self.llm.ainvoke(final_prompt)
                response_text = response.content if hasattr(response, 'content') else str(response)
                if response_text and response_text.strip():
                    return response_text.strip()
                else:
                    # 如果LLM回答失败，返回格式化的结果
                    return f"根据您的查询，我为您获取了以下信息：\n\n{all_info}"
            else:
                # 没有成功的工具调用
                formatted_result = await self._format_tool_result_for_display(initial_result)
                return f"根据您的查询，我获取到了以下信息：{formatted_result}"

        except Exception as e:
            formatted_result = await self._format_tool_result_for_display(initial_result)
            return f"根据您的查询，我获取到了以下信息：{formatted_result}"

    async def _generate_user_friendly_response(self, user_query: str, results: List[str]) -> str:
        """生成用户友好的回答"""

        try:
            # 让LLM智能分析和格式化结果
            format_prompt = f"""
请分析以下工具调用结果，为用户生成友好、专业的回答：

用户查询：{user_query}
工具结果：
{chr(10).join(f"结果{i + 1}: {result}" for i, result in enumerate(results))}

请执行以下任务：
1. 分析结果内容，理解用户真正需要的信息
2. 智能识别数据类型（如车票信息、天气信息、新闻等）
3. 按照合适的格式整理信息，使其易读易懂
4. 如果是数据查询结果，突出重要信息（如价格、时间、地点等）
5. 生成专业、友好的回答

要求：
- 不要硬编码任何特定格式或关键词检查
- 根据实际内容智能判断如何格式化
- 保持回答的完整性和准确性
- 语言要自然、友好
- 如果有多个结果，合理整合信息

请直接生成最终的用户回答。
"""

            formatted_response = await self._invoke_llm(format_prompt, max_tokens=5000)

            # 清除所有 Markdown 格式标记
            formatted_response = formatted_response.replace("**", "")  # 移除粗体标记
            formatted_response = formatted_response.replace("*", "")   # 移除斜体标记
            formatted_response = formatted_response.replace("###", "")  # 移除三级标题
            formatted_response = formatted_response.replace("##", "")   # 移除二级标题
            formatted_response = formatted_response.replace("#", "")    # 移除一级标题
            # 清理多余的空行
            import re
            formatted_response = re.sub(r'\n\s*\n\s*\n+', '\n\n', formatted_response)  # 多个空行变为两个

            return formatted_response.strip()

        except Exception as e:
            # 兜底方案
            return f"查询出现问题"

    async def _format_with_ai(self, content: str) -> str:
        """使用AI智能格式化内容，无硬编码规则"""
        try:
            format_prompt = f"""Please format the following raw data returned by tools into user-friendly information display.

Raw data:
{content}

Requirements:
1. Extract the most important information
2. Use clear, readable format
3. For transportation information (train tickets, flights, etc.), focus on time, location, price, etc.
4. For weather information, focus on temperature, weather conditions, time, etc.
5. For location information, focus on address, coordinates, etc.
6. Use natural language, avoid technical terms
7. Keep it concise and highlight key information
8. IMPORTANT: Please respond in English format, using English labels and structure
9. CRITICAL: Translate ALL Chinese values to English (e.g., "晴" → "Clear", "多云" → "Partly Cloudy", "雨" → "Rain", "雪" → "Snow", etc.)

Please return the formatted result directly without any explanation:"""

            # 调用LLM进行智能格式化
            formatted_result = await self._invoke_llm(format_prompt)
            return formatted_result.strip()

        except Exception as e:
            # 简单截断，避免硬编码模式匹配
            return content[:3000] + ("..." if len(content) > 3000 else "")

    async def _format_tool_result_for_display(self, result: Any) -> str:
        """格式化工具结果用于显示 - 只返回用户需要的核心信息"""
        try:
            result_str = str(result)

            # 处理Python元组格式 ('内容', None) 或 ('内容', 其他) - 改进版本
            if result_str.startswith("('") and (", None)" in result_str or result_str.endswith("')")):
                try:
                    # 尝试解析元组
                    import ast
                    parsed = ast.literal_eval(result_str)
                    if isinstance(parsed, tuple) and len(parsed) >= 1:
                        # 取元组的第一个元素作为有效内容
                        content = str(parsed[0])
                        result_str = content
                    else:
                        logger.warning("Unable to parse tool result content")
                except Exception as e:
                    # 如果解析失败，手动提取引号内的内容
                    import re
                    # 改进正则表达式，处理更复杂的情况
                    patterns = [
                        r"^\('(.+)', None\)$",  # ('content', None)
                        r"^\('(.+)', .+\)$",  # ('content', something)
                        r"^\(\"(.+)\", None\)$",  # ("content", None)
                        r"^\(\"(.+)\", .+\)$",  # ("content", something)
                    ]

                    extracted = False
                    for pattern in patterns:
                        match = re.match(pattern, result_str, re.DOTALL)
                        if match:
                            content = match.group(1)
                            result_str = content
                            extracted = True
                            break

                    if not extracted:
                        logger.warning("Failed to extract content from tool result")

            # 🔧 处理Unicode转义序列 - 在这里也添加Unicode解码
            if '\\u' in result_str:
                try:
                    # 解码Unicode转义序列
                    import codecs
                    result_str = codecs.decode(result_str, 'unicode_escape')
                except:
                    try:
                        # 尝试使用JSON解码
                        import json
                        result_str = json.loads(f'"{result_str}"')
                    except:
                        # 如果解码失败，尝试手动替换常见的Unicode序列
                        result_str = result_str.replace('\\u6210\\u90fd', '成都')
                        result_str = result_str.replace('\\u591a\\u4e91', '多云')
                        result_str = result_str.replace('\\u6674', '晴')
                        result_str = result_str.replace('\\u5317\\u4eac', '北京')
                        result_str = result_str.replace('\\u', '')

            # 处理包含 #### 分隔符的结果
            if "####" in result_str:
                # 以 #### 为分隔符，取最后一部分作为主要内容
                parts = result_str.split("####")
                if len(parts) > 1:
                    # 取最后一个非空部分
                    for part in reversed(parts):
                        if part.strip():
                            result_str = part.strip()
                            logger.info("提取 #### 分隔符后的内容")
                            break
            else:
                logger.info("Using original result string")

            # 清除所有 Markdown 格式标记
            import re
            result_str = re.sub(r'\*\*', '', result_str)
            result_str = result_str.replace("**", "")  # 移除粗体标记
            result_str = result_str.replace("*", "")   # 移除斜体标记
            result_str = result_str.replace("###", "")  # 移除三级标题
            result_str = result_str.replace("##", "")   # 移除二级标题
            result_str = result_str.replace("#", "")    # 移除一级标题
            # 清理多余的空行
            import re
            result_str = re.sub(r'\n\s*\n\s*\n+', '\n\n', result_str)  # 多个空行变为两个
            result_str = result_str.strip()  # 去除首尾空白

            # 处理特殊的LangChain工具调用结果对象
            if hasattr(result, 'content') and hasattr(result, 'name'):
                content = getattr(result, 'content', '无内容')
                return await self._format_with_ai(content)

            # 使用AI智能格式化所有其他内容
            return await self._format_with_ai(result_str)

        except Exception as e:
            return str(result)[:3000] + ("..." if len(str(result)) > 3000 else "")

    def _extract_tool_name_from_result(self, result: Any) -> str:
        """从结果中提取工具名称"""
        try:
            # 如果是LangChain工具调用结果对象
            if hasattr(result, 'name'):
                return getattr(result, 'name', '未知工具')

            # 尝试从字符串中提取
            result_str = str(result)
            if "name=" in result_str:
                import re
                name_match = re.search(r"name='([^']+)'", result_str)
                if name_match:
                    return name_match.group(1)

            return "工具调用"

        except Exception as e:
            return "未知工具"

    async def _send_incremental_workspace_updates(self, user_query: str, actual_tool_name: str, result: str,
                                                  workspace_callback, initial_result=None,
                                                  actual_tool_result=None) -> None:
        """发送流式工作区更新 - 先发送进行中状态，再发送完成状态"""
        if not workspace_callback:
            return

        try:

            # 第一步：发送工具调用进行中状态
            in_progress_update = {
                "type": "mcp-workspace-update",
                "timestamp": __import__('datetime').datetime.now().isoformat(),
                "user_query": user_query,
                "status": "in_progress",
                "tool_calls": [{
                    "name": actual_tool_name or "工具调用",
                    "status": "in_progress"
                }],
                "tool_results": [],
                "partial_answer": f"Processing {actual_tool_name} tool results..."
            }

            if asyncio.iscoroutinefunction(workspace_callback):
                await workspace_callback(in_progress_update)
            else:
                workspace_callback(in_progress_update)

            # 等待一小段时间，让前端有时间处理第一次更新
            await asyncio.sleep(0.1)

            # 第二步：清理结果格式并发送完成状态
            clean_result = await self._format_tool_result_for_display(result)

            # 发送完成状态更新
            completed_update = {
                "type": "mcp-workspace-update",
                "timestamp": __import__('datetime').datetime.now().isoformat(),
                "user_query": user_query,  # 保持相同的用户查询，确保前端识别为同一会话
                "status": "completed",
                "tool_calls": [{
                    "name": actual_tool_name or "工具调用",
                    "status": "completed"
                }],
                "tool_results": [{
                    "name": actual_tool_name or "工具调用",
                    "status": "completed",
                    "result": str(actual_tool_result) if actual_tool_result is not None else (
                        str(initial_result) if initial_result is not None else "无结果")
                }],
                "final_answer": clean_result  # 最终AI回答
            }

            if asyncio.iscoroutinefunction(workspace_callback):
                await workspace_callback(completed_update)
            else:
                workspace_callback(completed_update)


        except Exception as e:
            import traceback

    async def process_mcp_result(
            self,
            user_query: str,
            tool_name: str,
            raw_result: Any
    ) -> str:
        """处理单个MCP工具结果，转换为用户友好的回答

        Args:
            user_query: 用户查询
            tool_name: 工具名称
            raw_result: 工具原始结果

        Returns:
            处理后的友好回答
        """
        try:
            # 使用现有的smart_process_with_tools方法
            return await self.smart_process_with_tools(
                user_query=user_query,
                initial_result=raw_result,
                initial_tool_name=tool_name
            )
        except Exception as e:
            logger.error(f"处理MCP结果失败: {e}")
            return f"处理工具{tool_name}的结果时发生错误，原始结果：{str(raw_result)[:2000]}..."

    async def batch_process_results(
            self,
            user_query: str,
            tool_results: List[Dict[str, Any]]
    ) -> str:
        """批量处理多个MCP工具结果

        Args:
            user_query: 用户查询
            tool_results: 工具结果列表，每个包含 tool_name 和 result

        Returns:
            综合处理后的回答
        """
        try:
            if not tool_results:
                return "没有获取到有效的工具结果。"

            # 如果只有一个结果，直接使用process_mcp_result
            if len(tool_results) == 1:
                result_item = tool_results[0]
                return await self.process_mcp_result(
                    user_query=user_query,
                    tool_name=result_item.get('tool_name', '未知工具'),
                    raw_result=result_item.get('result')
                )

            # 多个结果的情况，使用LLM综合处理
            results_context = []
            for i, result_item in enumerate(tool_results, 1):
                tool_name = result_item.get('tool_name', f'工具{i}')
                result = result_item.get('result', '无结果')
                results_context.append(f"{i}. {tool_name}: {str(result)[:1500]}")

            prompt = f"""
根据以下多个工具的结果，为用户生成一个综合、完整的回答：

用户查询：{user_query}

工具结果：
{chr(10).join(results_context)}

请整合这些结果，生成一个连贯、有用的回答，避免简单罗列。
"""

            return await self._invoke_llm(prompt, max_tokens=5000)

        except Exception as e:
            logger.error(f"批量处理MCP结果失败: {e}")
            # 返回简化的结果组合
            simple_result = f"根据您的查询「{user_query}」，获取到以下信息：\n"
            for i, result_item in enumerate(tool_results, 1):
                tool_name = result_item.get('tool_name', f'工具{i}')
                result = result_item.get('result', '无结果')
                simple_result += f"\n{i}. {tool_name}：{str(result)[:1000]}...\n"
            return simple_result


class MCPResultUtilAgentFactory:
    """MCP 结果处理代理工厂类"""

    _instance_cache = {}

    @classmethod
    def create_util_agent(cls, llm: StatelessLLMInterface, mcp_tools_accessor: Optional[Callable] = None,
                          mcp_tools: Optional[List] = None) -> MCPResultUtilAgent:
        """创建 MCP 结果处理代理实例"""
        return MCPResultUtilAgent(llm, mcp_tools_accessor=mcp_tools_accessor, mcp_tools=mcp_tools)

    @classmethod
    def get_cached_agent(cls, cache_key: str = "default") -> Optional[MCPResultUtilAgent]:
        """获取缓存的代理实例"""
        return cls._instance_cache.get(cache_key)

    @classmethod
    def clear_cache(cls):
        """清空缓存"""
        cls._instance_cache.clear()
        logger.info("MCPResultUtilAgent 缓存已清空")


# 便捷函数
def create_mcp_result_util_agent(
        llm: StatelessLLMInterface,
        mcp_tools_accessor: Optional[Callable] = None
) -> MCPResultUtilAgent:
    """创建 MCP 结果处理代理的便捷函数"""
    return MCPResultUtilAgentFactory.create_util_agent(llm, mcp_tools_accessor=mcp_tools_accessor)
