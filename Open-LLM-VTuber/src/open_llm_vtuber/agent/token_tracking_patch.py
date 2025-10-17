"""
Token跟踪补丁模块 - 为各种模型API调用添加token计算和成本跟踪功能
"""

import functools
import inspect
from typing import Callable, Any, Dict
from loguru import logger

from ..utils.token_counter import token_stats, TokenCalculator, TokenUsage

def patch_openai_client():
    """
    为OpenAI客户端添加token跟踪功能
    """
    try:
        import openai
        from openai import AsyncOpenAI, OpenAI
        
        # 检查OpenAI客户端版本
        openai_version = getattr(openai, "__version__", "unknown")
        logger.debug(f"检测到OpenAI客户端版本: {openai_version}")
        
        # 检查客户端结构是否兼容
        try:
            # 尝试获取原始方法，如果结构不兼容将抛出异常
            async_client = AsyncOpenAI()
            sync_client = OpenAI()
            
            # 检查是否可以访问completions属性
            if not hasattr(async_client.chat, "completions") or not hasattr(sync_client.chat, "completions"):
                logger.warning(f"OpenAI客户端结构不兼容 (版本 {openai_version})，跳过token跟踪补丁")
                return False
                
            # 保存原始方法
            original_async_create = AsyncOpenAI.chat.completions.create
            original_sync_create = OpenAI.chat.completions.create
        except Exception as e:
            logger.warning(f"检查OpenAI客户端结构时出错: {e}，跳过token跟踪补丁")
            return False
        
        # 添加token跟踪的异步方法
        @functools.wraps(original_async_create)
        async def tracked_async_create(self, *args, **kwargs):
            # 获取模型名称
            model_name = kwargs.get('model', 'unknown')
            messages = kwargs.get('messages', [])
            
            # 计算输入token
            calculator = TokenCalculator(model_name)
            input_tokens = calculator.count_messages_tokens(messages).prompt_tokens
            
            # 调用原始方法
            response = await original_async_create(self, *args, **kwargs)
            
            # 计算输出token和成本
            if hasattr(response, 'usage') and response.usage:
                prompt_tokens = getattr(response.usage, 'prompt_tokens', input_tokens)
                completion_tokens = getattr(response.usage, 'completion_tokens', 0)
                total_tokens = getattr(response.usage, 'total_tokens', prompt_tokens + completion_tokens)
            else:
                # 如果没有usage字段，使用估算值
                completion_tokens = len(response.choices[0].message.content.split()) if hasattr(response, 'choices') and response.choices else 0
                completion_tokens = int(completion_tokens * 1.3)  # 近似估计
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
                model=model_name,
                usage=usage,
                cost=cost_info.total_cost,
                metadata={
                    "service_type": "llm",
                    "model": model_name,
                    "messages_count": len(messages)
                }
            )
            
            logger.info(f"[Token跟踪] 模型: {model_name}, 输入Token: {usage.prompt_tokens}, " +
                        f"输出Token: {usage.completion_tokens}, 总成本: ${cost_info.total_cost:.6f}")
                
            return response
            
        # 添加token跟踪的同步方法
        @functools.wraps(original_sync_create)
        def tracked_sync_create(self, *args, **kwargs):
            # 获取模型名称
            model_name = kwargs.get('model', 'unknown')
            messages = kwargs.get('messages', [])
            
            # 计算输入token
            calculator = TokenCalculator(model_name)
            input_tokens = calculator.count_messages_tokens(messages).prompt_tokens
            
            # 调用原始方法
            response = original_sync_create(self, *args, **kwargs)
            
            # 计算输出token和成本
            if hasattr(response, 'usage') and response.usage:
                prompt_tokens = getattr(response.usage, 'prompt_tokens', input_tokens)
                completion_tokens = getattr(response.usage, 'completion_tokens', 0)
                total_tokens = getattr(response.usage, 'total_tokens', prompt_tokens + completion_tokens)
            else:
                # 如果没有usage字段，使用估算值
                completion_tokens = len(response.choices[0].message.content.split()) if hasattr(response, 'choices') and response.choices else 0
                completion_tokens = int(completion_tokens * 1.3)  # 近似估计
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
                model=model_name,
                usage=usage,
                cost=cost_info.total_cost,
                metadata={
                    "service_type": "llm",
                    "model": model_name,
                    "messages_count": len(messages)
                }
            )
            
            logger.info(f"[Token跟踪] 模型: {model_name}, 输入Token: {usage.prompt_tokens}, " +
                        f"输出Token: {usage.completion_tokens}, 总成本: ${cost_info.total_cost:.6f}")
                
            return response
        
        # 替换原始方法
        AsyncOpenAI.chat.completions.create = tracked_async_create
        OpenAI.chat.completions.create = tracked_sync_create
        
        logger.info("✅ 成功为OpenAI客户端添加token跟踪功能")
        return True
    except Exception as e:
        logger.error(f"❌ 为OpenAI客户端添加token跟踪功能失败: {e}")
        return False

def apply_patches():
    """
    应用所有补丁
    """
    success = patch_openai_client()
    if success:
        logger.info("✅ Token跟踪补丁应用成功")
    else:
        logger.info("⚠️ Token跟踪补丁未应用 - 这是正常的，系统将继续使用其他token跟踪方式")
    return success
