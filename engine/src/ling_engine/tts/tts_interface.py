import abc
import os
import asyncio
from typing import Dict, Any

from loguru import logger

# 导入TTS成本计算器
try:
    from ..utils.tts_cost_calculator import TTSCostCalculator, TTSCostInfo
except ImportError:
    TTSCostCalculator = None
    TTSCostInfo = None
    logger.warning("TTS成本计算器不可用，计费功能将无法使用")


class TTSInterface(metaclass=abc.ABCMeta):
    def __init__(self):
        """初始化TTS接口，设置模型名称用于计费"""
        self.model_name = self._get_model_name()
        self._cost_calculator = None
    
    def _get_model_name(self) -> str:
        """
        获取模型名称，子类可以重写此方法
        
        Returns:
            模型名称字符串
        """
        # 尝试从全局配置中获取TTS模型名称
        try:
            from ..config_manager.utils import config
            if config is not None:
                tts_model = config.character_config.tts_config.tts_model
                if tts_model:
                    return tts_model
        except ImportError:
            logger.debug("配置管理器在运行时不可用")
        except Exception as e:
            logger.debug(f"从配置中获取TTS模型名称失败: {e}")
        
        # 默认返回类名，子类应该重写这个方法
        return self.__class__.__name__
    
    @property
    def cost_calculator(self):
        """获取成本计算器实例"""
        if self._cost_calculator is None and TTSCostCalculator:
            self._cost_calculator = TTSCostCalculator(self.model_name)
        return self._cost_calculator
    
    def estimate_cost(self, text: str) -> TTSCostInfo:
        """
        估算TTS合成成本
        
        Args:
            text: 要合成的文本
            
        Returns:
            TTSCostInfo对象
        """
        # 对于已知的免费模型，直接返回零成本
        if self.model_name.lower() in ['edge_tts', 'pyttsx3_tts']:
            if TTSCostInfo:
                cost_info = TTSCostInfo(total_cost=0.0, currency="USD")
                logger.debug(f"📊 TTS成本估算: {cost_info.total_cost:.6f} {cost_info.currency} for {len(text.strip())} characters (免费模型: {self.model_name})")
                return cost_info
            return None
            
        if not self.cost_calculator:
            logger.debug("TTS成本计算器不可用，返回零成本")
            return TTSCostInfo() if TTSCostInfo else None
            
        try:
            cost_info = self.cost_calculator.estimate_cost_by_characters(text)
            logger.info(f"📊 TTS成本估算: {cost_info.total_cost:.6f} {cost_info.currency} for {len(text.strip())} characters")
            logger.debug(f"详细成本信息: {cost_info}")
            return cost_info
        except Exception as e:
            logger.error(f"TTS成本估算失败: {e}")
            return TTSCostInfo() if TTSCostInfo else None
    
    def get_pricing_info(self) -> Dict[str, Any]:
        """
        获取定价信息
        
        Returns:
            定价信息字典
        """
        if not self.cost_calculator:
            logger.warning("TTS成本计算器不可用，无法获取定价信息")
            return {"available": False, "error": "成本计算器不可用"}
        
        return self.cost_calculator.get_pricing_details()
    
    async def async_generate_audio(self, text: str, file_name_no_ext=None) -> str:
        """
        Asynchronously generate speech audio file using TTS.

        By default, this runs the synchronous generate_audio in a coroutine.
        Subclasses can override this method to provide true async implementation.

        text: str
            the text to speak
        file_name_no_ext (optional and deprecated): str
            name of the file without file extension

        Returns:
        str: the path to the generated audio file

        """
        return await asyncio.to_thread(self.generate_audio, text, file_name_no_ext)

    @abc.abstractmethod
    def generate_audio(self, text: str, file_name_no_ext=None) -> str:
        """
        Generate speech audio file using TTS.
        text: str
            the text to speak
        file_name_no_ext (optional and deprecated): str
            name of the file without file extension

        Returns:
        str: the path to the generated audio file

        """
        raise NotImplementedError

    def remove_file(self, filepath: str, verbose: bool = True) -> None:
        """
        Remove a file from the file system.

        This is a separate method instead of a part of the `play_audio_file_local()` because `play_audio_file_local()` is not the only way to play audio files. This method will be used to remove the audio file after it has been played.

        Parameters:
            filepath (str): The path to the file to remove.
            verbose (bool): If True, print messages to the console.
        """
        if not os.path.exists(filepath):
            logger.warning(f"File {filepath} does not exist")
            return
        try:
            logger.debug(f"Removing file {filepath}") if verbose else None
            os.remove(filepath)
        except Exception as e:
            logger.error(f"Failed to remove file {filepath}: {e}")

    def generate_cache_file_name(self, file_name_no_ext=None, file_extension="wav"):
        """
        Generate a cross-platform cache file name.

        file_name_no_ext: str
            name of the file without extension
        file_extension: str
            file extension

        Returns:
        str: the path to the generated cache file
        """
        cache_dir = "cache"
        if not os.path.exists(cache_dir):
            os.makedirs(cache_dir)

        if file_name_no_ext is None:
            file_name_no_ext = "temp"

        file_name = f"{file_name_no_ext}.{file_extension}"
        return os.path.join(cache_dir, file_name)
