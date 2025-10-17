import os
import sys
from typing import Optional
from loguru import logger
from .tts_interface import TTSInterface

try:
    from elevenlabs import ElevenLabs, VoiceSettings
    from elevenlabs.types import Voice
    ELEVENLABS_AVAILABLE = True
except ImportError:
    logger.warning("ElevenLabs library not installed. Install it with: pip install elevenlabs")
    ELEVENLABS_AVAILABLE = False

current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(current_dir)


class TTSEngine(TTSInterface):
    """ElevenLabs TTS Engine implementation"""
    
    def __init__(
        self,
        api_key: str,
        voice_id: str = "JBFqnCBsd6RMkjVDRZzb",
        model_id: str = "eleven_multilingual_v2",
        output_format: str = "mp3_44100_128",
        stability: float = 0.5,
        similarity_boost: float = 0.5,
        style: float = 0.0,
        use_speaker_boost: bool = True,
        optimize_streaming_latency: int = 0,
        voice_settings: Optional[dict] = None
    ):
        super().__init__()
        
        if not ELEVENLABS_AVAILABLE:
            raise ImportError("ElevenLabs library is required for ElevenLabs TTS. Install it with: pip install elevenlabs")
        
        if not api_key:
            raise ValueError("API key is required for ElevenLabs TTS")
        
        self.api_key = api_key
        self.voice_id = voice_id
        self.model_id = model_id
        self.output_format = output_format
        
        # 初始化ElevenLabs客户端
        self.client = ElevenLabs(api_key=api_key)
        
        # 语音设置
        if voice_settings:
            self.voice_settings = VoiceSettings(
                stability=voice_settings.get("stability", stability),
                similarity_boost=voice_settings.get("similarity_boost", similarity_boost),
                style=voice_settings.get("style", style),
                use_speaker_boost=voice_settings.get("use_speaker_boost", use_speaker_boost)
            )
        else:
            self.voice_settings = VoiceSettings(
                stability=stability,
                similarity_boost=similarity_boost,
                style=style,
                use_speaker_boost=use_speaker_boost
            )
        
        self.optimize_streaming_latency = optimize_streaming_latency
        
        # 音频文件设置
        self.temp_audio_file = "temp"
        self.file_extension = self._get_file_extension()
        self.new_audio_dir = "cache"
        
        if not os.path.exists(self.new_audio_dir):
            os.makedirs(self.new_audio_dir)
    
    def _get_model_name(self) -> str:
        """获取ElevenLabs TTS模型名称"""
        try:
            from ..config_manager.utils import config
            if config is not None:
                tts_model = config.character_config.tts_config.tts_model
                if tts_model:
                    return tts_model
        except Exception as e:
            logger.debug(f"从配置中获取TTS模型名称失败: {e}")
        
        return "elevenlabs_tts"
    
    def _get_file_extension(self) -> str:
        """根据输出格式获取文件扩展名"""
        if "mp3" in self.output_format:
            return "mp3"
        elif "wav" in self.output_format:
            return "wav"
        elif "flac" in self.output_format:
            return "flac"
        elif "pcm" in self.output_format:
            return "wav"  # PCM通常保存为WAV
        else:
            return "mp3"  # 默认为MP3
    
    def generate_audio(self, text: str, file_name_no_ext: Optional[str] = None) -> Optional[str]:
        """
        Generate speech audio file using ElevenLabs TTS.
        
        Args:
            text: 要转换为语音的文本
            file_name_no_ext: 输出文件名（不包含扩展名）
            
        Returns:
            str: 生成的音频文件路径，失败时返回None
        """
        if not text or not text.strip():
            logger.warning("Empty text provided for TTS")
            return None
        
        # 生成输出文件路径
        file_path = self.generate_cache_file_name(file_name_no_ext, self.file_extension)
        
        try:
            # 预估成本（如果可用）
            try:
                cost_info = self.estimate_cost(text)
                if cost_info:
                    logger.info(f"🔊 ElevenLabs TTS: 预估成本 {cost_info.total_cost:.6f} {cost_info.currency}")
            except Exception as e:
                logger.debug(f"成本估算失败: {e}")
            
            # 调用ElevenLabs API
            logger.debug(f"Generating audio with ElevenLabs: voice_id={self.voice_id}, model={self.model_id}")
            
            audio_generator = self.client.text_to_speech.convert(
                text=text,
                voice_id=self.voice_id,
                model_id=self.model_id,
                voice_settings=self.voice_settings,
                output_format=self.output_format,
                optimize_streaming_latency=self.optimize_streaming_latency
            )
            
            # 保存音频文件
            with open(file_path, "wb") as audio_file:
                for chunk in audio_generator:
                    audio_file.write(chunk)
            
            logger.info(f"✅ ElevenLabs TTS audio generated successfully: {file_path}")
            return file_path
            
        except Exception as e:
            logger.error(f"❌ ElevenLabs TTS generation failed: {e}")
            
            # 清理可能创建的空文件
            if os.path.exists(file_path):
                try:
                    os.remove(file_path)
                except:
                    pass
            
            return None
    
    def get_available_voices(self) -> list:
        """
        获取可用的语音列表
        
        Returns:
            list: 可用语音列表
        """
        try:
            voices = self.client.voices.get_all()
            return [{"voice_id": voice.voice_id, "name": voice.name, "category": voice.category} for voice in voices.voices]
        except Exception as e:
            logger.error(f"Failed to get available voices: {e}")
            return []
    
    def clone_voice(self, name: str, description: str, files: list) -> Optional[str]:
        """
        克隆语音
        
        Args:
            name: 语音名称
            description: 语音描述
            files: 音频文件路径列表
            
        Returns:
            str: 克隆的语音ID，失败时返回None
        """
        try:
            voice = self.client.voices.clone(
                name=name,
                description=description,
                files=files
            )
            logger.info(f"Voice cloned successfully: {voice.voice_id}")
            return voice.voice_id
        except Exception as e:
            logger.error(f"Voice cloning failed: {e}")
            return None