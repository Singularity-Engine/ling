"""
Token计算模块 - 用于计算文本的token数量和成本估算

支持多种tokenizer和模型：
- OpenAI模型 (GPT-3.5, GPT-4等)
- Claude模型
- 本地模型 (通过transformers)
- 自定义tokenizer

主要功能：
- 文本token数量计算
- 对话token数量计算（包含系统消息、历史等）
- 成本估算（支持数据库定价）
- Token使用统计
"""

import re
from typing import Dict, List, Optional, Union, Any, Tuple
from dataclasses import dataclass
from enum import Enum
import logging

logger = logging.getLogger(__name__)

# 导入数据库定价服务
try:
    from .database_pricing import pricing_service
except ImportError:
    pricing_service = None
    logger.warning("数据库定价服务不可用，将使用默认定价")


class ModelType(Enum):
    """支持的模型类型"""
    GPT_35_TURBO = "gpt-3.5-turbo"
    GPT_4 = "gpt-4"
    GPT_4_TURBO = "gpt-4-turbo"
    GPT_4O = "gpt-4o"
    GPT_4O_MINI = "gpt-4o-mini"
    CLAUDE_3_HAIKU = "claude-3-haiku"
    CLAUDE_3_SONNET = "claude-3-sonnet"
    CLAUDE_3_OPUS = "claude-3-opus"
    CLAUDE_3_5_SONNET = "claude-3.5-sonnet"
    # 添加Doubao模型
    DOUBAO_1_5_LITE_32K = "Doubao-1.5-lite-32k"
    # 添加DeepSeek模型
    DEEPSEEK_CHAT = "deepseek-chat"
    CUSTOM = "custom"


@dataclass
class TokenUsage:
    """Token使用情况"""
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    
    def __add__(self, other: 'TokenUsage') -> 'TokenUsage':
        return TokenUsage(
            prompt_tokens=self.prompt_tokens + other.prompt_tokens,
            completion_tokens=self.completion_tokens + other.completion_tokens,
            total_tokens=self.total_tokens + other.total_tokens
        )


@dataclass
class CostInfo:
    """成本信息"""
    input_cost: float = 0.0  # 输入token成本
    output_cost: float = 0.0  # 输出token成本
    total_cost: float = 0.0  # 总成本
    currency: str = "USD"


class TokenCalculator:
    """Token计算器主类"""
    
    def __init__(self, model_type: Union[ModelType, str] = ModelType.GPT_4O_MINI):
        """
        初始化Token计算器
        
        Args:
            model_type: 模型类型
        """
        if isinstance(model_type, str):
            try:
                self.model_type = ModelType(model_type)
            except ValueError:
                # 如果不是标准ModelType，检查是否是数据库中的模型名称
                self.model_type = model_type  # 存储原始字符串
                logger.debug(f"使用自定义模型名称: {model_type}")
        else:
            self.model_type = model_type
            
        self._tokenizer = None
        self._init_tokenizer()
    
    def _init_tokenizer(self):
        """初始化tokenizer"""
        try:
            # 获取模型名称字符串
            if isinstance(self.model_type, ModelType):
                model_name = self.model_type.value
            else:
                model_name = str(self.model_type)
            
            if model_name.startswith("gpt") or "gpt" in model_name.lower():
                # 使用tiktoken for OpenAI models
                try:
                    import tiktoken
                    if "gpt-4o" in model_name.lower() or "gpt-4o-mini" in model_name.lower():
                        self._tokenizer = tiktoken.encoding_for_model("gpt-4o")
                    elif "gpt-4-turbo" in model_name.lower():
                        self._tokenizer = tiktoken.encoding_for_model("gpt-4-turbo")
                    elif "gpt-4" in model_name.lower() and "turbo" not in model_name.lower():
                        self._tokenizer = tiktoken.encoding_for_model("gpt-4")
                    else:  # GPT-3.5-turbo or other GPT models
                        self._tokenizer = tiktoken.encoding_for_model("gpt-3.5-turbo")
                    logger.info(f"✅ 已加载tiktoken tokenizer for {model_name}")
                except ImportError:
                    logger.warning("tiktoken未安装，将使用近似计算")
                    self._tokenizer = None
                    
            elif model_name.startswith("claude") or "claude" in model_name.lower():
                # Claude模型使用近似计算
                logger.info(f"✅ Claude模型 {model_name} 将使用近似token计算")
                self._tokenizer = None
                
        except Exception as e:
            logger.error(f"初始化tokenizer失败: {e}")
            self._tokenizer = None
    
    def count_tokens(self, text: str) -> int:
        """
        计算文本的token数量
        
        Args:
            text: 要计算的文本
            
        Returns:
            token数量
        """
        if not text:
            return 0
            
        try:
            if self._tokenizer:
                # 使用精确的tokenizer
                return len(self._tokenizer.encode(text))
            else:
                # 使用近似计算
                return self._approximate_token_count(text)
        except Exception as e:
            logger.error(f"计算token数量失败: {e}")
            return self._approximate_token_count(text)
    
    def _approximate_token_count(self, text: str) -> int:
        """
        近似计算token数量
        基于经验规则：英文约4个字符=1个token，中文约1.5个字符=1个token
        """
        if not text:
            return 0
            
        # 分离中文和英文字符
        chinese_chars = len(re.findall(r'[\u4e00-\u9fff]', text))
        english_chars = len(text) - chinese_chars
        
        # 近似计算
        chinese_tokens = chinese_chars / 1.5
        english_tokens = english_chars / 4
        
        return int(chinese_tokens + english_tokens)
    
    def count_messages_tokens(self, messages: List[Dict[str, str]]) -> TokenUsage:
        """
        计算消息列表的token数量
        
        Args:
            messages: 消息列表，格式如 [{"role": "user", "content": "hello"}]
            
        Returns:
            TokenUsage对象
        """
        total_tokens = 0
        
        for message in messages:
            # 计算消息内容的tokens
            content = message.get("content", "")
            role = message.get("role", "")
            
            content_tokens = self.count_tokens(content)
            role_tokens = self.count_tokens(role)
            
            # 添加消息格式的额外tokens（经验值）
            format_tokens = 4  # 每条消息大约4个额外的格式token
            
            total_tokens += content_tokens + role_tokens + format_tokens
        
        # 添加对话格式的额外tokens
        conversation_tokens = 2  # 对话开始和结束的token
        total_tokens += conversation_tokens
        
        return TokenUsage(
            prompt_tokens=total_tokens,
            completion_tokens=0,
            total_tokens=total_tokens
        )
    
    def estimate_cost(self, usage: TokenUsage) -> CostInfo:
        """
        估算成本，优先使用数据库定价，失败时使用默认定价
        
        Args:
            usage: Token使用情况
            
        Returns:
            成本信息
        """
        # 首先尝试从数据库获取定价
        db_pricing = None
        if pricing_service:
            try:
                # 获取模型名称（可能是ModelType枚举或字符串）
                model_name = self.model_type.value if isinstance(self.model_type, ModelType) else self.model_type
                db_pricing = pricing_service.get_model_pricing(model_name)
            except Exception as e:
                logger.warning(f"从数据库获取定价失败: {e}")
        
        if db_pricing:
            # 使用数据库定价
            input_price = db_pricing.get('input', 0.0)
            output_price = db_pricing.get('output', 0.0)
            unit = db_pricing.get('unit', '元/千token')
            
            # 计算成本 (价格是每1K tokens)
            input_cost = (usage.prompt_tokens / 1000) * input_price
            output_cost = (usage.completion_tokens / 1000) * output_price
            total_cost = input_cost + output_cost
            
            # 强制使用USD货币
            currency = "USD"
            
            return CostInfo(
                input_cost=input_cost,
                output_cost=output_cost,
                total_cost=total_cost,
                currency=currency
            )
        
        # 数据库定价不可用，记录警告并返回空成本
        logger.warning(f"无法获取模型 {self.model_type} 的定价信息，请检查数据库中是否存在该模型的定价数据")
        return CostInfo()
    
    def get_pricing_info(self) -> Dict[str, Any]:
        """
        获取当前模型的定价信息
        
        Returns:
            定价信息字典
        """
        # 首先尝试从数据库获取定价
        db_pricing = None
        pricing_source = "default"
        
        if pricing_service:
            try:
                # 获取模型名称（可能是ModelType枚举或字符串）
                model_name = self.model_type.value if isinstance(self.model_type, ModelType) else self.model_type
                db_pricing = pricing_service.get_model_pricing(model_name)
                if db_pricing:
                    pricing_source = "database"
            except Exception as e:
                logger.warning(f"从数据库获取定价信息失败: {e}")
        
        if db_pricing:
            return {
                "input_price": db_pricing.get('input', 0.0),
                "output_price": db_pricing.get('output', 0.0),
                "unit": db_pricing.get('unit', '元/千token'),
                "source": pricing_source,
                "currency": "CNY" if "元" in db_pricing.get('unit', '') else "USD"
            }
        
        # 数据库定价不可用，返回空定价信息
        logger.warning(f"无法获取模型 {self.model_type} 的定价信息，请检查数据库中是否存在该模型的定价数据")
        return {
            "input_price": 0.0,
            "output_price": 0.0,
            "unit": "unknown",
            "source": "database_unavailable",
            "currency": "USD"
        }
    
    def analyze_conversation(self, messages: List[Dict[str, str]], 
                           estimated_response_tokens: int = 0) -> Dict[str, Any]:
        """
        分析整个对话的token使用情况
        
        Args:
            messages: 消息列表
            estimated_response_tokens: 预估的回复token数量
            
        Returns:
            分析结果字典
        """
        usage = self.count_messages_tokens(messages)
        
        if estimated_response_tokens > 0:
            usage.completion_tokens = estimated_response_tokens
            usage.total_tokens += estimated_response_tokens
        
        cost = self.estimate_cost(usage)
        pricing_info = self.get_pricing_info()
        
        return {
            "model": self.model_type.value,
            "token_usage": usage,
            "cost_info": cost,
            "pricing_info": pricing_info,
            "messages_count": len(messages),
            "average_tokens_per_message": usage.prompt_tokens / len(messages) if messages else 0
        }


class TokenStatistics:
    """Token使用统计"""
    
    def __init__(self):
        self.total_usage = TokenUsage()
        self.session_usage = TokenUsage()
        self.model_usage: Dict[str, TokenUsage] = {}
        self.total_cost = 0.0
    
    def add_usage(self, model: str, usage: TokenUsage, cost: float = 0.0):
        """添加使用记录"""
        self.total_usage += usage
        self.session_usage += usage
        self.total_cost += cost
        
        if model not in self.model_usage:
            self.model_usage[model] = TokenUsage()
        self.model_usage[model] += usage
    
    def reset_session(self):
        """重置会话统计"""
        self.session_usage = TokenUsage()
    
    def get_summary(self) -> Dict[str, Any]:
        """获取统计摘要"""
        return {
            "total_usage": self.total_usage,
            "session_usage": self.session_usage,
            "model_usage": self.model_usage,
            "total_cost": self.total_cost,
            "models_used": list(self.model_usage.keys())
        }


# 全局统计实例
token_stats = TokenStatistics()


def quick_count_tokens(text: str, model: str = "gpt-4o-mini") -> int:
    """
    快速计算token数量的便捷函数
    
    Args:
        text: 要计算的文本
        model: 模型名称
        
    Returns:
        token数量
    """
    calculator = TokenCalculator(model)
    return calculator.count_tokens(text)


def quick_estimate_cost(messages: List[Dict[str, str]], 
                       model: str = "gpt-4o-mini",
                       estimated_response: int = 100) -> Dict[str, Any]:
    """
    快速估算对话成本的便捷函数
    
    Args:
        messages: 消息列表
        model: 模型名称
        estimated_response: 预估回复token数
        
    Returns:
        成本分析结果
    """
    calculator = TokenCalculator(model)
    return calculator.analyze_conversation(messages, estimated_response)
