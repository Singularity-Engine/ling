"""
TTS成本计算模块 - 用于计算TTS语音合成的成本

基于现有的数据库定价系统，为TTS服务提供成本计算功能
"""

import logging
from typing import Dict, Optional, Any
from dataclasses import dataclass

# 导入数据库定价服务
try:
    from .database_pricing import pricing_service
except ImportError:
    pricing_service = None
    
logger = logging.getLogger(__name__)


@dataclass
class TTSCostInfo:
    """TTS成本信息"""
    base_cost: float = 0.0  # 基础成本
    duration_cost: float = 0.0  # 时长成本
    character_cost: float = 0.0  # 字符成本
    total_cost: float = 0.0  # 总成本
    currency: str = "USD"  # 货币单位
    pricing_unit: str = ""  # 定价单位


class TTSCostCalculator:
    """TTS成本计算器"""
    
    # 类级别缓存，所有实例共享
    _pricing_cache = {}
    _cache_timestamps = {}
    _cache_ttl = 300  # 5分钟缓存过期时间
    
    def __init__(self, tts_model_name: str):
        """
        初始化TTS成本计算器
        
        Args:
            tts_model_name: TTS模型名称
        """
        self.tts_model_name = tts_model_name
        self._pricing_info = None
    
    def get_pricing_info(self) -> Optional[Dict[str, Any]]:
        """
        获取TTS模型的定价信息（带缓存）
        
        Returns:
            定价信息字典，包含基础价格、时长价格、字符价格等信息
        """
        import time
        
        current_time = time.time()
        
        # 检查缓存是否过期
        if (
            self.tts_model_name in self._pricing_cache and 
            self.tts_model_name in self._cache_timestamps and
            (current_time - self._cache_timestamps[self.tts_model_name]) < self._cache_ttl
        ):
            logger.debug(f"使用缓存的TTS模型定价: {self.tts_model_name}")
            return self._pricing_cache[self.tts_model_name]
        
        if self._pricing_info is None:
            if pricing_service:
                try:
                    self._pricing_info = pricing_service.get_model_pricing(self.tts_model_name)
                    if self._pricing_info:
                        logger.info(f"✅ 成功获取TTS模型定价: {self.tts_model_name}")
                        # 更新缓存
                        self._pricing_cache[self.tts_model_name] = self._pricing_info
                        self._cache_timestamps[self.tts_model_name] = current_time
                    else:
                        logger.warning(f"❌ 数据库中未找到TTS模型定价: {self.tts_model_name}")
                        # 缓存空结果，避免重复查询
                        self._pricing_cache[self.tts_model_name] = None
                        self._cache_timestamps[self.tts_model_name] = current_time
                except Exception as e:
                    logger.error(f"❌ 获取TTS模型定价失败: {e}")
                    self._pricing_info = None
                    # 缓存错误结果，但缩短缓存时间
                    self._pricing_cache[self.tts_model_name] = None
                    self._cache_timestamps[self.tts_model_name] = current_time - self._cache_ttl + 30  # 30秒后重试
            else:
                logger.warning("❌ 数据库定价服务不可用")
                self._pricing_info = None
        
        return self._pricing_info
    
    def estimate_cost_by_characters(self, text: str) -> TTSCostInfo:
        """
        根据字符数量估算TTS成本
        
        Args:
            text: 要合成的文本
            
        Returns:
            TTSCostInfo对象
        """
        pricing_info = self.get_pricing_info()
        logger.debug(f"TTS模型 {self.tts_model_name} 的定价信息: {pricing_info}")
        
        if not pricing_info:
            logger.debug(f"未获取到模型 {self.tts_model_name} 的定价信息，返回空成本信息")
            return TTSCostInfo()
        
        # 计算字符数量（去除空白字符）
        character_count = len(text.strip())
        logger.debug(f"文本字符数: {character_count}")
        
        # 获取定价信息
        base_price = pricing_info.get('base', 0.0)
        character_price = pricing_info.get('character', 0.0)
        unit = pricing_info.get('unit', '')
        
        logger.debug(f"TTS模型 {self.tts_model_name} 定价详情: base={base_price}, character_price={character_price}, unit={unit}")
        
        # 计算成本
        base_cost = base_price
        logger.debug(f"基础费用: {base_cost}")
        
        if character_price > 0:
            # 按千字符计费
            character_cost = (character_count / 1000.0) * character_price
            logger.debug(f"字符费用计算: ({character_count} / 1000.0) * {character_price} = {character_cost}")
        else:
            character_cost = 0.0
            logger.debug("字符费用为0或未设置")
            
        total_cost = base_cost + character_cost
        logger.debug(f"总费用: {base_cost} + {character_cost} = {total_cost}")
        
        # 动态确定货币单位 - 从数据库获取或者默认使用USD
        # 根据unit字段中的信息提取货币单位，如果无法提取则使用默认值
        currency = "USD"  # 默认货币单位
        if "元" in unit:
            currency = "CNY"
        elif "USD" in unit:
            currency = "USD"
        elif "美元" in unit:
            currency = "USD"
        
        logger.debug(f"使用的货币单位: {currency}")
        
        result = TTSCostInfo(
            base_cost=base_cost,
            character_cost=character_cost,
            total_cost=total_cost,
            currency=currency,
            pricing_unit=unit
        )
        
        logger.debug(f"最终成本信息: {result}")
        return result
    
    def estimate_cost_by_duration(self, duration_seconds: float) -> TTSCostInfo:
        """
        根据音频时长估算TTS成本
        
        Args:
            duration_seconds: 音频时长（秒）
            
        Returns:
            TTSCostInfo对象
        """
        pricing_info = self.get_pricing_info()
        if not pricing_info:
            return TTSCostInfo()
        
        # 获取定价信息
        base_price = pricing_info.get('base', 0.0)
        duration_price = pricing_info.get('duration', 0.0)  # 每秒价格
        unit = pricing_info.get('unit', '')
        
        # 计算成本
        base_cost = base_price
        duration_cost = duration_seconds * duration_price
        total_cost = base_cost + duration_cost
        
        # 确定货币单位 - 强制使用USD
        currency = "USD"
        
        return TTSCostInfo(
            base_cost=base_cost,
            duration_cost=duration_cost,
            total_cost=total_cost,
            currency=currency,
            pricing_unit=unit
        )
    
    def estimate_cost_by_minutes(self, duration_minutes: float) -> TTSCostInfo:
        """
        根据音频时长（分钟）估算TTS成本
        
        Args:
            duration_minutes: 音频时长（分钟）
            
        Returns:
            TTSCostInfo对象
        """
        pricing_info = self.get_pricing_info()
        if not pricing_info:
            return TTSCostInfo()
        
        # 获取定价信息
        base_price = pricing_info.get('base', 0.0)
        minute_price = pricing_info.get('minute', 0.0)  # 每分钟价格
        unit = pricing_info.get('unit', '')
        
        # 计算成本
        base_cost = base_price
        duration_cost = duration_minutes * minute_price
        total_cost = base_cost + duration_cost
        
        # 确定货币单位 - 强制使用USD
        currency = "USD"
        
        return TTSCostInfo(
            base_cost=base_cost,
            duration_cost=duration_cost,
            total_cost=total_cost,
            currency=currency,
            pricing_unit=unit
        )
    
    def get_pricing_details(self) -> Dict[str, Any]:
        """
        获取详细的定价信息
        
        Returns:
            定价详情字典
        """
        pricing_info = self.get_pricing_info()
        if not pricing_info:
            return {
                "model_name": self.tts_model_name,
                "available": False,
                "error": "定价信息不可用"
            }
        
        return {
            "model_name": self.tts_model_name,
            "available": True,
            "base_price": pricing_info.get('base', 0.0),
            "character_price": pricing_info.get('character', 0.0),
            "duration_price": pricing_info.get('duration', 0.0),
            "minute_price": pricing_info.get('minute', 0.0),
            "unit": pricing_info.get('unit', ''),
            "capabilities": pricing_info.get('capabilities', '')
        }


def quick_estimate_tts_cost(text: str, tts_model: str = "Azure Neural Voice") -> TTSCostInfo:
    """
    快速估算TTS成本的便捷函数
    
    Args:
        text: 要合成的文本
        tts_model: TTS模型名称
        
    Returns:
        TTSCostInfo对象
    """
    calculator = TTSCostCalculator(tts_model)
    return calculator.estimate_cost_by_characters(text)