from typing import Dict, List, Optional, Tuple
from loguru import logger

class ExpressionManager:
    """Manages Live2D expressions based on emotions"""
    
    def __init__(self, emotion_expression_weight: float = 0.5):
        """Initialize expression manager
        
        Args:
            emotion_expression_weight: Weight of emotion influence on expressions (0.0-1.0)
        """
        self.emotion_expression_weight = emotion_expression_weight
        
        # Define emotion to expression mappings with priorities
        self.emotion_expressions = {
            # Positive emotions - high priority expressions first
            "positive": {
                "high": ["joy", "excited", "happy", "smile"],
                "medium": ["smile", "happy", "smirk"],
                "low": ["smile", "neutral"]
            },
            # Negative emotions
            "negative": {
                "high": ["anger", "disgust", "sadness"],
                "medium": ["sadness", "worry", "fear"],
                "low": ["neutral", "worry"]
            },
            # Neutral emotions - with slight positive bias
            "neutral": {
                "high": ["neutral", "smirk"],
                "medium": ["neutral", "smile"],
                "low": ["neutral"]
            }
        }
        
        # Define expression transition rules
        self.transition_rules = {
            # From positive
            "positive": {
                "positive": 1.0,  # Keep full intensity
                "neutral": 0.5,   # Half intensity
                "negative": 0.3   # Low intensity
            },
            # From negative
            "negative": {
                "positive": 0.3,  # Low intensity
                "neutral": 0.5,   # Half intensity
                "negative": 1.0   # Keep full intensity
            },
            # From neutral
            "neutral": {
                "positive": 0.7,  # High intensity
                "neutral": 1.0,   # Keep full intensity
                "negative": 0.7   # High intensity
            }
        }
        
        # Track current expression state
        self.current_expression = None
        self.current_sentiment = "neutral"
        self.current_intensity = 0.2
        
    def get_expression(
        self,
        sentiment: str,
        intensity: float,
        available_expressions: List[str]
    ) -> Tuple[Optional[str], float]:
        """Get appropriate Live2D expression for emotion
        
        Args:
            sentiment: Emotion sentiment ("positive", "negative", "neutral")
            intensity: Emotion intensity (0.0-1.0)
            available_expressions: List of available Live2D expressions
            
        Returns:
            Tuple[Optional[str], float]: Selected expression and its weight,
                                       or (None, 0.0) if no suitable expression
        """
        # Convert available expressions to lowercase for case-insensitive matching
        available_expressions = [expr.lower() for expr in available_expressions]
        logger.debug(f"Available expressions (lowercase): {available_expressions}")
        
        # Determine intensity level
        if intensity >= 0.7:
            level = "high"
        elif intensity >= 0.3:
            level = "medium"
        else:
            level = "low"
            
        # Get candidate expressions for this emotion and intensity
        candidates = self.emotion_expressions.get(sentiment, {}).get(level, [])
        logger.debug(f"Candidate expressions for {sentiment} ({level}): {candidates}")
        
        # Find first available expression from candidates
        selected_expression = None
        for expression in candidates:
            if expression in available_expressions:
                selected_expression = expression
                break
                
        if selected_expression:
            # Calculate base weight
            base_weight = intensity * self.emotion_expression_weight
            
            # Apply transition rules if we have a previous expression
            if self.current_expression:
                transition_factor = self.transition_rules[self.current_sentiment][sentiment]
                base_weight *= transition_factor
                logger.debug(
                    f"Applied transition from {self.current_sentiment} to {sentiment} "
                    f"(factor: {transition_factor:.2f})"
                )
            
            # Update current state
            self.current_expression = selected_expression
            self.current_sentiment = sentiment
            self.current_intensity = intensity
            
            logger.debug(
                f"Selected expression {selected_expression} with base weight {base_weight:.2f} "
                f"for {sentiment} emotion (intensity: {intensity:.2f})"
            )
            return selected_expression, base_weight
            
        # If no suitable expression found, use neutral with low weight
        if "neutral" in available_expressions:
            logger.debug("No suitable expression found, using neutral")
            return "neutral", 0.2
            
        # No suitable expression found
        logger.debug("No suitable expression found")
        return None, 0.0
        
    def adjust_expression_weight(
        self,
        expression: str,
        base_weight: float,
        affinity: int
    ) -> float:
        """Adjust expression weight based on affinity
        
        Args:
            expression: Expression name
            base_weight: Base expression weight
            affinity: Current affinity value
            
        Returns:
            float: Adjusted expression weight
        """
        # Positive expressions get stronger with higher affinity
        positive_expressions = {"happy", "excited", "smile", "joy", "smirk"}
        if expression.lower() in positive_expressions:
            affinity_factor = affinity / 100.0
            adjusted_weight = base_weight * (1.0 + affinity_factor)
            logger.debug(
                f"Adjusted {expression} weight: {base_weight:.2f} -> {adjusted_weight:.2f} "
                f"(affinity: {affinity})"
            )
            return min(adjusted_weight, 1.0)
            
        # Negative expressions get weaker with higher affinity
        negative_expressions = {"sad", "angry", "upset", "worried", "fear", "disgust"}
        if expression.lower() in negative_expressions:
            affinity_factor = affinity / 100.0
            adjusted_weight = base_weight * (1.0 - affinity_factor * 0.5)
            logger.debug(
                f"Adjusted {expression} weight: {base_weight:.2f} -> {adjusted_weight:.2f} "
                f"(affinity: {affinity})"
            )
            return max(adjusted_weight, 0.1)
            
        # Neutral expressions get slight boost with higher affinity
        if expression.lower() == "neutral":
            affinity_factor = affinity / 100.0
            adjusted_weight = base_weight * (1.0 + affinity_factor * 0.2)
            logger.debug(
                f"Adjusted neutral weight: {base_weight:.2f} -> {adjusted_weight:.2f} "
                f"(affinity: {affinity})"
            )
            return min(adjusted_weight, 0.8)  # Cap neutral at 0.8
            
        # Other expressions unchanged
        return base_weight 