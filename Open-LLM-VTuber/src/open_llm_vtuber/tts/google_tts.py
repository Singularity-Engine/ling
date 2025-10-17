import sys
import os
from typing import Optional, Iterator
from loguru import logger
from .tts_interface import TTSInterface

current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(current_dir)


class TTSEngine(TTSInterface):
    """Google Cloud Text-to-Speech 引擎实现，支持流式合成"""

    temp_audio_file = "temp"
    file_extension = "mp3"  # 默认使用 mp3 格式
    new_audio_dir = "cache"

    def __init__(
        self,
        project_id: Optional[str] = None,
        credentials_json: Optional[str] = None,
        voice_name: str = "en-US-Neural2-A",
        language_code: str = "en-US",
        audio_encoding: str = "MP3",
        sample_rate_hertz: int = 24000,
        speaking_rate: float = 1.0,
        pitch: float = 0.0,
        enable_streaming: bool = True,
    ):
        """
        初始化 Google Cloud Text-to-Speech 服务

        Args:
            project_id: Google Cloud 项目 ID（可选，从凭证中推断）
            credentials_json: 凭证 JSON 文件路径（可选，使用环境变量 GOOGLE_APPLICATION_CREDENTIALS）
            voice_name: 语音名称（如 'en-US-Neural2-A', 'cmn-CN-Wavenet-A'）
            language_code: 语言代码（如 'en-US', 'cmn-CN'）
            audio_encoding: 音频编码（'MP3', 'LINEAR16', 'OGG_OPUS'）
            sample_rate_hertz: 采样率（16000, 24000, 32000, 48000）
            speaking_rate: 语速（0.25-4.0，默认 1.0）
            pitch: 音高（-20.0 到 20.0，默认 0.0）
            enable_streaming: 是否启用流式合成（默认 True）
        """
        super().__init__()

        try:
            from google.cloud import texttospeech_v1
            from google.oauth2 import service_account
        except ImportError as e:
            logger.error("未安装 Google Cloud Text-to-Speech 库")
            logger.error("请运行: pip install google-cloud-texttospeech")
            raise ImportError(
                "需要安装 google-cloud-texttospeech 库。"
                "运行: pip install google-cloud-texttospeech"
            ) from e

        # 设置认证
        client_options = {}
        if credentials_json and os.path.exists(credentials_json):
            logger.info(f"使用凭证文件: {credentials_json}")
            credentials = service_account.Credentials.from_service_account_file(
                credentials_json
            )
            self.client = texttospeech_v1.TextToSpeechClient(credentials=credentials)
        else:
            # 使用默认凭证（环境变量 GOOGLE_APPLICATION_CREDENTIALS）
            logger.info("使用默认 Google Cloud 凭证")
            self.client = texttospeech_v1.TextToSpeechClient()

        self.project_id = project_id
        self.voice_name = voice_name
        self.language_code = language_code
        self.speaking_rate = speaking_rate
        self.pitch = pitch
        self.enable_streaming = enable_streaming

        # 设置音频格式
        self.audio_encoding_map = {
            "MP3": texttospeech_v1.AudioEncoding.MP3,
            "LINEAR16": texttospeech_v1.AudioEncoding.LINEAR16,
            "OGG_OPUS": texttospeech_v1.AudioEncoding.OGG_OPUS,
            "MULAW": texttospeech_v1.AudioEncoding.MULAW,
            "ALAW": texttospeech_v1.AudioEncoding.ALAW,
        }

        if audio_encoding not in self.audio_encoding_map:
            logger.warning(f"不支持的音频编码 '{audio_encoding}'，使用默认 MP3")
            audio_encoding = "MP3"

        self.audio_encoding = self.audio_encoding_map[audio_encoding]
        self.sample_rate_hertz = sample_rate_hertz

        # 根据编码设置文件扩展名
        self.file_extension = {
            "MP3": "mp3",
            "LINEAR16": "wav",
            "OGG_OPUS": "ogg",
            "MULAW": "wav",
            "ALAW": "wav",
        }.get(audio_encoding, "mp3")

        # 创建缓存目录
        if not os.path.exists(self.new_audio_dir):
            os.makedirs(self.new_audio_dir)

        logger.info(f"Google TTS 初始化成功")
        logger.info(f"  语音: {voice_name}")
        logger.info(f"  语言: {language_code}")
        logger.info(f"  采样率: {sample_rate_hertz} Hz")
        logger.info(f"  流式模式: {enable_streaming}")

    def _get_model_name(self) -> str:
        """重写获取模型名称方法，用于成本计算"""
        return "google_tts"

    def generate_audio(self, text: str, file_name_no_ext: Optional[str] = None) -> str:
        """
        生成语音音频文件

        Args:
            text: 要合成的文本
            file_name_no_ext: 文件名（不含扩展名）

        Returns:
            生成的音频文件路径
        """
        from google.cloud import texttospeech_v1

        # 检查文本有效性
        if not isinstance(text, str):
            logger.warning("Google TTS: 文本必须是字符串类型")
            logger.warning(f"收到类型: {type(text)}，值: {text}")
            return ""

        text = text.strip()
        if not text:
            logger.warning("Google TTS: 没有要合成的文本")
            return ""

        # 生成输出文件路径
        file_name = self.generate_cache_file_name(file_name_no_ext, self.file_extension)

        try:
            if self.enable_streaming:
                # 使用流式合成
                logger.info(f"使用流式合成: {text[:50]}...")
                self._synthesize_streaming(text, file_name)
            else:
                # 使用标准合成
                logger.info(f"使用标准合成: {text[:50]}...")
                self._synthesize_standard(text, file_name)

            logger.info(f"✓ 音频合成完成: {file_name}")
            return file_name

        except Exception as e:
            logger.error(f"Google TTS 合成失败: {e}")
            logger.exception(e)
            return ""

    def _synthesize_streaming(self, text: str, output_file: str) -> None:
        """
        使用流式 API 合成语音

        Args:
            text: 要合成的文本
            output_file: 输出文件路径
        """
        from google.cloud import texttospeech_v1

        # 创建请求生成器
        def request_generator() -> Iterator[texttospeech_v1.StreamingSynthesizeRequest]:
            try:
                # 第一个请求：配置（只包含语音选择和基本配置）
                streaming_config = texttospeech_v1.StreamingSynthesizeConfig(
                    voice=texttospeech_v1.VoiceSelectionParams(
                        language_code=self.language_code,
                        name=self.voice_name,
                    ),
                )

                # 第一个请求：只发送 streaming_config
                # 不要在第一个请求中包含 audio_config，这会导致错误
                yield texttospeech_v1.StreamingSynthesizeRequest(
                    streaming_config=streaming_config
                )

                # 后续请求：文本输入
                # 一次性发送所有文本
                yield texttospeech_v1.StreamingSynthesizeRequest(
                    input=texttospeech_v1.StreamingSynthesisInput(text=text)
                )
            except Exception as e:
                logger.error(f"请求生成器错误: {e}")
                raise

        try:
            # 调用流式合成 API
            streaming_responses = self.client.streaming_synthesize(
                requests=request_generator()
            )

            # 收集音频数据
            audio_data = b""
            for response in streaming_responses:
                if response.audio_content:
                    audio_data += response.audio_content
                    logger.debug(f"收到音频块: {len(response.audio_content)} 字节")

            # 写入文件
            if audio_data:
                with open(output_file, "wb") as out:
                    out.write(audio_data)
                logger.info(f"流式合成完成，总大小: {len(audio_data)} 字节")
            else:
                logger.warning("流式合成未返回音频数据")

        except Exception as e:
            logger.error(f"流式合成失败，回退到标准合成: {e}")
            import traceback
            logger.debug(f"详细错误信息:\n{traceback.format_exc()}")
            # 如果流式失败，回退到标准合成
            self._synthesize_standard(text, output_file)

    def _synthesize_standard(self, text: str, output_file: str) -> None:
        """
        使用标准 API 合成语音（非流式）

        Args:
            text: 要合成的文本
            output_file: 输出文件路径
        """
        from google.cloud import texttospeech_v1

        # 构建合成输入
        synthesis_input = texttospeech_v1.SynthesisInput(text=text)

        # 配置语音参数
        voice = texttospeech_v1.VoiceSelectionParams(
            language_code=self.language_code,
            name=self.voice_name,
        )

        # 配置音频参数
        audio_config = texttospeech_v1.AudioConfig(
            audio_encoding=self.audio_encoding,
            sample_rate_hertz=self.sample_rate_hertz,
            speaking_rate=self.speaking_rate,
            pitch=self.pitch,
        )

        # 执行合成
        response = self.client.synthesize_speech(
            input=synthesis_input,
            voice=voice,
            audio_config=audio_config,
        )

        # 写入文件
        with open(output_file, "wb") as out:
            out.write(response.audio_content)

        logger.info(f"标准合成完成，大小: {len(response.audio_content)} 字节")


if __name__ == "__main__":
    # 测试示例
    tts = TTSEngine(
        voice_name="en-US-Neural2-A",
        language_code="en-US",
        audio_encoding="MP3",
        sample_rate_hertz=24000,
        speaking_rate=1.0,
        pitch=0.0,
        enable_streaming=True,
    )

    output_file = tts.generate_audio(
        "Hello! This is a test of Google Cloud Text-to-Speech streaming API.",
        "test_google_tts",
    )

    if output_file:
        print(f"音频已生成: {output_file}")
    else:
        print("音频生成失败")
