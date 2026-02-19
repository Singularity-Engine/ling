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
- 成本估算
- Token使用统计
"""

import re
from typing import Dict, List, Optional, Union, Any, Tuple
from dataclasses import dataclass
from enum import Enum
import logging

# 导入数据库定价服务
try:
    from .database_pricing import pricing_service
except ImportError:
    pricing_service = None
    logging.getLogger(__name__).warning("数据库定价服务不可用，将使用硬编码价格")

logger = logging.getLogger(__name__)


class ModelType(Enum):
    """支持的模型类型"""
    # LLM模型
    GPT_35_TURBO = "gpt-3.5-turbo"
    GPT_4 = "gpt-4"
    GPT_4_TURBO = "gpt-4-turbo"
    GPT_4O = "gpt-4o"
    GPT_4O_MINI = "gpt-4o-mini"
    CLAUDE_3_HAIKU = "claude-3-haiku"
    CLAUDE_3_SONNET = "claude-3-sonnet"
    CLAUDE_3_OPUS = "claude-3-opus"
    CLAUDE_3_5_SONNET = "claude-3.5-sonnet"
    DEEPSEEK_CHAT = "deepseek-chat"
    DEEPSEEK_CODER = "deepseek-coder"
    DOUBAO_PRO_4K = "doubao-pro-4k"
    DOUBAO_PRO_32K = "doubao-pro-32k"
    DOUBAO_PRO_128K = "doubao-pro-128k"
    DOUBAO_LITE_4K = "doubao-lite-4k"
    DOUBAO_LITE_32K = "doubao-lite-32k"
    DOUBAO_LITE_128K = "doubao-lite-128k"
    
    # 嵌入模型
    # OpenAI 嵌入模型
    EMB_ADA_002 = "text-embedding-ada-002"
    EMB_3_SMALL = "text-embedding-3-small"
    EMB_3_LARGE = "text-embedding-3-large"
    # Cohere 嵌入模型
    EMB_COHERE_ENGLISH = "embed-english-v3.0"
    EMB_COHERE_MULTILINGUAL = "embed-multilingual-v3.0"
    EMB_COHERE_ENGLISH_LIGHT = "embed-english-light-v3.0"
    EMB_COHERE_MULTILINGUAL_LIGHT = "embed-multilingual-light-v3.0"
    # BGE 嵌入模型
    EMB_BGEPP_EN = "bge-large-en-v1.5"
    EMB_BGEPP_ZH = "bge-large-zh-v1.5"
    EMB_BGEPP_M3 = "bge-m3"
    # 国内厂商嵌入模型
    EMB_DEEPSEEK = "deepseek-embed"
    EMB_DOUBAO = "doubao-embed"
    # 其他常用嵌入模型
    EMB_JINA = "jina-embeddings-v2-base-en"
    EMB_VOYAGE = "voyage-2"
    EMB_NOMIC = "nomic-embed-text-v1.5"
    
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
    
    # 不再使用硬编码价格，全部从数据库获取
    
    # 汇率配置
    EXCHANGE_RATES = {
        "USD": 1.0,       # 美元 (基准货币)
        "CNY": 7.2,       # 人民币
        "EUR": 0.92,      # 欧元
        "JPY": 150.0,     # 日元
        "GBP": 0.78,      # 英镑
    }
    
    # 中文token计算配置
    CHINESE_TOKEN_RATIOS = {
        # 默认配置
        "default": {
            "chinese_ratio": 1.5,   # 中文字符/token比例
            "english_ratio": 4.0    # 英文字符/token比例
        },
        # 模型特定配置
        "gpt": {
            "chinese_ratio": 1.5,
            "english_ratio": 4.0
        },
        "claude": {
            "chinese_ratio": 1.6,
            "english_ratio": 4.0
        },
        "deepseek": {
            "chinese_ratio": 1.3,
            "english_ratio": 3.8
        },
        "doubao": {
            "chinese_ratio": 1.2,
            "english_ratio": 4.0
        },
        "bge-zh": {
            "chinese_ratio": 1.1,
            "english_ratio": 4.0
        },
        "bge-en": {
            "chinese_ratio": 1.3,
            "english_ratio": 3.5
        },
        "cohere-multi": {
            "chinese_ratio": 1.2,
            "english_ratio": 3.8
        },
        "cohere-en": {
            "chinese_ratio": 1.6,
            "english_ratio": 3.5
        }
    }
    
    def __init__(self, 
                 model_type: Union[ModelType, str] = ModelType.GPT_4O_MINI,
                 currency: str = "USD",
                 use_tiktoken: bool = True,
                 debug: bool = False):
        """
        初始化Token计算器
        
        Args:
            model_type: 模型类型
            currency: 货币类型 (USD, CNY, EUR, JPY, GBP)
            use_tiktoken: 是否使用tiktoken (如果可用)
            debug: 是否启用调试模式
        """
        # 保存原始模型名称（如果有的话）
        self._original_model_name = None
        
        if isinstance(model_type, str):
            try:
                self.model_type = ModelType(model_type)
            except ValueError:
                # 检查是否是豆包模型的变体
                if "doubao" in model_type and "lite" in model_type and "32k" in model_type:
                    # 将doubao-1-5-lite-32k-250115等变体映射到DOUBAO_LITE_32K
                    self.model_type = ModelType.DOUBAO_LITE_32K
                    self._original_model_name = model_type
                else:
                    logger.debug(f"未知模型类型: {model_type}，使用自定义模型类型")
                    # 对于未知模型，创建一个自定义模型类型
                    self.model_type = ModelType.CUSTOM
                    # 保存原始模型名称以便在日志中显示
                    self._original_model_name = model_type
        else:
            self.model_type = model_type
            self._original_model_name = None
        
        # 设置货币
        self.currency = currency.upper() if currency in self.EXCHANGE_RATES else "USD"
        self.exchange_rate = self.EXCHANGE_RATES.get(self.currency, 1.0)
        
        # 设置是否使用tiktoken
        self.use_tiktoken = use_tiktoken
        
        # 调试模式
        self.debug = debug
            
        self._tokenizer = None
        self._init_tokenizer()
    
    def _init_tokenizer(self):
        """初始化tokenizer"""
        try:
            # 如果不使用tiktoken，则直接使用近似计算
            if not self.use_tiktoken:
                if self.debug:
                    logger.info(f"✅ 已禁用tiktoken，将使用近似计算")
                self._tokenizer = None
                return
                
            if self.model_type.value.startswith("gpt") or self.model_type.value.startswith("text-embedding"):
                # 使用tiktoken for OpenAI models and embeddings
                try:
                    import tiktoken
                    if self.model_type in [ModelType.GPT_4O, ModelType.GPT_4O_MINI]:
                        self._tokenizer = tiktoken.encoding_for_model("gpt-4o")
                    elif self.model_type == ModelType.GPT_4_TURBO:
                        self._tokenizer = tiktoken.encoding_for_model("gpt-4-turbo")
                    elif self.model_type == ModelType.GPT_4:
                        self._tokenizer = tiktoken.encoding_for_model("gpt-4")
                    elif self.model_type == ModelType.EMB_ADA_002:
                        self._tokenizer = tiktoken.encoding_for_model("text-embedding-ada-002")
                    elif self.model_type in [ModelType.EMB_3_SMALL, ModelType.EMB_3_LARGE]:
                        self._tokenizer = tiktoken.encoding_for_model("text-embedding-3-large")
                    else:  # GPT-3.5-turbo or default
                        self._tokenizer = tiktoken.encoding_for_model("gpt-3.5-turbo")
                    if self.debug:
                        logger.info(f"✅ 已加载tiktoken tokenizer for {self.model_type.value}")
                except ImportError:
                    logger.warning("tiktoken未安装，将使用近似计算")
                    self._tokenizer = None
                    
            elif self.model_type.value.startswith("claude"):
                # Claude模型使用近似计算
                if self.debug:
                    logger.info(f"✅ Claude模型 {self.model_type.value} 将使用近似token计算")
                self._tokenizer = None
                
            elif self.model_type.value.startswith("deepseek"):
                # DeepSeek模型使用近似计算 (类似GPT模型的token计算方式)
                try:
                    import tiktoken
                    # DeepSeek使用类似GPT-3.5的tokenizer
                    self._tokenizer = tiktoken.encoding_for_model("gpt-3.5-turbo")
                    if self.debug:
                        logger.info(f"✅ DeepSeek模型 {self.model_type.value} 使用GPT-3.5 tokenizer")
                except ImportError:
                    logger.warning("tiktoken未安装，DeepSeek模型将使用近似计算")
                    self._tokenizer = None
                    
            elif self.model_type.value.startswith("doubao"):
                # 豆包模型使用近似计算
                if self.debug:
                    logger.info(f"✅ 豆包模型 {self.model_type.value} 将使用近似token计算")
                self._tokenizer = None
                
            elif self.model_type.value.startswith("bge") or self.model_type.value.startswith("embed-") or self.model_type.value.endswith("-embed"):
                # BGE嵌入模型和其他嵌入模型使用近似计算
                if self.debug:
                    logger.info(f"✅ 嵌入模型 {self.model_type.value} 将使用近似token计算")
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
        针对不同模型进行优化
        """
        if not text:
            return 0
            
        # 分离中文和英文字符
        chinese_chars = len(re.findall(r'[\u4e00-\u9fff]', text))
        english_chars = len(text) - chinese_chars
        
        # 获取模型的token比例配置
        ratio_config = None
        
        # 根据模型类型选择合适的比例配置
        if self.model_type.value.startswith("doubao"):
            ratio_config = self.CHINESE_TOKEN_RATIOS.get("doubao")
        elif self.model_type.value.startswith("deepseek"):
            ratio_config = self.CHINESE_TOKEN_RATIOS.get("deepseek")
        elif self.model_type.value.startswith("bge"):
            if "zh" in self.model_type.value:
                ratio_config = self.CHINESE_TOKEN_RATIOS.get("bge-zh")
            else:
                ratio_config = self.CHINESE_TOKEN_RATIOS.get("bge-en")
        elif "embed-multilingual" in self.model_type.value:
            ratio_config = self.CHINESE_TOKEN_RATIOS.get("cohere-multi")
        elif "embed-english" in self.model_type.value:
            ratio_config = self.CHINESE_TOKEN_RATIOS.get("cohere-en")
        elif self.model_type.value.startswith("claude"):
            ratio_config = self.CHINESE_TOKEN_RATIOS.get("claude")
        elif self.model_type.value.startswith("gpt"):
            ratio_config = self.CHINESE_TOKEN_RATIOS.get("gpt")
        else:
            # 默认配置
            ratio_config = self.CHINESE_TOKEN_RATIOS.get("default")
        
        # 计算token数量
        chinese_tokens = chinese_chars / ratio_config["chinese_ratio"]
        english_tokens = english_chars / ratio_config["english_ratio"]
        
        # 调试输出
        if self.debug:
            logger.debug(f"文本: {text[:30]}{'...' if len(text) > 30 else ''}")
            logger.debug(f"中文字符: {chinese_chars}, 英文字符: {english_chars}")
            logger.debug(f"中文token: {chinese_tokens:.2f}, 英文token: {english_tokens:.2f}")
            logger.debug(f"总token: {chinese_tokens + english_tokens:.2f}")
        
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
        估算成本 - 从数据库获取定价信息
        
        Args:
            usage: Token使用情况
            
        Returns:
            成本信息
        """
        # 从数据库获取定价
        if not pricing_service:
            logger.error("数据库定价服务不可用，无法计算成本")
            return CostInfo()
            
        try:
            # 优先使用原始模型名称（如果有），否则使用标准模型名称
            model_name = self.get_model_name()
            db_pricing = pricing_service.get_model_pricing(model_name)
            
            # 如果使用原始名称没有找到定价，则尝试使用标准模型名称
            if not db_pricing and self._original_model_name and self._original_model_name != model_name:
                model_name = self.model_type.value if isinstance(self.model_type, ModelType) else str(self.model_type)
                db_pricing = pricing_service.get_model_pricing(model_name)
                
            if not db_pricing:
                logger.warning(f"数据库中未找到模型定价: {model_name}")
                return CostInfo()
                
            # 使用数据库定价
            input_price = db_pricing.get("input", 0.0)
            output_price = db_pricing.get("output", 0.0)
            
            logger.debug(f"使用数据库定价: {model_name}, input={input_price}, output={output_price}")
            
            # 计算成本 (价格是每1K tokens)
            input_cost = (usage.prompt_tokens / 1000) * input_price
            output_cost = (usage.completion_tokens / 1000) * output_price
            total_cost = input_cost + output_cost
            
            # 如果货币不是USD，则转换成对应货币
            if self.currency != "USD":
                input_cost *= self.exchange_rate
                output_cost *= self.exchange_rate
                total_cost *= self.exchange_rate
            
            return CostInfo(
                input_cost=input_cost,
                output_cost=output_cost,
                total_cost=total_cost,
                currency=self.currency
            )
        except Exception as e:
            logger.error(f"计算成本时发生错误: {e}")
            return CostInfo()
    
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
        
        return {
            "model": self.model_type.value,
            "token_usage": usage,
            "cost_info": cost,
            "messages_count": len(messages),
            "average_tokens_per_message": usage.prompt_tokens / len(messages) if messages else 0
        }
    
    def get_model_name(self) -> str:
        """
        获取模型名称
        
        Returns:
            模型名称字符串
        """
        if self._original_model_name:
            return self._original_model_name
        return self.model_type.value


class TokenStatistics:
    """Token使用统计"""
    
    def __init__(self):
        self.total_usage = TokenUsage()
        self.session_usage = TokenUsage()
        self.model_usage: Dict[str, TokenUsage] = {}
        self.total_cost = 0.0
        self.usage_history: List[Dict[str, Any]] = []
    
    def add_usage(self, model: str, usage: TokenUsage, cost: float = 0.0, metadata: Dict[str, Any] = None):
        """
        添加使用记录
        
        Args:
            model: 模型名称
            usage: Token使用情况
            cost: 成本
            metadata: 元数据，如用户ID、会话ID等
        """
        self.total_usage += usage
        self.session_usage += usage
        self.total_cost += cost
        
        if model not in self.model_usage:
            self.model_usage[model] = TokenUsage()
        self.model_usage[model] += usage
        
        # 记录使用历史
        import time
        
        history_entry = {
            "timestamp": time.time(),
            "datetime": time.strftime("%Y-%m-%d %H:%M:%S"),
            "model": model,
            "usage": {
                "prompt_tokens": usage.prompt_tokens,
                "completion_tokens": usage.completion_tokens,
                "total_tokens": usage.total_tokens
            },
            "cost": cost
        }
        
        # 添加元数据
        if metadata:
            history_entry["metadata"] = metadata
            
        self.usage_history.append(history_entry)
    
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
            "models_used": list(self.model_usage.keys()),
            "history_entries": len(self.usage_history)
        }
    
    def export_report(self, format: str = "json", file_path: str = None) -> Any:
        """
        导出统计报告
        
        Args:
            format: 导出格式 ("json", "csv", "markdown")
            file_path: 导出文件路径，None表示返回字符串
            
        Returns:
            导出的报告内容或文件路径
        """
        if format == "json":
            return self._export_json(file_path)
        elif format == "csv":
            return self._export_csv(file_path)
        elif format == "markdown":
            return self._export_markdown(file_path)
        else:
            raise ValueError(f"不支持的导出格式: {format}")
    
    def _export_json(self, file_path: str = None) -> Any:
        """导出JSON格式报告"""
        import json
        
        report = {
            "summary": self.get_summary(),
            "history": self.usage_history
        }
        
        # 转换TokenUsage对象为字典
        report["summary"]["total_usage"] = {
            "prompt_tokens": self.total_usage.prompt_tokens,
            "completion_tokens": self.total_usage.completion_tokens,
            "total_tokens": self.total_usage.total_tokens
        }
        
        report["summary"]["session_usage"] = {
            "prompt_tokens": self.session_usage.prompt_tokens,
            "completion_tokens": self.session_usage.completion_tokens,
            "total_tokens": self.session_usage.total_tokens
        }
        
        model_usage_dict = {}
        for model, usage in self.model_usage.items():
            model_usage_dict[model] = {
                "prompt_tokens": usage.prompt_tokens,
                "completion_tokens": usage.completion_tokens,
                "total_tokens": usage.total_tokens
            }
        report["summary"]["model_usage"] = model_usage_dict
        
        json_str = json.dumps(report, indent=2)
        
        if file_path:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(json_str)
            return file_path
        else:
            return json_str
    
    def _export_csv(self, file_path: str = None) -> Any:
        """导出CSV格式报告"""
        import csv
        import io
        
        output = io.StringIO() if file_path is None else None
        
        if file_path:
            csv_file = open(file_path, 'w', newline='', encoding='utf-8')
        else:
            csv_file = output
            
        writer = csv.writer(csv_file)
        
        # 写入标题行
        writer.writerow([
            "Timestamp", "DateTime", "Model", 
            "Prompt Tokens", "Completion Tokens", "Total Tokens", 
            "Cost"
        ])
        
        # 写入历史记录
        for entry in self.usage_history:
            writer.writerow([
                entry["timestamp"],
                entry["datetime"],
                entry["model"],
                entry["usage"]["prompt_tokens"],
                entry["usage"]["completion_tokens"],
                entry["usage"]["total_tokens"],
                entry["cost"]
            ])
        
        # 写入总结
        writer.writerow([])
        writer.writerow(["Summary"])
        writer.writerow(["Total Prompt Tokens", self.total_usage.prompt_tokens])
        writer.writerow(["Total Completion Tokens", self.total_usage.completion_tokens])
        writer.writerow(["Total Tokens", self.total_usage.total_tokens])
        writer.writerow(["Total Cost", self.total_cost])
        
        # 写入模型使用情况
        writer.writerow([])
        writer.writerow(["Model Usage"])
        for model, usage in self.model_usage.items():
            writer.writerow([
                model, 
                usage.prompt_tokens,
                usage.completion_tokens,
                usage.total_tokens
            ])
        
        if file_path:
            csv_file.close()
            return file_path
        else:
            return output.getvalue()
    
    def _export_markdown(self, file_path: str = None) -> Any:
        """导出Markdown格式报告"""
        lines = []
        
        # 标题
        lines.append("# Token使用统计报告")
        lines.append("")
        
        # 总结
        lines.append("## 总结")
        lines.append("")
        lines.append("| 指标 | 值 |")
        lines.append("| ---- | --- |")
        lines.append(f"| 总输入Token | {self.total_usage.prompt_tokens} |")
        lines.append(f"| 总输出Token | {self.total_usage.completion_tokens} |")
        lines.append(f"| 总Token | {self.total_usage.total_tokens} |")
        lines.append(f"| 总成本 | ${self.total_cost:.6f} |")
        lines.append(f"| 使用的模型数 | {len(self.model_usage)} |")
        lines.append(f"| 记录条数 | {len(self.usage_history)} |")
        lines.append("")
        
        # 模型使用情况
        lines.append("## 模型使用情况")
        lines.append("")
        lines.append("| 模型 | 输入Token | 输出Token | 总Token |")
        lines.append("| ---- | --------- | --------- | ------- |")
        for model, usage in self.model_usage.items():
            lines.append(f"| {model} | {usage.prompt_tokens} | {usage.completion_tokens} | {usage.total_tokens} |")
        lines.append("")
        
        # 历史记录
        lines.append("## 使用历史")
        lines.append("")
        lines.append("| 时间 | 模型 | 输入Token | 输出Token | 总Token | 成本 |")
        lines.append("| ---- | ---- | --------- | --------- | ------- | ---- |")
        for entry in self.usage_history:
            lines.append(f"| {entry['datetime']} | {entry['model']} | {entry['usage']['prompt_tokens']} | {entry['usage']['completion_tokens']} | {entry['usage']['total_tokens']} | ${entry['cost']:.6f} |")
        
        markdown = "\n".join(lines)
        
        if file_path:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(markdown)
            return file_path
        else:
            return markdown


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


def batch_count_tokens(texts: List[str], model: str = "gpt-4o-mini") -> List[int]:
    """
    批量计算多个文本的token数量
    
    Args:
        texts: 要计算的文本列表
        model: 模型名称
        
    Returns:
        每个文本的token数量列表
    """
    calculator = TokenCalculator(model)
    return [calculator.count_tokens(text) for text in texts]


def count_tokens_by_model(text: str, models: List[str]) -> Dict[str, int]:
    """
    使用多个模型计算同一文本的token数量
    
    Args:
        text: 要计算的文本
        models: 模型名称列表
        
    Returns:
        每个模型的token数量字典 {model_name: token_count}
    """
    result = {}
    for model in models:
        calculator = TokenCalculator(model)
        result[model] = calculator.count_tokens(text)
    return result


def count_file_tokens(file_path: str, model: str = "gpt-4o-mini") -> int:
    """
    计算文件的token数量
    
    Args:
        file_path: 文件路径
        model: 模型名称
        
    Returns:
        token数量
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        return quick_count_tokens(content, model)
    except Exception as e:
        logger.error(f"计算文件token失败: {e}")
        return 0


def count_directory_tokens(dir_path: str, 
                          model: str = "gpt-4o-mini", 
                          file_extensions: List[str] = None,
                          recursive: bool = True) -> Dict[str, Any]:
    """
    计算目录中所有文件的token数量
    
    Args:
        dir_path: 目录路径
        model: 模型名称
        file_extensions: 要包含的文件扩展名列表 (如 ['.py', '.txt'])，None表示所有文件
        recursive: 是否递归遍历子目录
        
    Returns:
        目录token统计信息
    """
    import os
    from pathlib import Path
    
    total_tokens = 0
    file_stats = []
    
    try:
        # 确定要遍历的文件
        if recursive:
            all_files = []
            for root, _, files in os.walk(dir_path):
                for file in files:
                    all_files.append(os.path.join(root, file))
        else:
            all_files = [os.path.join(dir_path, f) for f in os.listdir(dir_path) 
                        if os.path.isfile(os.path.join(dir_path, f))]
        
        # 过滤文件扩展名
        if file_extensions:
            all_files = [f for f in all_files if os.path.splitext(f)[1].lower() in file_extensions]
        
        # 计算每个文件的token
        calculator = TokenCalculator(model)
        for file_path in all_files:
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                tokens = calculator.count_tokens(content)
                relative_path = os.path.relpath(file_path, dir_path)
                file_stats.append({
                    "file": relative_path,
                    "tokens": tokens,
                    "chars": len(content),
                    "bytes": os.path.getsize(file_path)
                })
                total_tokens += tokens
            except Exception as e:
                logger.warning(f"跳过文件 {file_path}: {e}")
        
        # 按token数量排序
        file_stats.sort(key=lambda x: x["tokens"], reverse=True)
        
        return {
            "total_tokens": total_tokens,
            "total_files": len(file_stats),
            "file_stats": file_stats,
            "model": model
        }
    except Exception as e:
        logger.error(f"计算目录token失败: {e}")
        return {
            "total_tokens": 0,
            "total_files": 0,
            "file_stats": [],
            "error": str(e),
            "model": model
        }


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


def batch_estimate_cost(messages_list: List[List[Dict[str, str]]], 
                       model: str = "gpt-4o-mini",
                       estimated_response: int = 100) -> List[Dict[str, Any]]:
    """
    批量估算多个对话的成本
    
    Args:
        messages_list: 多个对话的消息列表
        model: 模型名称
        estimated_response: 预估回复token数
        
    Returns:
        每个对话的成本分析结果列表
    """
    calculator = TokenCalculator(model)
    return [calculator.analyze_conversation(messages, estimated_response) for messages in messages_list]
