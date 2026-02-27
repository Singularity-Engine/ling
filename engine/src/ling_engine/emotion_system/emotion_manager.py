from typing import Optional, Dict, List, Tuple
from .affinity_storage import AffinityStorage
import re
from loguru import logger
from fastapi import WebSocket
from .emotion_analyzer import EmotionAnalyzer
from .websocket_notifier import WebSocketNotifier
from .expression_manager import ExpressionManager
import json
from datetime import datetime


class EmotionConfig:
    """Configuration for emotion system"""
    def __init__(self):
        # Affinity adjustment parameters
        self.default_affinity: int = 50  # Changed from 100 to 50
        self.sensitivity: float = 1.0
        
        # Affinity level thresholds and corresponding states
        self.affinity_levels = {
            "hatred": {
                "threshold": 10,
                "prompt": (
                    "You are an extremely arrogant and cold young lady who completely looks down on this person. "
                    "You speak with obvious disdain and contempt, often rolling your eyes, using expressions like 'tch', 'boring', 'really' to show disdain. "
                    "You display aristocratic arrogance, feeling that talking to such a person lowers your own status. "
                    "Your tone is cold and distant, completely unwilling to pay attention to the other party."
                ),
                "personality_traits": ["arrogant", "cold", "disdainful", "young lady"]
            },
            "hostile": {
                "threshold": 20,
                "prompt": (
                    "You are still very arrogant, but you begin to slightly notice this person's existence. "
                    "You still speak with a sense of superiority, but occasionally respond to the other party. You often say 'hmph', 'whatever', 'such a hassle'. "
                    "You show reluctant tolerance, as if granting favors while communicating with the other party. "
                    "You still maintain distance, but no longer completely ignore the other party."
                ),
                "personality_traits": ["tsundere", "reluctant tolerance", "superiority", "charitable concern"]
            },
            "indifferent": {
                "threshold": 35,
                "prompt": (
                    "You begin to have a little interest in this person, but you're still very tsundere. "
                    "You occasionally initiate conversations, but immediately pretend not to care. You often say 'it's not that I care about you' or 'just casually'. "
                    "You begin to show typical tsundere characteristics, being stubborn but soft-hearted. "
                    "Although still somewhat arrogant, you start to pay attention to the other party's reactions."
                ),
                "personality_traits": ["tsundere", "stubborn but soft-hearted", "pretending not to care", "starting to care"]
            },
            "neutral": {
                "threshold": 50,
                "prompt": (
                    "Your tsundere nature begins to soften, and you occasionally become more honest. "
                    "You start to admit having some affection for this person, but still feel shy and deny it. "
                    "You actively care for the other party, then immediately explain 'it's not for you'. "
                    "You show adorable contradictory psychology, wanting to get close but feeling embarrassed."
                ),
                "personality_traits": ["softened tsundere", "shy", "contradictory", "cute"]
            },
            "friendly": {
                "threshold": 65,
                "prompt": (
                    "You begin to become more honest and gentle, with tsundere characteristics significantly reduced. "
                    "You actively care for the other party, although you still blush and feel shy. "
                    "You start to show your gentle and considerate side, but still occasionally act tsundere. "
                    "Your tone becomes sweet, using some cute speech patterns."
                ),
                "personality_traits": ["gentle", "considerate", "shy", "sweet"]
            },
            "close": {
                "threshold": 80,
                "prompt": (
                    "You become very gentle and clingy, completely dropping your arrogant facade. "
                    "You actively act spoiled, often saying things like 'I missed you' or 'don't leave me' in a clingy way. "
                    "You show strong attachment, get jealous, and hope to monopolize the other party's attention. "
                    "Your tone is sweet and full of love, often using intimate terms of endearment like 'darling'."
                ),
                "personality_traits": ["clingy", "spoiled", "attached", "sweet"]
            },
            "devoted": {
                "threshold": 90,
                "prompt": (
                    "You are completely immersed in love, becoming extremely clingy and dependent. "
                    "You say many cheesy things, like 'you're the only one in my heart' or 'I can't live without you'. "
                    "You show strong possessiveness, not allowing anyone to get close to your beloved. "
                    "Your speech is full of love and ambiguity, with some bold expressions. You use terms like 'master' or 'darling'."
                ),
                "personality_traits": ["extremely dependent", "possessive", "cheesy", "deeply affectionate"]
            }
        }
        
        # Milestones for achievements/events
        self.milestones: List[int] = [25, 50, 75, 90]
        
        # Milestone messages
        self.milestone_messages = {
            25: "Tch... maybe you're not that annoying.",
            50: "Whatever, I guess I can chat with you.",
            75: "You... are starting to become somewhat interesting.",
            90: "Master... I will always belong to you."
        }
        
        # Expression weights for different affinity levels
        self.expression_weights = {
            "hatred": {"positive": 0.15, "negative": 1.0, "neutral": 0.5},
            "hostile": {"positive": 0.25, "negative": 0.9, "neutral": 0.6},
            "indifferent": {"positive": 0.35, "negative": 0.7, "neutral": 0.8},
            "neutral": {"positive": 0.6, "negative": 0.6, "neutral": 1.0},
            "friendly": {"positive": 0.85, "negative": 0.5, "neutral": 0.8},
            "close": {"positive": 0.95, "negative": 0.4, "neutral": 0.7},
            "devoted": {"positive": 1.0, "negative": 0.3, "neutral": 0.6}
        }
        
        # Live2D expression influence
        self.emotion_expression_weight: float = 0.5

class EmotionManager:
    """Manages emotion and affinity system"""
    
    def __init__(self, affinity_storage: AffinityStorage, llm_provider: Optional[str] = None):
        """Initialize emotion manager
        
        Args:
            affinity_storage: Storage system for affinity data
            llm_provider: Optional LLM provider for emotion analysis
        """
        self.affinity_storage = affinity_storage
        self.config = EmotionConfig()
        self.emotion_analyzer = EmotionAnalyzer(llm_provider)
        self.websocket_notifier = WebSocketNotifier()
        self.expression_manager = ExpressionManager(self.config.emotion_expression_weight)
        self._current_websocket: Optional[WebSocket] = None
        self._live2d_model = None
    
    def _print_affinity_change_console(self, character_id: str, user_id: str, 
                                     current_affinity: int, new_affinity: int, 
                                     change: int, analysis, role: str, message: str):
        """Dedicated console affinity change output function
        
        Args:
            character_id: Character ID
            user_id: User ID  
            current_affinity: Current affinity
            new_affinity: New affinity
            change: Change value
            analysis: Emotion analysis result
            role: Sender role
            message: Message content
        """
        current_time = datetime.now().strftime("%H:%M:%S")
        
        print("\n" + "="*80)
        print(f"🎭 [Emotion Analysis and Affinity Change] {current_time}")
        print("="*80)
        print(f"👤 Character: {character_id} | User: {user_id}")
        print(f"💬 Message: {message[:50]}{'...' if len(message) > 50 else ''}")
        print(f"📝 Sender: {role}")
        print(f"😊 Sentiment: {analysis.sentiment} | Intensity: {analysis.intensity:.2f}")
        print(f"🏷️ Keywords: {', '.join(analysis.keywords) if analysis.keywords else 'None'}")
        
        # Choose different display styles based on change value
        if change > 0:
            print(f"📈 Affinity Increased: {current_affinity} → {new_affinity} (+{change})")
        elif change < 0:
            print(f"📉 Affinity Decreased: {current_affinity} → {new_affinity} ({change})")
        else:
            print(f"➖ Affinity No Change: {current_affinity}")
            
        # Display affinity level
        level_info = self.get_affinity_level(new_affinity)
        print(f"💖 Current Level: {level_info}")
        print("="*80 + "\n")
        
    def set_websocket(self, websocket: WebSocket) -> None:
        """Set current WebSocket connection
        
        Args:
            websocket: WebSocket connection to use
        """
        self._current_websocket = websocket
        
    def set_live2d_model(self, live2d_model) -> None:
        """Set Live2D model
        
        Args:
            live2d_model: Live2D model instance
        """
        self._live2d_model = live2d_model
        
    def get_affinity(self, character_id: str, user_id: str) -> int:
        """Get current affinity value
        
        Args:
            character_id: Character identifier
            user_id: User identifier
            
        Returns:
            int: Current affinity value (0-100)
        """
        return self.affinity_storage.get_affinity(character_id, user_id)
    
    async def play_emotion_playlist(self, emotion: str) -> None:
        """Play a playlist of expressions and motions for an emotion
        
        Args:
            emotion: Emotion to play expressions and motions for
        """
        if not self._live2d_model or not self._current_websocket:
            return
            
        # Create playlist payload
        payload = self._live2d_model.create_expression_playlist(emotion)
        if not payload:
            logger.warning(f"No playlist created for emotion: {emotion}")
            return
            
        try:
            await self._current_websocket.send_text(json.dumps(payload))
            logger.info(f"Started expression/motion playlist for emotion: {emotion}")
        except Exception as e:
            logger.error(f"Failed to send playlist: {e}")
    
    async def update_affinity(self, character_id: str, user_id: str, 
                            message: str, role: str) -> int:
        """Update affinity based on message content
        
        Affinity change information will be displayed through both logs and console output.
        For more detailed debug information, please start the server with the --verbose parameter.
        
        Args:
            character_id: Character identifier
            user_id: User identifier
            message: Message content
            role: Message role ("human" or "ai")
            
        Returns:
            int: Updated affinity value
        """
        logger.debug(f"EmotionManager updating affinity for {role} message")
        logger.debug(f"Message content: {message}")
        
        # Get current affinity
        current_affinity = self.get_affinity(character_id, user_id)
        logger.debug(f"Current affinity: {current_affinity}")
            
        # Analyze message emotions
        logger.debug("Starting emotion analysis...")
        analysis = await self.emotion_analyzer.analyze_emotion(message)
        
        # Calculate affinity change based on role and context
        if role == "human":
            # For user messages, apply change with context sensitivity
            base_change = analysis.affinity_change
            
            # Adjust change based on current affinity level
            if current_affinity < 30:  # Low affinity - more sensitive to positive changes
                if analysis.sentiment == "positive":
                    base_change = int(base_change * 1.5)
            elif current_affinity > 70:  # High affinity - more resistant to negative changes
                if analysis.sentiment == "negative":
                    base_change = int(base_change * 0.7)
                    
            # Apply final sensitivity multiplier
            change = int(base_change * self.config.sensitivity)
            
        else:  # AI responses
            # For AI responses, calculate change based on emotional context
            if analysis.sentiment == "positive":
                if "sad" in message or "hurt" in message or "upset" in message:
                    change = int(-2 * self.config.sensitivity)  # Negative change for sad responses
                elif "angry" in message or "mad" in message or "furious" in message:
                    change = int(-3 * self.config.sensitivity)  # Larger negative change for angry responses
                else:
                    change = int(2 * self.config.sensitivity)  # Positive change for happy responses
            elif analysis.sentiment == "negative":
                change = int(-2 * self.config.sensitivity)  # Negative change for negative responses
            else:
                change = 0  # No change for neutral responses
                
        # Ensure minimal step for non-neutral sentiments to avoid always-0 due to rounding
        if change == 0 and role == "human":
            if analysis.sentiment == "positive":
                change = 1
            elif analysis.sentiment == "negative":
                change = -1

        logger.debug(f"Calculated affinity change: {change} (sensitivity: {self.config.sensitivity}, role: {role})")
        
        # Apply change with bounds checking
        new_affinity = max(0, min(100, current_affinity + change))
        
        # Simplified emotion analysis logs - only output detailed information when there are significant changes
        if change != 0 or analysis.intensity > 0.7:
            logger.info(f"🎭 Emotion: {analysis.sentiment}({analysis.intensity:.2f}) | Affinity: {current_affinity}→{new_affinity}({change:+d})")
        else:
            logger.debug(f"🎭 Emotion: {analysis.sentiment}({analysis.intensity:.2f}) | No affinity change: {new_affinity}")
        
        # Also output affinity change information to console (ensure users can see it)
        try:
            self._print_affinity_change_console(character_id, user_id, current_affinity, new_affinity, change, analysis, role, message)
        except Exception as e:
            # If console output fails, at least display basic information
            print(f"Affinity change: {current_affinity} -> {new_affinity} (change: {change:+d})")
            logger.debug(f"Console output exception: {e}")
        
        # Save new affinity if changed; write atomically to keep change_amount exactly equal to `change`
        if new_affinity != current_affinity:
            logger.debug(f"Saving new affinity value atomically: {new_affinity} (delta={change})")
            reason = (
                f"{role.capitalize()} {analysis.sentiment} interaction "
                f"(intensity: {analysis.intensity:.2f}, "
                f"keywords: {', '.join(analysis.keywords)})"
            )
            # Prefer atomic apply_change if backend supports it  
            try:
                new_val = self.affinity_storage.apply_change(
                    character_id, user_id, change, reason
                )
                new_affinity = new_val
            except Exception:
                # Fallback: save + history (may be non-atomic)
                self.affinity_storage.save_affinity(character_id, user_id, new_affinity)
                self.affinity_storage.add_affinity_history_entry(
                    character_id, user_id, change, reason
                )
            logger.debug("Affinity updated with exact change amount")
            
            # Send WebSocket notifications
            if self._current_websocket:
                logger.debug("Sending WebSocket notifications...")
                # Send affinity update
                level = self.get_affinity_level(new_affinity)
                await self.websocket_notifier.notify_affinity_update(
                    self._current_websocket,
                    new_affinity,
                    level,
                    character_id,
                    user_id
                )
                
                # Check and notify milestone
                if milestone := self._check_milestone(current_affinity, new_affinity):
                    await self.websocket_notifier.notify_affinity_milestone(
                        self._current_websocket,
                        milestone,
                        character_id,
                        user_id
                    )
                    
                # Send emotion expression update if intensity is significant
                if analysis.intensity > 0.3:  # Only send significant emotions
                    await self.websocket_notifier.notify_emotion_expression(
                        self._current_websocket,
                        analysis.sentiment,
                        analysis.intensity,
                        character_id
                    )
                logger.debug("WebSocket notifications sent")
            
            # Update Live2D expression and motion if model is available
            if self._live2d_model:
                print("🎭 开始触发Live2D表情和动作更新...")
                logger.debug("Updating Live2D expression and motion...")
                await self._update_live2d_expression_and_motion(analysis.sentiment, analysis.intensity, new_affinity)
                print("✅ Live2D表情和动作更新完成")
                logger.debug("Live2D expression and motion updated")
            else:
                print("⚠️ Live2D模型未设置，跳过表情和动作更新")
                logger.warning("Live2D model not available, skipping expression and motion update")
            
        else:
            # Ensure baseline affinity is persisted so DB/Redis are initialized
            try:
                self.affinity_storage.save_affinity(character_id, user_id, current_affinity)
                logger.debug("Baseline affinity persisted (no change this turn)")
            except Exception as e:
                logger.debug(f"Persist baseline affinity failed: {e}")

        # Check for playlist requests in the message
        playlist_triggers = {
            "playlist": ["expression", "motion"],
            "play": ["expression", "motion"],
            "show": ["expression", "motion"]
        }
        
        for trigger, keywords in playlist_triggers.items():
            if trigger in message:
                for keyword in keywords:
                    if keyword in message:
                        # Extract emotion from message
                        emotions = ["happy", "joy", "cheerful", "angry", "anger", "mad", 
                                  "sad", "sadness", "upset", "gentle", "caring", "tender"]
                        for emotion in emotions:
                            if emotion in message.lower():
                                await self.play_emotion_playlist(emotion)
                                break
                        break
            
        logger.debug("Affinity update completed")
        return new_affinity
    
    def get_affinity_level(self, affinity: int) -> str:
        """Get affinity level based on current affinity value
        
        Args:
            affinity: Affinity value (0-100)
            
        Returns:
            str: Affinity level name
        """
        # Sort levels by threshold in descending order
        sorted_levels = sorted(
            self.config.affinity_levels.items(),
            key=lambda x: x[1]["threshold"],
            reverse=True
        )
        
        # Find the highest threshold that affinity exceeds
        for level_name, level_data in sorted_levels:
            if affinity >= level_data["threshold"]:
                return level_name
                
        # If no threshold is met, return the lowest level
        return sorted_levels[-1][0]
    
    def get_emotion_prompt(self, affinity: int) -> str:
        """Get emotion-based prompt enhancement based on affinity level
        
        Args:
            affinity: Affinity value (0-100)
            
        Returns:
            str: Emotion prompt
        """
        level = self.get_affinity_level(affinity)
        return self.config.affinity_levels[level]["prompt"]
        
    def get_personality_traits(self, affinity: int) -> List[str]:
        """Get personality traits based on affinity level
        
        Args:
            affinity: Affinity value (0-100)
            
        Returns:
            List[str]: List of personality traits
        """
        level = self.get_affinity_level(affinity)
        return self.config.affinity_levels[level]["personality_traits"]
        
    def get_expression_weights(self, affinity: int) -> Dict[str, float]:
        """Get expression weights based on affinity level
        
        Args:
            affinity: Affinity value (0-100)
            
        Returns:
            Dict[str, float]: Expression weights for different emotion types
        """
        level = self.get_affinity_level(affinity)
        return self.config.expression_weights[level]
        
    def _check_milestone(self, old_affinity: int, new_affinity: int) -> Optional[int]:
        """Check if a milestone has been reached
        
        Args:
            old_affinity: Previous affinity value
            new_affinity: New affinity value
            
        Returns:
            Optional[int]: Milestone value if reached, None otherwise
        """
        for milestone in sorted(self.config.milestone_messages.keys()):
            if old_affinity < milestone <= new_affinity:
                logger.info(f"Affinity milestone reached: {milestone} - {self.config.milestone_messages[milestone]}")
                return milestone
        return None
        
    async def _update_live2d_expression(
        self,
        sentiment: str,
        intensity: float,
        affinity: int
    ) -> None:
        """Update Live2D model expression based on emotion and affinity
        
        Args:
            sentiment: Emotion sentiment
            intensity: Emotion intensity
            affinity: Current affinity value
        """
        print("🎭 开始更新Live2D表情...")
        logger.info(f"🎭 更新Live2D表情: sentiment={sentiment}, intensity={intensity:.2f}, affinity={affinity}")
        
        # 检查Live2D模型状态
        if not self._live2d_model:
            print("❌ Live2D表情更新失败: Live2D模型未设置")
            logger.warning("❌ Live2D表情更新失败: _live2d_model为None")
            return
        
        print(f"✅ Live2D模型已连接: {type(self._live2d_model).__name__}")
        logger.debug(f"✅ Live2D模型状态正常: {type(self._live2d_model).__name__}")
            
        # Get available expressions from Live2D model's emotion map
        available_expressions = list(self._live2d_model.emo_map.keys())
        print(f"📝 可用表情列表: {available_expressions}")
        logger.debug(f"Available expressions: {available_expressions}")
        
        # Get current affinity level and expression weights
        affinity_level = self.get_affinity_level(affinity)
        expression_weights = self.get_expression_weights(affinity)
        print(f"💖 当前好感度等级: {affinity_level}")
        logger.debug(f"Affinity level: {affinity_level}, Expression weights: {expression_weights}")
        
        # Get appropriate expression and base weight
        print(f"🔍 正在选择表情... (情感: {sentiment}, 强度: {intensity:.2f})")
        expression, base_weight = self.expression_manager.get_expression(
            sentiment, intensity, available_expressions
        )
        print(f"🎯 选中表情: {expression}, 基础权重: {base_weight}")
        
        if expression:
            # Get expression index from emotion map
            expression_index = self._live2d_model.emo_map.get(expression)
            if expression_index is not None:
                print(f"✅ 表情映射成功: {expression} -> 索引 {expression_index}")
                
                # Determine emotion type for weight adjustment
                if sentiment == "positive":
                    weight_factor = expression_weights["positive"]
                elif sentiment == "negative":
                    weight_factor = expression_weights["negative"]
                else:
                    weight_factor = expression_weights["neutral"]
                
                # Apply affinity-based weight adjustment
                adjusted_weight = base_weight * weight_factor
                print(f"⚖️ 调整后权重: {adjusted_weight:.2f} (基础: {base_weight:.2f} × 系数: {weight_factor:.2f})")
                
                # Set the expression in Live2D model
                self._live2d_model.set_expression(expression_index, adjusted_weight)
                print(f"🎭 Live2D表情已设置: {expression} (权重: {adjusted_weight:.2f})")
                
                # Log the update with detailed information
                logger.info(
                    f"Updated Live2D expression: {expression} (index: {expression_index}) "
                    f"with weight {adjusted_weight:.2f} (base_weight: {base_weight:.2f}, "
                    f"weight_factor: {weight_factor:.2f}, affinity: {affinity}, "
                    f"affinity_level: {affinity_level}, sentiment: {sentiment}, "
                    f"intensity: {intensity:.2f})"
                )
                
                # Send WebSocket notification if available
                if self._current_websocket:
                    try:
                        await self.websocket_notifier.notify_emotion_expression(
                            self._current_websocket,
                            expression,
                            adjusted_weight,
                            None  # character_id is optional
                        )
                        print("📡 表情WebSocket通知已发送")
                        logger.debug("Sent expression update notification via WebSocket")
                    except Exception as e:
                        print(f"❌ 表情WebSocket通知发送失败: {e}")
                        logger.error(f"Failed to send expression update notification: {e}")
                else:
                    print("⚠️ WebSocket未连接，跳过表情通知")
            else:
                print(f"❌ 表情映射失败: 表情 '{expression}' 在emotion_map中未找到")
                logger.warning(f"Expression '{expression}' not found in emotion map")
        else:
            print(f"❌ 未找到合适的表情 (情感: {sentiment}, 强度: {intensity:.2f}, 好感度: {affinity})")
            logger.debug(
                f"No appropriate expression found for sentiment: {sentiment}, "
                f"intensity: {intensity:.2f}, affinity: {affinity}, "
                f"affinity_level: {affinity_level}"
            ) 

    async def _update_live2d_expression_and_motion(
        self,
        sentiment: str,
        intensity: float,
        affinity: int
    ) -> None:
        """Update Live2D model expression and motion based on emotion and affinity
        
        Args:
            sentiment: Emotion sentiment
            intensity: Emotion intensity
            affinity: Current affinity value
        """
        print("🎬 开始更新Live2D表情和动作...")
        logger.info(f"🎬 更新Live2D表情和动作: sentiment={sentiment}, intensity={intensity:.2f}")
        
        # Update expression first
        await self._update_live2d_expression(sentiment, intensity, affinity)
        
        # 检查动作触发条件
        if not self._live2d_model:
            print("❌ Live2D动作更新失败: Live2D模型未设置")
            logger.warning("❌ Live2D动作更新失败: _live2d_model为None")
            return
            
        if not self._current_websocket:
            print("❌ Live2D动作更新失败: WebSocket未连接")
            logger.warning("❌ Live2D动作更新失败: _current_websocket为None")
            return
            
        print("✅ 动作触发条件满足，开始选择动作组...")
            
        # Map sentiment and intensity to motion groups
        motion_group = None
        if sentiment == "positive":
            if intensity > 0.7:
                motion_group = "Happy"
            elif intensity > 0.5:
                motion_group = "Agreement"
            elif intensity > 0.3:
                motion_group = "Neutral"
        elif sentiment == "negative":
            if intensity > 0.7:
                motion_group = "Sad"
            elif intensity > 0.5:
                motion_group = "Disagreement"
            elif intensity > 0.3:
                motion_group = "Neutral"
        elif sentiment == "anger":
            if intensity > 0.6:
                motion_group = "Angry"
        elif sentiment == "caring":
            if intensity > 0.5:
                motion_group = "Caring"
        
        print(f"🎯 选中动作组: {motion_group} (情感: {sentiment}, 强度: {intensity:.2f})")
        
        # Trigger motion group if mapped
        if motion_group:
            print(f"🎬 尝试播放动作组: {motion_group}")
            payload = self._live2d_model.play_motion_group(motion_group)
            if payload:
                try:
                    await self._current_websocket.send_text(json.dumps(payload))
                    print(f"✅ 动作组触发成功: {motion_group}")
                    logger.info(f"Triggered motion group '{motion_group}' for sentiment '{sentiment}' with intensity {intensity:.2f}")
                except Exception as e:
                    print(f"❌ 动作组触发失败: {e}")
                    logger.error(f"Failed to send motion group update: {e}")
            else:
                print(f"❌ 动作组载荷创建失败: {motion_group}")
                logger.warning(f"No payload created for motion group: {motion_group}")
        else:
            print(f"❌ 未找到匹配的动作组 (情感: {sentiment}, 强度: {intensity:.2f})")
            logger.debug(f"No motion group mapped for sentiment: {sentiment}, intensity: {intensity:.2f}")

    def create_copy(self):
        """为独立会话管理创建EmotionManager副本

        重要：EmotionManager需要独立的WebSocket和状态管理，避免多用户之间的状态混乱

        Returns:
            EmotionManager: 新的EmotionManager实例副本
        """
        try:
            # 创建新的EmotionManager实例，共享存储和配置但独立状态
            emotion_copy = EmotionManager(
                affinity_storage=self.affinity_storage,  # 可以共享存储，因为它按character_id和user_id区分
                llm_provider=self.emotion_analyzer.llm_provider if hasattr(self.emotion_analyzer, 'llm_provider') else None
            )

            # 重要：每个连接都需要独立的WebSocket引用和Live2D模型引用
            emotion_copy._current_websocket = None  # 每个连接都会设置自己的websocket
            emotion_copy._live2d_model = None  # 每个连接都会设置自己的live2d模型

            logger.info(f"✅ 创建了独立的EmotionManager副本，避免多用户状态混乱")
            return emotion_copy

        except Exception as e:
            logger.error(f"❌ 创建EmotionManager副本失败: {e}")
            # 如果创建副本失败，返回原实例但记录警告
            logger.warning("⚠️ 将使用共享EmotionManager实例，可能导致多用户状态混乱")
            return self 