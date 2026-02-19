"""
Token跟踪模块 - 用于在LLM调用中跟踪token使用情况和成本

该模块提供了一个装饰器和辅助函数，用于在LLM调用过程中自动跟踪token使用情况和成本。
"""

import functools
import asyncio
from typing import List, Dict, Any, AsyncIterator, Callable, Optional
import logging
from ...utils.token_counter import (
    TokenCalculator, 
    TokenUsage, 
    token_stats,
    ModelType
)

logger = logging.getLogger(__name__)

def get_model_type(model_name: str) -> str:
    """
    将模型名称转换为标准化的ModelType字符串
    
    Args:
        model_name: 模型名称
        
    Returns:
        标准化的模型类型字符串
    """
    # 处理OpenAI模型
    if "gpt-3.5" in model_name:
        return "gpt-3.5-turbo"
    elif "gpt-4-turbo" in model_name:
        return "gpt-4-turbo"
    elif "gpt-4o-mini" in model_name:
        return "gpt-4o-mini"
    elif "gpt-4o" in model_name:
        return "gpt-4o"
    elif "gpt-4" in model_name:
        return "gpt-4"
    
    # 处理Claude模型
    elif "claude-3-haiku" in model_name:
        return "claude-3-haiku"
    elif "claude-3-sonnet" in model_name:
        return "claude-3-sonnet"
    elif "claude-3-opus" in model_name:
        return "claude-3-opus"
    elif "claude-3.5-sonnet" in model_name:
        return "claude-3.5-sonnet"
    
    # 处理DeepSeek模型
    elif "deepseek-coder" in model_name:
        return "deepseek-coder"
    elif "deepseek" in model_name:
        return "deepseek-chat"
    
    # 处理豆包模型
    elif "doubao-pro-128k" in model_name:
        return "doubao-pro-128k"
    elif "doubao-pro-32k" in model_name:
        return "doubao-pro-32k"
    elif "doubao-pro" in model_name:
        return "doubao-pro-4k"
    elif "doubao-lite-128k" in model_name:
        return "doubao-lite-128k"
    elif "doubao-lite-32k" in model_name:
        return "doubao-lite-32k"
    elif "doubao-lite" in model_name:
        return "doubao-lite-4k"
    elif "doubao" in model_name:
        # 对于其他豆包模型，直接返回原模型名
        return model_name
    
    # 处理Qwen模型
    elif "qwen" in model_name:
        # 对于Qwen模型，使用gpt-4o-mini的计费标准作为近似
        return "gpt-4o-mini"
    
    # 默认直接返回原模型名而不是使用默认值
    return model_name


def calculate_messages_tokens(messages: List[Dict[str, Any]], model: str) -> TokenUsage:
    """
    计算消息列表的token数量
    
    Args:
        messages: 消息列表
        model: 模型名称
        
    Returns:
        TokenUsage对象
    """
    try:
        # 创建计算器 - 使用原始模型名称以便数据库定价查询
        calculator = TokenCalculator(model)
        
        # 计算token
        return calculator.count_messages_tokens(messages)
    except Exception as e:
        logger.error(f"计算消息token失败: {e}")
        # 如果计算失败，返回一个估计值
        total_chars = sum(len(msg.get("content", "")) for msg in messages)
        estimated_tokens = total_chars // 4  # 粗略估计4个字符约为1个token
        return TokenUsage(estimated_tokens, 0, estimated_tokens)


def track_tokens(func):
    """
    装饰器：跟踪LLM调用的token使用情况和成本
    
    Args:
        func: 异步函数，通常是chat_completion方法
        
    Returns:
        包装后的函数
    """
    @functools.wraps(func)
    async def wrapper(self, messages: List[Dict[str, Any]], system: str = None, *args, **kwargs):
        # 获取模型名称
        model_name = getattr(self, "model", "unknown")
        
        # 如果有系统消息，添加到消息列表中进行计算
        messages_with_system = messages
        if system:
            messages_with_system = [
                {"role": "system", "content": system},
                *messages,
            ]
        
        # 计算输入token
        input_usage = calculate_messages_tokens(messages_with_system, model_name)
        logger.info(f"[Token跟踪] 输入Token: {input_usage.prompt_tokens}")
        
        # 创建响应收集器
        response_text = ""
        
        # 调用原始方法
        async_gen = func(self, messages, system, *args, **kwargs)
        
        try:
            async for chunk in async_gen:
                response_text += chunk
                yield chunk
        finally:
            # 计算输出token - 使用原始模型名称以便数据库定价查询
            calculator = TokenCalculator(model_name)
            completion_tokens = calculator.count_tokens(response_text)
            
            # 创建完整的使用情况
            usage = TokenUsage(
                prompt_tokens=input_usage.prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=input_usage.prompt_tokens + completion_tokens
            )
            
            # 估算成本
            cost_info = calculator.estimate_cost(usage)
            
            # 记录统计信息
            token_stats.add_usage(
                model=model_name,  # 使用原始模型名称而不是model_type
                usage=usage,
                cost=cost_info.total_cost,
                metadata={
                    "service_type": "llm",
                    "model": model_name,
                    "messages_count": len(messages),
                    "response_length": len(response_text)
                }
            )
            
            # 确保即使在异步环境中也能立即看到日志
            import asyncio
            if asyncio.get_event_loop().is_running():
                await asyncio.sleep(0)
            
            logger.info(f"[Token跟踪] 模型: {model_name}, 输入Token: {usage.prompt_tokens}, " +
                        f"输出Token: {usage.completion_tokens}, 总成本: ${cost_info.total_cost:.6f}")
    
    return wrapper


def track_embedding_tokens(func):
    """
    装饰器：跟踪嵌入模型的token使用情况和成本
    
    Args:
        func: 生成嵌入向量的函数
        
    Returns:
        包装后的函数
    """
    @functools.wraps(func)
    def wrapper(content, model=None, *args, **kwargs):
        # 获取模型名称
        model_name = model or kwargs.get("model", "text-embedding-3-small")
        
        # 计算输入token
        calculator = TokenCalculator(model_name)
        input_tokens = calculator.count_tokens(content)
        
        # 调用原始方法
        result = func(content, *args, **kwargs)
        
        # 创建使用情况
        usage = TokenUsage(
            prompt_tokens=input_tokens,
            completion_tokens=0,
            total_tokens=input_tokens
        )
        
        # 估算成本
        cost_info = calculator.estimate_cost(usage)
        
        # 记录统计信息
        token_stats.add_usage(
            model=model_name,  # 使用原始模型名称
            usage=usage,
            cost=cost_info.total_cost,
            metadata={
                "service_type": "embedding",
                "model": model_name,
                "content_length": len(content)
            }
        )
        
        logger.info(f"[Token跟踪] 嵌入模型: {model_name}, Token: {input_tokens}, " +
                    f"成本: ${cost_info.total_cost:.6f}")
        
        return result
    
    return wrapper
