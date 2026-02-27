import os
import json
import requests
import binascii
import time
from typing import Iterator, Optional
from loguru import logger
from .tts_interface import TTSInterface


class TTSEngine(TTSInterface):
    """
    MiniMax TTS engine that calls the MiniMax API service.
    """

    file_extension: str = "mp3"

    def __init__(
        self,
        api_key: str,
        group_id: str,
        model: str = "speech-2.5-turbo-preview",
        voice_id: str = "female-qn-tianmei",
        speed: float = 1.0,
        vol: float = 1.0,
        pitch: int = 0,
        sample_rate: int = 32000,
        bitrate: int = 128000,
        format: str = "mp3",
        channel: int = 1,
        stream: bool = True,
    ):
        """
        Initialize the MiniMax TTS API.

        Args:
            api_key (str): The API key for the MiniMax TTS API.
            group_id (str): The group ID for the MiniMax TTS API.
            model (str): The model to use for TTS.
            voice_id (str): The voice ID to use.
            speed (float): Speech speed multiplier (0.5-2.0).
            vol (float): Volume level (0.0-1.0).
            pitch (int): Pitch adjustment (-12 to 12).
            sample_rate (int): Audio sample rate.
            bitrate (int): Audio bitrate.
            format (str): Audio format (mp3, pcm, flac).
            channel (int): Audio channels (1 or 2).
            stream (bool): Whether to use streaming mode.
        """
        # 先调用父类初始化以设置model_name
        super().__init__()
        
        self.api_key = api_key
        self.group_id = group_id
        self.model = model
        self.voice_id = voice_id
        self.speed = speed
        self.vol = vol
        self.pitch = pitch
        self.sample_rate = sample_rate
        self.bitrate = bitrate
        self.format = format
        self.channel = channel
        self.stream = stream
        
        self.api_url = f"https://api.minimaxi.com/v1/t2a_v2?GroupId={self.group_id}"
        
        logger.info(
            f"MiniMax TTS API initialized with model: {self.model}, voice: {self.voice_id}"
        )
        
        # Create cache directory if it doesn't exist
        if not os.path.exists("cache"):
            os.makedirs("cache")
    
    def _get_model_name(self) -> str:
        """
        获取模型名称，返回Minimax TTS用于计费
        
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
        except Exception as e:
            logger.debug(f"从配置中获取TTS模型名称失败: {e}")
        
        # 默认返回类名
        return "minimax_tts"

    def build_headers(self) -> dict:
        """Build the headers for the API request."""
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}"
        }
        
    def build_request_body(self, text: str) -> dict:
        """Build the request body for the API request."""
        return {
            "model": self.model,
            "text": text,
            "stream": self.stream,
            "voice_setting": {
                "voice_id": self.voice_id,
                "speed": self.speed,
                "vol": self.vol,
                "pitch": self.pitch
            },
            "audio_setting": {
                "sample_rate": self.sample_rate,
                "bitrate": self.bitrate,
                "format": self.format,
                "channel": self.channel
            }
        }
    
    def call_tts_stream(self, text: str) -> Iterator[bytes]:
        """Call the MiniMax TTS API in streaming mode."""
        headers = self.build_headers()
        body = json.dumps(self.build_request_body(text))
        
        # 记录请求开始时间
        request_start_time = time.time()
        logger.info(f"🔊 发送TTS请求 - 文本长度: {len(text)}字符 (流式模式)")
        
        response = requests.post(self.api_url, headers=headers, data=body, stream=True)
        
        if response.status_code != 200:
            logger.error(f"MiniMax TTS API error: {response.status_code} - {response.text}")
            return
            
        first_audio_received = False
        for chunk in response.iter_lines():
            if chunk:
                if chunk.startswith(b'data:'):
                    try:
                        data = json.loads(chunk[5:])
                        if "data" in data and "extra_info" not in data:
                            if "audio" in data["data"]:
                                # 记录第一次收到音频数据的时间
                                if not first_audio_received:
                                    first_response_time = time.time()
                                    response_latency = (first_response_time - request_start_time) * 1000
                                    logger.info(f"⏱️ TTS首次响应时间: {response_latency:.0f}ms (MiniMax {self.model})")
                                    first_audio_received = True
                                
                                audio = data["data"]["audio"]
                                yield bytes.fromhex(audio)
                    except json.JSONDecodeError as e:
                        logger.error(f"Error decoding JSON: {e}")
                    except Exception as e:
                        logger.error(f"Error processing chunk: {e}")
    
    def generate_audio(self, text: str, file_name_no_ext: Optional[str] = None) -> str:
        """
        Generate speech audio file using MiniMax TTS.
        
        Args:
            text (str): The text to speak.
            file_name_no_ext (str, optional): Name of the file without extension.
            
        Returns:
            str: The path to the generated audio file.
        """
        file_name = self.generate_cache_file_name(file_name_no_ext, self.file_extension)
        
        try:
            # If streaming is enabled
            if self.stream:
                audio_data = b""
                for chunk in self.call_tts_stream(text):
                    audio_data += chunk
                    
                with open(file_name, "wb") as f:
                    f.write(audio_data)
            else:
                # Non-streaming mode
                headers = self.build_headers()
                body = self.build_request_body(text)
                body["stream"] = False  # Ensure stream is False for non-streaming mode
                
                # 记录请求开始时间
                request_start_time = time.time()
                logger.info(f"🔊 发送TTS请求 - 文本长度: {len(text)}字符 (非流式模式)")
                
                response = requests.post(self.api_url, headers=headers, json=body)
                
                # 记录响应时间
                response_time = time.time()
                response_latency = (response_time - request_start_time) * 1000
                
                if response.status_code != 200:
                    logger.error(f"MiniMax TTS API error: {response.status_code} - {response.text}")
                    return None
                
                logger.info(f"⏱️ TTS完整响应时间: {response_latency:.0f}ms (MiniMax {self.model})")
                
                data = response.json()
                if "data" in data and "audio" in data["data"]:
                    audio = data["data"]["audio"]
                    with open(file_name, "wb") as f:
                        f.write(bytes.fromhex(audio))
                else:
                    logger.error(f"Unexpected response format: {data}")
                    return None
                    
        except Exception as e:
            logger.critical(f"Error: MiniMax TTS API failed to generate audio: {e}")
            return None
            
        return file_name 