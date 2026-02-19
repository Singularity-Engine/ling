# config_manager/tts.py
from pydantic import Field, model_validator
from typing import Literal, Optional, Dict, ClassVar
from .i18n import I18nMixin, Description


class AzureTTSConfig(I18nMixin):
    """Configuration for Azure TTS service."""

    api_key: str = Field(..., alias="api_key")
    region: str = Field(..., alias="region")
    voice: str = Field(..., alias="voice")
    pitch: str = Field(..., alias="pitch")
    rate: str = Field(..., alias="rate")

    DESCRIPTIONS: ClassVar[Dict[str, Description]] = {
        "api_key": Description(
            en="API key for Azure TTS service", zh="Azure TTS 服务的 API 密钥"
        ),
        "region": Description(
            en="Azure region (e.g., eastus)", zh="Azure 区域（如 eastus）"
        ),
        "voice": Description(
            en="Voice name to use for Azure TTS", zh="Azure TTS 使用的语音名称"
        ),
        "pitch": Description(en="Pitch adjustment percentage", zh="音高调整百分比"),
        "rate": Description(en="Speaking rate adjustment", zh="语速调整"),
    }


class BarkTTSConfig(I18nMixin):
    """Configuration for Bark TTS."""

    voice: str = Field(..., alias="voice")

    DESCRIPTIONS: ClassVar[Dict[str, Description]] = {
        "voice": Description(
            en="Voice name to use for Bark TTS", zh="Bark TTS 使用的语音名称"
        ),
    }


class EdgeTTSConfig(I18nMixin):
    """Configuration for Edge TTS."""

    voice: str = Field(..., alias="voice")

    DESCRIPTIONS: ClassVar[Dict[str, Description]] = {
        "voice": Description(
            en="Voice name to use for Edge TTS (use 'edge-tts --list-voices' to list available voices)",
            zh="Edge TTS 使用的语音名称（使用 'edge-tts --list-voices' 列出可用语音）",
        ),
    }


class CosyvoiceTTSConfig(I18nMixin):
    """Configuration for Cosyvoice TTS."""

    client_url: str = Field(..., alias="client_url")
    mode_checkbox_group: str = Field(..., alias="mode_checkbox_group")
    sft_dropdown: str = Field(..., alias="sft_dropdown")
    prompt_text: str = Field(..., alias="prompt_text")
    prompt_wav_upload_url: str = Field(..., alias="prompt_wav_upload_url")
    prompt_wav_record_url: str = Field(..., alias="prompt_wav_record_url")
    instruct_text: str = Field(..., alias="instruct_text")
    seed: int = Field(..., alias="seed")
    api_name: str = Field(..., alias="api_name")

    DESCRIPTIONS: ClassVar[Dict[str, Description]] = {
        "client_url": Description(
            en="URL of the CosyVoice Gradio web UI", zh="CosyVoice Gradio Web UI 的 URL"
        ),
        "mode_checkbox_group": Description(
            en="Mode checkbox group value", zh="模式复选框组值"
        ),
        "sft_dropdown": Description(en="SFT dropdown value", zh="SFT 下拉框值"),
        "prompt_text": Description(en="Prompt text", zh="提示文本"),
        "prompt_wav_upload_url": Description(
            en="URL for prompt WAV file upload", zh="提示音频文件上传 URL"
        ),
        "prompt_wav_record_url": Description(
            en="URL for prompt WAV file recording", zh="提示音频文件录制 URL"
        ),
        "instruct_text": Description(en="Instruction text", zh="指令文本"),
        "seed": Description(en="Random seed", zh="随机种子"),
        "api_name": Description(en="API endpoint name", zh="API 端点名称"),
    }


class Cosyvoice2TTSConfig(I18nMixin):
    """Configuration for Cosyvoice2 TTS."""

    client_url: str = Field(..., alias="client_url")
    mode_checkbox_group: str = Field(..., alias="mode_checkbox_group")
    sft_dropdown: str = Field(..., alias="sft_dropdown")
    prompt_text: str = Field(..., alias="prompt_text")
    prompt_wav_upload_url: str = Field(..., alias="prompt_wav_upload_url")
    prompt_wav_record_url: str = Field(..., alias="prompt_wav_record_url")
    instruct_text: str = Field(..., alias="instruct_text")
    stream: bool = Field(..., alias="stream")
    seed: int = Field(..., alias="seed")
    speed: float = Field(..., alias="speed")
    api_name: str = Field(..., alias="api_name")

    DESCRIPTIONS: ClassVar[Dict[str, Description]] = {
        "client_url": Description(
            en="URL of the CosyVoice Gradio web UI", zh="CosyVoice Gradio Web UI 的 URL"
        ),
        "mode_checkbox_group": Description(
            en="Mode checkbox group value", zh="模式复选框组值"
        ),
        "sft_dropdown": Description(en="SFT dropdown value", zh="SFT 下拉框值"),
        "prompt_text": Description(en="Prompt text", zh="提示文本"),
        "prompt_wav_upload_url": Description(
            en="URL for prompt WAV file upload", zh="提示音频文件上传 URL"
        ),
        "prompt_wav_record_url": Description(
            en="URL for prompt WAV file recording", zh="提示音频文件录制 URL"
        ),
        "instruct_text": Description(en="Instruction text", zh="指令文本"),
        "stream": Description(en="Streaming inference", zh="流式推理"),
        "seed": Description(en="Random seed", zh="随机种子"),
        "speed": Description(en="Speech speed multiplier", zh="语速倍数"),
        "api_name": Description(en="API endpoint name", zh="API 端点名称"),
    }


class MeloTTSConfig(I18nMixin):
    """Configuration for Melo TTS."""

    speaker: str = Field(..., alias="speaker")
    language: str = Field(..., alias="language")
    device: str = Field("auto", alias="device")
    speed: float = Field(1.0, alias="speed")

    DESCRIPTIONS: ClassVar[Dict[str, Description]] = {
        "speaker": Description(
            en="Speaker name (e.g., EN-Default, ZH)",
            zh="说话人名称（如 EN-Default、ZH）",
        ),
        "language": Description(
            en="Language code (e.g., EN, ZH)", zh="语言代码（如 EN、ZH）"
        ),
        "device": Description(
            en="Device to use (auto, cpu, cuda, cuda:0, mps)",
            zh="使用的设备（auto、cpu、cuda、cuda:0、mps）",
        ),
        "speed": Description(en="Speech speed multiplier", zh="语速倍数"),
    }


class XTTSConfig(I18nMixin):
    """Configuration for XTTS."""

    api_url: str = Field(..., alias="api_url")
    speaker_wav: str = Field(..., alias="speaker_wav")
    language: str = Field(..., alias="language")

    DESCRIPTIONS: ClassVar[Dict[str, Description]] = {
        "api_url": Description(
            en="URL of the XTTS API endpoint", zh="XTTS API 端点的 URL"
        ),
        "speaker_wav": Description(
            en="Speaker reference WAV file", zh="说话人参考音频文件"
        ),
        "language": Description(
            en="Language code (e.g., en, zh)", zh="语言代码（如 en、zh）"
        ),
    }


class GPTSoVITSConfig(I18nMixin):
    """Configuration for GPT-SoVITS."""

    api_url: str = Field(..., alias="api_url")
    text_lang: str = Field(..., alias="text_lang")
    ref_audio_path: str = Field(..., alias="ref_audio_path")
    prompt_lang: str = Field(..., alias="prompt_lang")
    prompt_text: str = Field(..., alias="prompt_text")
    text_split_method: str = Field(..., alias="text_split_method")
    batch_size: str = Field(..., alias="batch_size")
    media_type: str = Field(..., alias="media_type")
    streaming_mode: str = Field(..., alias="streaming_mode")

    DESCRIPTIONS: ClassVar[Dict[str, Description]] = {
        "api_url": Description(
            en="URL of the GPT-SoVITS API endpoint", zh="GPT-SoVITS API 端点的 URL"
        ),
        "text_lang": Description(en="Language of the input text", zh="输入文本的语言"),
        "ref_audio_path": Description(
            en="Path to reference audio file", zh="参考音频文件路径"
        ),
        "prompt_lang": Description(en="Language of the prompt", zh="提示词语言"),
        "prompt_text": Description(en="Prompt text", zh="提示文本"),
        "text_split_method": Description(
            en="Method for splitting text", zh="文本分割方法"
        ),
        "batch_size": Description(en="Batch size for processing", zh="处理批次大小"),
        "media_type": Description(en="Output media type", zh="输出媒体类型"),
        "streaming_mode": Description(en="Enable streaming mode", zh="启用流式模式"),
    }


class FishAPITTSConfig(I18nMixin):
    """Configuration for Fish API TTS."""

    api_key: str = Field(..., alias="api_key")
    reference_id: str = Field(..., alias="reference_id")
    latency: Literal["normal", "balanced"] = Field(..., alias="latency")
    base_url: str = Field(..., alias="base_url")

    DESCRIPTIONS: ClassVar[Dict[str, Description]] = {
        "api_key": Description(
            en="API key for Fish TTS service", zh="Fish TTS 服务的 API 密钥"
        ),
        "reference_id": Description(
            en="Voice reference ID from Fish Audio website",
            zh="来自 Fish Audio 网站的语音参考 ID",
        ),
        "latency": Description(
            en="Latency mode (normal or balanced)", zh="延迟模式（normal 或 balanced）"
        ),
        "base_url": Description(
            en="Base URL for Fish TTS API", zh="Fish TTS API 的基础 URL"
        ),
    }


class CoquiTTSConfig(I18nMixin):
    """Configuration for Coqui TTS."""

    model_name: str = Field(..., alias="model_name")
    speaker_wav: str = Field("", alias="speaker_wav")
    language: str = Field(..., alias="language")
    device: str = Field("", alias="device")

    DESCRIPTIONS: ClassVar[Dict[str, Description]] = {
        "model_name": Description(
            en="Name of the TTS model to use", zh="要使用的 TTS 模型名称"
        ),
        "speaker_wav": Description(
            en="Path to speaker WAV file for voice cloning",
            zh="用于声音克隆的说话人音频文件路径",
        ),
        "language": Description(
            en="Language code (e.g., en, zh)", zh="语言代码（如 en、zh）"
        ),
        "device": Description(
            en="Device to use (cuda, cpu, or empty for auto)",
            zh="使用的设备（cuda、cpu 或留空以自动选择）",
        ),
    }


class SherpaOnnxTTSConfig(I18nMixin):
    """Configuration for Sherpa Onnx TTS."""

    vits_model: str = Field(..., alias="vits_model")
    vits_lexicon: Optional[str] = Field(None, alias="vits_lexicon")
    vits_tokens: str = Field(..., alias="vits_tokens")
    vits_data_dir: Optional[str] = Field(None, alias="vits_data_dir")
    vits_dict_dir: Optional[str] = Field(None, alias="vits_dict_dir")
    tts_rule_fsts: Optional[str] = Field(None, alias="tts_rule_fsts")
    max_num_sentences: int = Field(2, alias="max_num_sentences")
    sid: int = Field(1, alias="sid")
    provider: Literal["cpu", "cuda", "coreml"] = Field("cpu", alias="provider")
    num_threads: int = Field(1, alias="num_threads")
    speed: float = Field(1.0, alias="speed")
    debug: bool = Field(False, alias="debug")

    DESCRIPTIONS: ClassVar[Dict[str, Description]] = {
        "vits_model": Description(en="Path to VITS model file", zh="VITS 模型文件路径"),
        "vits_lexicon": Description(
            en="Path to lexicon file (optional)", zh="词典文件路径（可选）"
        ),
        "vits_tokens": Description(en="Path to tokens file", zh="词元文件路径"),
        "vits_data_dir": Description(
            en="Path to espeak-ng data directory (optional)",
            zh="espeak-ng 数据目录路径（可选）",
        ),
        "vits_dict_dir": Description(
            en="Path to Jieba dictionary directory (optional)",
            zh="结巴词典目录路径（可选）",
        ),
        "tts_rule_fsts": Description(
            en="Path to rule FSTs file (optional)", zh="规则 FST 文件路径（可选）"
        ),
        "max_num_sentences": Description(
            en="Maximum number of sentences per batch", zh="每批次最大句子数"
        ),
        "sid": Description(
            en="Speaker ID for multi-speaker models", zh="多说话人模型的说话人 ID"
        ),
        "provider": Description(
            en="Computation provider (cpu, cuda, or coreml)",
            zh="计算提供者（cpu、cuda 或 coreml）",
        ),
        "num_threads": Description(en="Number of computation threads", zh="计算线程数"),
        "speed": Description(en="Speech speed multiplier", zh="语速倍数"),
        "debug": Description(en="Enable debug mode", zh="启用调试模式"),
    }


class ElevenLabsTTSConfig(I18nMixin):
    """Configuration for ElevenLabs TTS."""

    api_key: str = Field(..., alias="api_key")
    voice_id: str = Field("JBFqnCBsd6RMkjVDRZzb", alias="voice_id")
    model_id: str = Field("eleven_multilingual_v2", alias="model_id")
    output_format: str = Field("mp3_44100_128", alias="output_format")
    stability: float = Field(0.5, alias="stability")
    similarity_boost: float = Field(0.5, alias="similarity_boost")
    style: float = Field(0.0, alias="style")
    use_speaker_boost: bool = Field(True, alias="use_speaker_boost")
    optimize_streaming_latency: int = Field(0, alias="optimize_streaming_latency")

    DESCRIPTIONS: ClassVar[Dict[str, Description]] = {
        "api_key": Description(
            en="API key for ElevenLabs TTS service", zh="ElevenLabs TTS 服务的 API 密钥"
        ),
        "voice_id": Description(
            en="Voice ID to use for ElevenLabs TTS", zh="ElevenLabs TTS 使用的语音 ID"
        ),
        "model_id": Description(
            en="Model ID for ElevenLabs TTS (e.g., eleven_multilingual_v2)",
            zh="ElevenLabs TTS 使用的模型 ID（如 eleven_multilingual_v2）",
        ),
        "output_format": Description(
            en="Output audio format (e.g., mp3_44100_128, wav_16000)",
            zh="输出音频格式（如 mp3_44100_128、wav_16000）",
        ),
        "stability": Description(
            en="Voice stability (0.0-1.0)", zh="语音稳定性 (0.0-1.0)"
        ),
        "similarity_boost": Description(
            en="Similarity boost (0.0-1.0)", zh="相似度增强 (0.0-1.0)"
        ),
        "style": Description(
            en="Style strength (0.0-1.0)", zh="风格强度 (0.0-1.0)"
        ),
        "use_speaker_boost": Description(
            en="Enable speaker boost", zh="启用说话者增强"
        ),
        "optimize_streaming_latency": Description(
            en="Streaming latency optimization level (0-4)",
            zh="流式延迟优化级别 (0-4)",
        ),
    }


class MiniMaxTTSConfig(I18nMixin):
    """Configuration for MiniMax TTS."""

    api_key: str = Field(..., alias="api_key")
    group_id: str = Field(..., alias="group_id")
    model: str = Field("speech-2.5-turbo-preview", alias="model")
    voice_id: str = Field("male-qn-qingse", alias="voice_id")
    speed: float = Field(1.0, alias="speed")
    vol: float = Field(1.0, alias="vol")
    pitch: int = Field(0, alias="pitch")
    sample_rate: int = Field(32000, alias="sample_rate")
    bitrate: int = Field(128000, alias="bitrate")
    format: Literal["mp3", "pcm", "flac"] = Field("mp3", alias="format")
    channel: int = Field(1, alias="channel")
    stream: bool = Field(True, alias="stream")

    DESCRIPTIONS: ClassVar[Dict[str, Description]] = {
        "api_key": Description(
            en="API key for MiniMax TTS service", zh="MiniMax TTS 服务的 API 密钥"
        ),
        "group_id": Description(
            en="Group ID for MiniMax TTS service", zh="MiniMax TTS 服务的组 ID"
        ),
        "model": Description(
            en="Model name for MiniMax TTS", zh="MiniMax TTS 使用的模型名称"
        ),
        "voice_id": Description(
            en="Voice ID for MiniMax TTS", zh="MiniMax TTS 使用的语音ID"
        ),
        "speed": Description(
            en="Speech speed (0.5-2.0)", zh="语速 (0.5-2.0)"
        ),
        "vol": Description(
            en="Volume (0.0-1.0)", zh="音量 (0.0-1.0)"
        ),
        "pitch": Description(
            en="Pitch adjustment (-12 to 12)", zh="音调调整 (-12 到 12)"
        ),
        "sample_rate": Description(
            en="Audio sample rate", zh="音频采样率"
        ),
        "bitrate": Description(
            en="Audio bitrate", zh="音频比特率"
        ),
        "format": Description(
            en="Audio format (mp3, pcm, flac)", zh="音频格式 (mp3, pcm, flac)"
        ),
        "channel": Description(
            en="Audio channels (1 or 2)", zh="音频通道数 (1 或 2)"
        ),
        "stream": Description(
            en="Enable streaming mode", zh="启用流式模式"
        ),
    }


class GoogleTTSConfig(I18nMixin):
    """Configuration for Google Cloud Text-to-Speech."""

    project_id: Optional[str] = Field(None, alias="project_id")
    credentials_json: Optional[str] = Field(None, alias="credentials_json")
    voice_name: str = Field("en-US-Neural2-A", alias="voice_name")
    language_code: str = Field("en-US", alias="language_code")
    audio_encoding: Literal["MP3", "LINEAR16", "OGG_OPUS", "MULAW", "ALAW"] = Field(
        "MP3", alias="audio_encoding"
    )
    sample_rate_hertz: int = Field(24000, alias="sample_rate_hertz")
    speaking_rate: float = Field(1.0, alias="speaking_rate")
    pitch: float = Field(0.0, alias="pitch")
    enable_streaming: bool = Field(False, alias="enable_streaming")

    DESCRIPTIONS: ClassVar[Dict[str, Description]] = {
        "project_id": Description(
            en="Google Cloud project ID (optional, inferred from credentials)",
            zh="Google Cloud 项目 ID（可选，从凭证中推断）",
        ),
        "credentials_json": Description(
            en="Path to Google Cloud credentials JSON file (optional, uses GOOGLE_APPLICATION_CREDENTIALS env var if not set)",
            zh="Google Cloud 凭证 JSON 文件路径（可选，未设置时使用环境变量 GOOGLE_APPLICATION_CREDENTIALS）",
        ),
        "voice_name": Description(
            en="Voice name (e.g., en-US-Neural2-A, cmn-CN-Wavenet-A)",
            zh="语音名称（如 en-US-Neural2-A、cmn-CN-Wavenet-A）",
        ),
        "language_code": Description(
            en="Language code (e.g., en-US, cmn-CN, ja-JP)",
            zh="语言代码（如 en-US、cmn-CN、ja-JP）",
        ),
        "audio_encoding": Description(
            en="Audio encoding format (MP3, LINEAR16, OGG_OPUS, MULAW, ALAW)",
            zh="音频编码格式（MP3、LINEAR16、OGG_OPUS、MULAW、ALAW）",
        ),
        "sample_rate_hertz": Description(
            en="Audio sample rate in Hz (16000, 24000, 32000, 48000)",
            zh="音频采样率（单位：Hz，可选 16000、24000、32000、48000）",
        ),
        "speaking_rate": Description(
            en="Speaking rate (0.25-4.0, default 1.0)",
            zh="语速（0.25-4.0，默认 1.0）",
        ),
        "pitch": Description(
            en="Pitch adjustment (-20.0 to 20.0, default 0.0)",
            zh="音高调整（-20.0 到 20.0，默认 0.0）",
        ),
        "enable_streaming": Description(
            en="Enable streaming synthesis (Note: Currently not working with Chirp 3 HD voices, use standard synthesis instead)",
            zh="启用流式合成（注意：当前 Chirp 3 HD 语音不支持流式合成，请使用标准合成）",
        ),
    }


class TTSConfig(I18nMixin):
    """Configuration for Text-to-Speech."""

    tts_model: Literal[
        "azure_tts",
        "bark_tts",
        "edge_tts",
        "cosyvoice_tts",
        "cosyvoice2_tts",
        "melo_tts",
        "coqui_tts",
        "x_tts",
        "gpt_sovits_tts",
        "fish_api_tts",
        "sherpa_onnx_tts",
        "elevenlabs_tts",  # 添加ElevenLabs TTS
        "minimax_tts",  # 添加MiniMax TTS
        "google_tts",  # 添加Google Cloud TTS
    ] = Field(..., alias="tts_model")

    azure_tts: Optional[AzureTTSConfig] = Field(None, alias="azure_tts")
    bark_tts: Optional[BarkTTSConfig] = Field(None, alias="bark_tts")
    edge_tts: Optional[EdgeTTSConfig] = Field(None, alias="edge_tts")
    cosyvoice_tts: Optional[CosyvoiceTTSConfig] = Field(None, alias="cosyvoice_tts")
    cosyvoice2_tts: Optional[Cosyvoice2TTSConfig] = Field(None, alias="cosyvoice2_tts")
    melo_tts: Optional[MeloTTSConfig] = Field(None, alias="melo_tts")
    coqui_tts: Optional[CoquiTTSConfig] = Field(None, alias="coqui_tts")
    x_tts: Optional[XTTSConfig] = Field(None, alias="x_tts")
    gpt_sovits_tts: Optional[GPTSoVITSConfig] = Field(None, alias="gpt_sovits")
    fish_api_tts: Optional[FishAPITTSConfig] = Field(None, alias="fish_api_tts")
    sherpa_onnx_tts: Optional[SherpaOnnxTTSConfig] = Field(
        None, alias="sherpa_onnx_tts"
    )
    elevenlabs_tts: Optional[ElevenLabsTTSConfig] = Field(None, alias="elevenlabs_tts")
    minimax_tts: Optional[MiniMaxTTSConfig] = Field(None, alias="minimax_tts")
    google_tts: Optional[GoogleTTSConfig] = Field(None, alias="google_tts")

    DESCRIPTIONS: ClassVar[Dict[str, Description]] = {
        "tts_model": Description(
            en="Text-to-speech model to use", zh="要使用的文本转语音模型"
        ),
        "azure_tts": Description(en="Configuration for Azure TTS", zh="Azure TTS 配置"),
        "bark_tts": Description(en="Configuration for Bark TTS", zh="Bark TTS 配置"),
        "edge_tts": Description(en="Configuration for Edge TTS", zh="Edge TTS 配置"),
        "cosyvoice_tts": Description(
            en="Configuration for Cosyvoice TTS", zh="Cosyvoice TTS 配置"
        ),
        "cosyvoice2_tts": Description(
            en="Configuration for Cosyvoice2 TTS", zh="Cosyvoice2 TTS 配置"
        ),
        "melo_tts": Description(en="Configuration for Melo TTS", zh="Melo TTS 配置"),
        "coqui_tts": Description(en="Configuration for Coqui TTS", zh="Coqui TTS 配置"),
        "x_tts": Description(en="Configuration for XTTS", zh="XTTS 配置"),
        "gpt_sovits_tts": Description(
            en="Configuration for GPT-SoVITS", zh="GPT-SoVITS 配置"
        ),
        "fish_api_tts": Description(
            en="Configuration for Fish API TTS", zh="Fish API TTS 配置"
        ),
        "sherpa_onnx_tts": Description(
            en="Configuration for Sherpa Onnx TTS", zh="Sherpa Onnx TTS 配置"
        ),
        "elevenlabs_tts": Description(
            en="Configuration for ElevenLabs TTS", zh="ElevenLabs TTS 配置"
        ),
        "minimax_tts": Description(
            en="Configuration for MiniMax TTS", zh="MiniMax TTS 配置"
        ),
        "google_tts": Description(
            en="Configuration for Google Cloud TTS", zh="Google Cloud TTS 配置"
        ),
    }

    @model_validator(mode="after")
    def check_tts_config(self) -> "TTSConfig":
        tts_model = self.tts_model

        # Only validate the selected TTS model
        if tts_model == "azure_tts" and self.azure_tts is not None:
            self.azure_tts.model_validate(self.azure_tts.model_dump())
        elif tts_model == "bark_tts" and self.bark_tts is not None:
            self.bark_tts.model_validate(self.bark_tts.model_dump())
        elif tts_model == "edge_tts" and self.edge_tts is not None:
            self.edge_tts.model_validate(self.edge_tts.model_dump())
        elif tts_model == "cosyvoice_tts" and self.cosyvoice_tts is not None:
            self.cosyvoice_tts.model_validate(self.cosyvoice_tts.model_dump())
        elif tts_model == "cosyvoice2_tts" and self.cosyvoice2_tts is not None:
            self.cosyvoice2_tts.model_validate(self.cosyvoice2_tts.model_dump())
        elif tts_model == "melo_tts" and self.melo_tts is not None:
            self.melo_tts.model_validate(self.melo_tts.model_dump())
        elif tts_model == "coqui_tts" and self.coqui_tts is not None:
            self.coqui_tts.model_validate(self.coqui_tts.model_dump())
        elif tts_model == "x_tts" and self.x_tts is not None:
            self.x_tts.model_validate(self.x_tts.model_dump())
        elif tts_model == "gpt_sovits_tts" and self.gpt_sovits_tts is not None:
            self.gpt_sovits_tts.model_validate(self.gpt_sovits_tts.model_dump())
        elif tts_model == "fish_api_tts" and self.fish_api_tts is not None:
            self.fish_api_tts.model_validate(self.fish_api_tts.model_dump())
        elif tts_model == "sherpa_onnx_tts" and self.sherpa_onnx_tts is not None:
            self.sherpa_onnx_tts.model_validate(self.sherpa_onnx_tts.model_dump())
        elif tts_model == "elevenlabs_tts" and self.elevenlabs_tts is not None:
            self.elevenlabs_tts.model_validate(self.elevenlabs_tts.model_dump())
        elif tts_model == "minimax_tts" and self.minimax_tts is not None:
            self.minimax_tts.model_validate(self.minimax_tts.model_dump())
        elif tts_model == "google_tts" and self.google_tts is not None:
            self.google_tts.model_validate(self.google_tts.model_dump())

        return self
