"""Description: This file contains the implementation of the `AsyncLLM` class.
This class is responsible for handling asynchronous interaction with OpenAI API compatible
endpoints for language generation.
"""

from typing import AsyncIterator, List, Dict, Any
import time
from openai import (
    AsyncStream,
    AsyncOpenAI,
    APIError,
    APIConnectionError,
    RateLimitError,
)
from openai.types.chat import ChatCompletionChunk
from loguru import logger

from .stateless_llm_interface import StatelessLLMInterface
from ...utils.token_counter import token_stats, TokenCalculator, TokenUsage

class AsyncLLM(StatelessLLMInterface):
    def __init__(
        self,
        model: str,
        base_url: str,
        llm_api_key: str = "z",
        organization_id: str = "z",
        project_id: str = "z",
        temperature: float = 1.0,
        tier: int = None,
    ):
        """
        Initializes an instance of the `AsyncLLM` class.

        Parameters:
        - model (str): The model to be used for language generation.
        - base_url (str): The base URL for the OpenAI API.
        - organization_id (str, optional): The organization ID for the OpenAI API. Defaults to "z".
        - project_id (str, optional): The project ID for the OpenAI API. Defaults to "z".
        - llm_api_key (str, optional): The API key for the OpenAI API. Defaults to "z".
        - temperature (float, optional): What sampling temperature to use, between 0 and 2. Defaults to 1.0.
        - tier (int, optional): Priority tier for OpenAI API (1-5, higher number = higher priority). Defaults to None.
        """
        self.base_url = base_url
        self.model = model
        self.temperature = temperature
        self.tier = tier
        # 只有在非默认值时才传递 organization 和 project
        client_kwargs = {
            "base_url": base_url,
            "api_key": llm_api_key,
        }

        # 只有在有效值时才添加 organization 和 project 参数
        if organization_id and organization_id != "z":
            client_kwargs["organization"] = organization_id
        if project_id and project_id != "z":
            client_kwargs["project"] = project_id

        self.client = AsyncOpenAI(**client_kwargs)

        logger.info(
            f"Initialized AsyncLLM with the parameters: {self.base_url}, {self.model}"
        )
        
        # 显示 tier 配置信息
        if self.tier is not None:
            if self.base_url and "api.openai.com" in self.base_url:
                logger.info(f"🚀 OpenAI Priority tier configured: {self.tier} (will be used for requests)")
            else:
                logger.info(f"⚠️ Priority tier configured ({self.tier}) but not applicable for non-OpenAI endpoint: {self.base_url}")
        else:
            logger.info("ℹ️ No priority tier configured (using default priority)")

    async def chat_completion_with_tools(
        self, messages: List[Dict[str, Any]], tools: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        专门用于处理带工具的聊天完成（非流式）

        Returns:
            Dict containing:
            - content: str - 响应文本
            - tool_calls: List[Dict] - 工具调用列表（如果有）
        """
        try:
            # 构建消息列表
            messages_with_system = messages

            # 构建请求参数（非流式）
            request_params = {
                "messages": messages_with_system,
                "model": self.model,
                "stream": False,  # 不使用流式
                "temperature": self.temperature,
                "tools": tools,
                "tool_choice": "auto"
            }

            logger.info(f"Calling LLM with {len(tools)} tools (non-streaming)")

            # 发送请求
            response = await self.client.chat.completions.create(**request_params)

            # 处理响应
            choice = response.choices[0]
            result = {
                "content": choice.message.content or "",
                "tool_calls": []
            }

            # 如果有工具调用
            if hasattr(choice.message, 'tool_calls') and choice.message.tool_calls:
                for tool_call in choice.message.tool_calls:
                    result["tool_calls"].append({
                        "id": tool_call.id,
                        "type": "function",
                        "function": {
                            "name": tool_call.function.name,
                            "arguments": tool_call.function.arguments
                        }
                    })
                logger.info(f"LLM returned {len(result['tool_calls'])} tool calls")

            return result

        except Exception as e:
            logger.error(f"Error in chat_completion_with_tools: {e}")
            return {"content": f"Error: {str(e)}", "tool_calls": []}

    async def chat_completion(
        self, messages: List[Dict[str, Any]], system: str = None, tools: List[Dict[str, Any]] = None
    ) -> AsyncIterator[str]:
        """
        Generates a chat completion using the OpenAI API asynchronously.

        Parameters:
        - messages (List[Dict[str, Any]]): The list of messages to send to the API.
        - system (str, optional): System prompt to use for this completion.

        Yields:
        - str: The content of each chunk from the API response.

        Raises:
        - APIConnectionError: When the server cannot be reached
        - RateLimitError: When a 429 status code is received
        - APIError: For other API-related errors
        """
        logger.debug(f"Starting chat completion with model: {self.model}")
        logger.debug(f"Base URL: {self.base_url}")
        logger.debug(f"Temperature: {self.temperature}")
        logger.debug(f"System prompt: {system}")
        logger.debug(f"Messages: {messages}")
        
        stream = None
        full_response = ""
        input_tokens = 0
        try:
            # If system prompt is provided, add it to the messages
            messages_with_system = messages
            if system:
                messages_with_system = [
                    {"role": "system", "content": system},
                    *messages,
                ]
                logger.debug(f"Added system prompt. Total messages: {len(messages_with_system)}")

            # 计算输入token
            calculator = TokenCalculator(self.model)
            input_tokens = calculator.count_messages_tokens(messages_with_system).prompt_tokens
            logger.info(f"[Token跟踪] 对话开始 - 模型: {self.model}, 输入Token: {input_tokens}")

            logger.info("Sending request to LLM API...")
            
            # 记录请求开始时间
            request_start_time = time.time()
            
            # 构建请求参数
            request_params = {
                "messages": messages_with_system,
                "model": self.model,
                "stream": True,
                "temperature": self.temperature,
            }

            # 如果提供了 tools，添加到请求中
            if tools:
                request_params["tools"] = tools
                request_params["tool_choice"] = "auto"  # 让 LLM 自动决定是否使用工具
                logger.info(f"Added {len(tools)} tools to request")
            
            # 处理 OpenAI Priority tier
            if self.tier is not None and self.base_url and "api.openai.com" in self.base_url:
                # OpenAI service_tier 等级映射:
                # tier 5: priority (最高优先级)
                # tier 4: priority (高优先级) 
                # tier 1-3: default (默认)
                if self.tier >= 4:  
                    request_params["service_tier"] = "priority"
                    priority_level = "最高优先级" if self.tier == 5 else "高优先级"
                    logger.info(f"🚀 使用 OpenAI Priority 服务 - 等级 {self.tier} ({priority_level})")
                else:
                    request_params["service_tier"] = "default" 
                    logger.info(f"📊 使用 OpenAI 默认服务 - 等级 {self.tier}")
                    
                # 添加性能提示
                logger.info("💡 Priority 效果在高并发时期最明显，当前可能因负载较低而差异不大")
                
            stream: AsyncStream[
                ChatCompletionChunk
            ] = await self.client.chat.completions.create(**request_params)
            logger.info("Successfully connected to LLM API")
            
            first_response_logged = False
            async for chunk in stream:
                if chunk.choices[0].delta.content is None:
                    chunk.choices[0].delta.content = ""
                
                # 记录第一次收到任何chunk的时间（无论内容是否为空）
                if not first_response_logged:
                    first_response_time = time.time()
                    response_latency = (first_response_time - request_start_time) * 1000  # 转换为毫秒
                    logger.info(f"⏱️ LLM首次响应时间: {response_latency:.0f}ms (模型: {self.model})")
                    print(f"[DEBUG] ⏱️ LLM首次响应时间: {response_latency:.0f}ms (模型: {self.model})")  # 额外的调试输出
                    first_response_logged = True
                    
                full_response += chunk.choices[0].delta.content
                yield chunk.choices[0].delta.content

        except APIConnectionError as e:
            error_msg = (
                f"Error calling the chat endpoint: Connection error. Failed to connect to the LLM API.\n"
                f"Base URL: {self.base_url}\n"
                f"Model: {self.model}\n"
                f"Error details: {str(e.__cause__)}\n"
                f"Check the configurations and the reachability of the LLM backend."
            )
            logger.error(error_msg)
            logger.error(f"Full error: {e}")
            logger.error(f"Error cause: {e.__cause__}")
            yield "Error calling the chat endpoint: Connection error. Failed to connect to the LLM API. Check the configurations and the reachability of the LLM backend. See the logs for details. Troubleshooting with documentation: [https://ling-engine.github.io/docs/faq#%E9%81%87%E5%88%B0-error-calling-the-chat-endpoint-%E9%94%99%E8%AF%AF%E6%80%8E%E4%B9%88%E5%8A%9E]"

        except RateLimitError as e:
            error_msg = (
                f"Error calling the chat endpoint: Rate limit exceeded\n"
                f"Response: {e.response}\n"
                f"Base URL: {self.base_url}\n"
                f"Model: {self.model}"
            )
            logger.error(error_msg)
            logger.error(f"Full error: {e}")
            yield "Error calling the chat endpoint: Rate limit exceeded. Please try again later. See the logs for details."

        except APIError as e:
            error_msg = (
                f"LLM API Error occurred:\n"
                f"Error type: {type(e).__name__}\n"
                f"Error message: {str(e)}\n"
                f"Base URL: {self.base_url}\n"
                f"Model: {self.model}\n"
                f"Temperature: {self.temperature}\n"
                f"Number of messages: {len(messages)}"
            )
            logger.error(error_msg)
            logger.error(f"Full error: {e}")
            if hasattr(e, 'response'):
                logger.error(f"Response: {e.response}")
            yield "Error calling the chat endpoint: Error occurred while generating response. See the logs for details."

        except Exception as e:
            error_msg = (
                f"Unexpected error in chat completion:\n"
                f"Error type: {type(e).__name__}\n"
                f"Error message: {str(e)}\n"
                f"Base URL: {self.base_url}\n"
                f"Model: {self.model}"
            )
            logger.error(error_msg)
            logger.error(f"Full error: {e}")
            yield "Error calling the chat endpoint: Unexpected error occurred. See the logs for details."

        finally:
            # 计算输出token和成本
            if stream:
                completion_tokens = calculator.count_tokens(full_response) if full_response else 0
                total_tokens = input_tokens + completion_tokens
                
                usage = TokenUsage(
                    prompt_tokens=input_tokens,
                    completion_tokens=completion_tokens,
                    total_tokens=total_tokens
                )
                
                # 估算成本
                cost_info = calculator.estimate_cost(usage)
                
                # 记录token使用情况
                token_stats.add_usage(
                    model=self.model,
                    usage=usage,
                    cost=cost_info.total_cost,
                    metadata={
                        "service_type": "llm",
                        "model": self.model,
                        "messages_count": len(messages_with_system) if 'messages_with_system' in locals() else len(messages)
                    }
                )
                
                logger.info(f"[Token跟踪] 对话结束 - 模型: {self.model}, 输出Token: {completion_tokens}, " +
                            f"总Token: {total_tokens}, 成本: ${cost_info.total_cost:.6f}")
                
                logger.debug("Chat completion finished.")
                await stream.close()
                logger.debug("Stream closed.")