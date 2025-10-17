from typing import Optional, Any, Dict, AsyncIterator
from loguru import logger
import sys
from pathlib import Path

# Add the project root to Python path
project_root = str(Path(__file__).parent.parent.parent.parent)
if project_root not in sys.path:
    sys.path.append(project_root)

from src.open_llm_vtuber.agent.agents.basic_memory_agent import BasicMemoryAgent
from .emotion_manager import EmotionManager
from src.open_llm_vtuber.agent.input_types import BatchInput

class EmotionalBasicMemoryAgent(BasicMemoryAgent):
    """Basic memory agent with emotion support"""
    
    def __init__(self, llm, system, live2d_model, emotion_manager: EmotionManager, **kwargs):
        """Initialize emotional agent
        
        Args:
            llm: Language model instance
            system: System prompt
            live2d_model: Live2D model instance
            emotion_manager: Emotion manager instance
            **kwargs: Additional arguments for BasicMemoryAgent
        """
        super().__init__(llm, system, live2d_model, **kwargs)
        self._emotion_manager = emotion_manager
        self._character_id = None
        self._user_id = None
        logger.info("EmotionalBasicMemoryAgent initialized with emotion manager")
        
    def set_memory_from_history(self, conf_uid: str, history_uid: str) -> None:
        """Load memory from history and set up emotion tracking
        
        Args:
            conf_uid: Configuration unique identifier
            history_uid: History unique identifier
        """
        super().set_memory_from_history(conf_uid, history_uid)
        
        # Set character and user IDs for emotion tracking
        self._character_id = conf_uid
        self._user_id = history_uid.split('_')[0] if '_' in history_uid else history_uid
        
        # Get current affinity and enhance system prompt
        affinity = self._emotion_manager.get_affinity(self._character_id, self._user_id)
        emotion_prompt = self._emotion_manager.get_emotion_prompt(affinity)
        enhanced_system = f"{self._system}\n\n{emotion_prompt}"
        self.set_system(enhanced_system)
        
        logger.info(f"Initialized emotional agent with affinity {affinity}")
        
    def _chat_function_factory(
        self, chat_func: Any
    ) -> Any:
        """Override chat function factory to add emotion processing
        
        Args:
            chat_func: Original chat function
            
        Returns:
            Modified chat function with emotion processing
        """
        original_chat_func = super()._chat_function_factory(chat_func)
        
        async def emotional_chat(input_data: BatchInput) -> AsyncIterator[Any]:
            """Chat implementation with emotion processing
            
            Args:
                input_data: User input data
                
            Returns:
                AsyncIterator[Any]: Response stream
            """
            logger.debug("EmotionalBasicMemoryAgent starting chat processing")
            
            # Process user input first (only human triggers emotion system)
            if self._character_id and self._user_id:
                # Convert input to text
                user_text = self._to_text_prompt(input_data)
                logger.debug(f"Processing user input: {user_text}")
                
                # Update affinity based on user input
                logger.debug("Updating affinity based on user input...")
                await self._emotion_manager.update_affinity(
                    self._character_id,
                    self._user_id,
                    user_text,
                    "human"
                )
                logger.debug("User input affinity update completed")
            
            # Get response from original chat function
            logger.debug("Getting response from base chat...")
            async for response in original_chat_func(input_data):
                # 注意：不再基于AI回复更新情绪
                yield response
            
            logger.debug("EmotionalBasicMemoryAgent chat processing completed")
            
        return emotional_chat
        
    async def _process_response(self, response: str) -> str:
        """Process agent response and update affinity
        
        Args:
            response: Agent response text
            
        Returns:
            str: Processed response text
        """
        # 注意：不再基于AI回复更新情绪
        return await super()._process_response(response)
        
    def _to_text_prompt(self, input_data: Any) -> str:
        """Convert input data to text
        
        Args:
            input_data: Input data
            
        Returns:
            str: Text representation of input
        """
        if isinstance(input_data, str):
            return input_data
        elif isinstance(input_data, dict):
            return input_data.get("text", "")
        elif hasattr(input_data, "text"):
            return input_data.text
        else:
            return str(input_data)