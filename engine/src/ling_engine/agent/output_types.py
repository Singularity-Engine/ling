from dataclasses import dataclass, asdict
from typing import List, Optional
from abc import ABC, abstractmethod


@dataclass
class Actions:
    """Represents actions that can be performed alongside text output"""

    expressions: Optional[List[str] | List[int]] = None
    pictures: Optional[List[str]] = None
    sounds: Optional[List[str]] = None
    motions: Optional[List[str]] = None
    def to_dict(self) -> dict:
        """Convert Actions object to a dictionary for JSON serialization"""
        return {k: v for k, v in asdict(self).items() if v is not None}


class BaseOutput(ABC):
    """Base class for agent outputs that can be iterated"""

    @abstractmethod
    def __aiter__(self):
        """Make the output iterable"""
        pass


@dataclass
class DisplayText:
    """Text to be displayed with optional metadata"""

    text: str
    name: Optional[str] = "AI"  # Keep the name field for frontend display
    avatar: Optional[str] = None
    is_partial: bool = True  # 是否为分句显示
    sentence_index: Optional[int] = None  # 句子索引
    total_sentences: Optional[int] = None  # 总句子数

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization"""
        result = {"text": self.text, "name": self.name, "avatar": self.avatar}
        if self.is_partial:
            result.update({
                "is_partial": self.is_partial,
                "sentence_index": self.sentence_index,
                "total_sentences": self.total_sentences
            })
        return result

    def __str__(self) -> str:
        """String representation for logging"""
        if self.is_partial:
            return f"{self.name} ({self.sentence_index+1}/{self.total_sentences}): {self.text}"
        return f"{self.name}: {self.text}"


@dataclass
class SentenceOutput(BaseOutput):
    """
    Output type for text-based responses.
    Contains a single sentence pair (display and TTS) with associated actions.

    Attributes:
        display_text: Text to be displayed in UI
        tts_text: Text to be sent to TTS engine
        actions: Associated actions (expressions, pictures, sounds)
        tool_calls: Optional list of tool calls to be made
        tool_output: Optional tool execution result
    """

    display_text: DisplayText  # Changed from str to DisplayText
    tts_text: str  # Text for TTS
    actions: Actions
    tool_calls: Optional[List[dict]] = None  # 工具调用列表
    tool_output: Optional[dict] = None  # 工具调用结果

    async def __aiter__(self):
        """Yield the sentence pair and actions"""
        yield self.display_text, self.tts_text, self.actions


@dataclass
class AudioOutput(BaseOutput):
    """Output type for audio-based responses"""

    audio_path: str
    display_text: DisplayText  # Changed from str to DisplayText
    transcript: str  # Original transcript
    actions: Actions

    async def __aiter__(self):
        """Iterate through audio segments and their actions"""
        yield self.audio_path, self.display_text, self.transcript, self.actions
