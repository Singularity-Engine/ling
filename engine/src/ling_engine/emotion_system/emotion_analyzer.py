import re
from typing import Optional
from loguru import logger
from dataclasses import dataclass

@dataclass
class EmotionAnalysis:
    """Emotion analysis result"""
    sentiment: str
    intensity: float
    affinity_change: int
    keywords: list[str]
    language: str  # 'zh' | 'en' | 'other'

class EmotionAnalyzer:
    """Analyzes emotions in text using patterns or LLM"""
    
    def __init__(self, llm_provider: Optional[str] = None):
        """Initialize emotion analyzer
        
        Args:
            llm_provider: Optional LLM provider for analysis
        """
        self.llm_provider = llm_provider
        logger.info(f"Initializing EmotionAnalyzer with LLM provider: {llm_provider}")
        
        # Define emotion patterns (Chinese + English)
        self.patterns = {
            # Positive patterns
            "positive_zh": [
                r"喜欢", r"爱", r"棒", r"厉害", r"优秀", r"开心",
                r"快乐", r"高兴", r"感谢", r"谢谢", r"赞", r"真棒",
                r"可爱", r"温柔", r"亲切", r"友好", r"善良", r"体贴",
                r"努力", r"加油", r"支持", r"鼓励", r"表扬", r"夸奖",
                r"好评", r"点赞", r"牛", r"强", r"帅", r"美",
                r"完美", r"精彩", r"美好", r"喜悦", r"幸福", r"满意",
                r"舒服", r"舒心", r"惊喜", r"惊艳", r"赞美", r"欣赏",
                r"暖心", r"贴心", r"细心", r"用心", r"认真", r"负责",
                r"靠谱", r"信任", r"喜爱", r"热爱", r"钦佩", r"尊敬",
                r"宠", r"么么哒", r"mua", r"爱你", r"亲亲", r"抱抱"
            ],
            "positive_en": [
                r"love|like|admire|appreciate|adore|cherish|treasure",
                r"great|awesome|amazing|excellent|fantastic|nice|cool|brilliant|wonderful|superb|outstanding|remarkable|marvelous",
                r"happy|glad|delighted|joy|joyful|pleased|cheerful|merry|blissful|ecstatic|thrilled|elated",
                r"thanks|thank\s*you|appreciate|grateful|gratitude",
                r"cute|kind|friendly|gentle|sweet|lovely|adorable|charming|delightful",
                r"support|encourage|praise|compliment|well\s*done|good\s*job|bravo|kudos",
                r"perfect|flawless|impeccable|splendid|magnificent",
                r"respect|trust|admire|look\s*up\s*to",
                r"hugs|kisses|xoxo|<3|❤"
            ],
            
            # Negative patterns
            "negative_zh": [
                r"讨厌", r"恨", r"烦", r"滚", r"笨", r"蠢", r"傻",
                r"差", r"糟", r"坏", r"废物", r"垃圾", r"恶心",
                r"滚开", r"走开", r"闭嘴", r"住口", r"无聊", r"烦人",
                r"生气", r"愤怒", r"讽刺", r"嘲讽", r"不屑", r"丑",
                r"讨厌", r"厌恶", r"憎恨", r"讨厌", r"嫌弃", r"鄙视",
                r"气死", r"抓狂", r"郁闷", r"失望", r"沮丧", r"难过",
                r"伤心", r"悲伤", r"痛苦", r"不爽", r"不开心", r"不高兴",
                r"恶劣", r"可恶", r"可恨", r"令人厌恶", r"反感", r"排斥",
                r"瞧不起", r"看不起", r"藐视", r"轻视", r"侮辱", r"羞辱",
                r"失败", r"糟糕", r"可怕", r"恐怖", r"吓人", r"不行",
                # Profanity and common slangs (variations included)
                r"傻逼", r"煞笔", r"煞比", r"沙比", r"傻比", r"傻屄",
                r"傻[bB]", r"弱智", r"智障", r"脑残", r"脑瘫",
                r"(?i)(^|[^a-zA-Z])s\s*b([^a-zA-Z]|$)", r"(?i)shabi", r"(?i)sha\s*bi",
                r"(?i)nmsl", r"妈的", r"卧槽", r"操", r"艹", r"草"
            ],
            "negative_en": [
                r"hate|disgust|annoy|angry|mad|furious|upset|irritated|frustrated|enraged|livid",
                r"stupid|idiot|dumb|fool|moron|retard|imbecile|ignorant",
                r"trash|garbage|useless|worthless|terrible|awful|bad|worse|worst|horrible|dreadful|atrocious",
                r"shut\s*up|go\s*away|get\s*lost|leave\s*me\s*alone|piss\s*off|buzz\s*off",
                r"ugly|gross|nasty|disgusting|revolting|repulsive|vile|hideous",
                r"disappointed|sad|miserable|depressed|gloomy|unhappy|heartbroken",
                r"despise|loathe|detest|abhor|scorn|contempt",
                r"fail|failure|suck|pathetic|lame|weak",
                # Profanity (common)
                r"\b(fuck|shit|bitch|asshole|bastard|jerk|crap|damn|hell)\b"
            ],
            
            # Neutral patterns
            "neutral_zh": [
                r"哦", r"嗯", r"这样", r"是吗", r"知道了", r"明白",
                r"理解", r"可以", r"行", r"好的", r"嗯嗯", r"你好",
                r"hi", r"hello", r"hey", r"早上好", r"晚上好",
                r"下午好", r"再见", r"拜拜", r"好吧", r"那好",
                r"收到", r"了解", r"懂了", r"我看看", r"让我想想",
                r"有道理", r"也是", r"确实", r"的确", r"没错"
            ],
            "neutral_en": [
                r"ok|okay|fine|got\s*it|understood|noted|alright|roger|copy\s*that",
                r"hello|hi|hey|good\s*(morning|afternoon|evening)|bye|goodbye|see\s*ya|greetings",
                r"yes|no|maybe|sure|right|indeed|agreed|fair\s*enough|i\s*see|makes\s*sense"
            ]
        }
        
        # Define intensity modifiers (Chinese + English)
        self.intensity_modifiers = {
            # zh strong/weak/extreme/negation
            "很|非常|真|真的|特别|极|超级": 0.4,
            "有点|一点|稍微|略": -0.3,
            "太|最|完全|绝对": 0.5,
            "不|不是|没": -0.6,
            # en strong/weak/extreme/negation
            r"very|really|so|super|extremely|absolutely|totally|completely": 0.4,
            r"slightly|a\s*bit|somewhat|kinda|sort\s*of": -0.3,
            r"too|most|entirely|utterly": 0.5,
            r"not|isn't|aren't|don't|doesn't|didn't|no": -0.6,
            # Exclamation
            "！|!": 0.2,
            # Profanity boost
            r"(?i)(\b|^)(s\s*b|shabi|sha\s*bi|nmsl)(\b|$)|傻逼|煞笔|煞比|沙比|傻比|傻屄|弱智|智障|脑残|脑瘫": 0.4,
            r"\b(fuck|shit|bitch|asshole|bastard|jerk|crap)\b": 0.4,
        }
        
        # Define affinity changes
        self.affinity_changes = {
            "positive": {
                "base": 3,
                "high_intensity": 5
            },
            "negative": {
                "base": -5,
                "high_intensity": -8
            },
            "neutral": {
                "base": 1,  # Small positive change for neutral interactions
                "high_intensity": 2
            }
        }
        
        logger.info("Emotion patterns initialized")
        
    async def analyze_emotion(self, text: str) -> EmotionAnalysis:
        """Analyze emotion in text
        
        Args:
            text: Text to analyze
            
        Returns:
            EmotionAnalysis: Analysis results
        """
        logger.info(f"Analyzing text: {text}")
        
        if isinstance(text, str):
            content = text
        else:
            # Handle BatchInput case
            content = text.texts[0].content if hasattr(text, 'texts') else str(text)
            
        if self.llm_provider:
            try:
                return await self._analyze_with_llm(content)
            except Exception as e:
                logger.warning(f"LLM-based analysis failed: {e}")
                logger.warning("LLM-based analysis not implemented yet, falling back to pattern matching")
                return await self._analyze_with_patterns(content)
        else:
            return await self._analyze_with_patterns(content)
            
    async def _analyze_with_patterns(self, text: str) -> EmotionAnalysis:
        """Analyze emotion using pattern matching
        
        Args:
            text: Text to analyze
            
        Returns:
            EmotionAnalysis: Analysis results
        """
        # Initialize variables
        sentiment = "neutral"
        intensity = 0.2  # Default intensity
        keywords = []

        # Simple language detection (zh vs en vs other)
        def _detect_language(s: str) -> str:
            has_cjk = any('\u4e00' <= ch <= '\u9fff' for ch in s)
            has_latin = any(('a' <= ch.lower() <= 'z') for ch in s if ch.isalpha())
            if has_cjk and not has_latin:
                return "zh"
            if has_latin and not has_cjk:
                return "en"
            # Mixed: prefer zh if CJK present
            return "zh" if has_cjk else ("en" if has_latin else "other")

        language = _detect_language(text)
        
        # Check each pattern category
        max_intensity = 0.2
        sentiment_scores = {"positive": 0, "negative": 0, "neutral": 0}

        # pick lang-specific pattern sets
        pos_key = "positive_en" if language == "en" else "positive_zh"
        neg_key = "negative_en" if language == "en" else "negative_zh"
        neu_key = "neutral_en" if language == "en" else "neutral_zh"

        for pattern in self.patterns[pos_key]:
            for match in re.finditer(pattern, text, re.IGNORECASE):
                keywords.append(match.group())
                sentiment_scores["positive"] += 1
                max_intensity = max(max_intensity, 0.5)

        for pattern in self.patterns[neg_key]:
            for match in re.finditer(pattern, text, re.IGNORECASE):
                keywords.append(match.group())
                sentiment_scores["negative"] += 1
                max_intensity = max(max_intensity, 0.5)

        for pattern in self.patterns[neu_key]:
            for match in re.finditer(pattern, text, re.IGNORECASE):
                keywords.append(match.group())
                sentiment_scores["neutral"] += 1
                max_intensity = max(max_intensity, 0.3)
                    
        # Check modifiers
        modifier_impact = 0
        for modifier, impact in self.intensity_modifiers.items():
            if re.search(modifier, text):
                modifier_impact += impact
                
        # Determine final sentiment based on scores
        if sentiment_scores["positive"] > sentiment_scores["negative"]:
            sentiment = "positive"
        elif sentiment_scores["negative"] > sentiment_scores["positive"]:
            sentiment = "negative"
        else:
            sentiment = "neutral"
            
        # Calculate final intensity
        intensity = min(1.0, max(0.1, max_intensity + modifier_impact))
        
        # Adjust intensity based on keyword count
        total_keywords = len(keywords)
        if total_keywords > 1:
            intensity = min(1.0, intensity + 0.1 * (total_keywords - 1))
                
        # Calculate affinity change
        if sentiment in self.affinity_changes:
            base_change = self.affinity_changes[sentiment]["base"]
            if intensity > 0.7:  # High intensity threshold
                affinity_change = self.affinity_changes[sentiment]["high_intensity"]
            else:
                affinity_change = base_change

            # Adjust change based on intensity，确保至少有最小步进，避免取整为0
            raw_change = affinity_change * intensity

            # 确保好感度变化至少为±1（除非情感强度极低）
            if intensity >= 0.15:  # 只要有基本的情感强度
                if raw_change > 0:
                    affinity_change = max(1, int(round(raw_change)))  # 正向至少+1
                elif raw_change < 0:
                    affinity_change = min(-1, int(round(raw_change)))  # 负向至少-1
                else:
                    affinity_change = 0
            else:
                affinity_change = int(round(raw_change))  # 强度太低时可以为0
        else:
            affinity_change = 0
            
        logger.info(f"Analysis result - Sentiment: {sentiment}, Intensity: {intensity:.2f}, Change: {affinity_change}")
        
        return EmotionAnalysis(
            sentiment=sentiment,
            intensity=intensity,
            affinity_change=affinity_change,
            keywords=keywords,
            language=language,
        )

    async def _analyze_with_llm(self, text: str) -> EmotionAnalysis:
        """Analyze emotion using LLM
        
        Args:
            text: Text to analyze
            
        Returns:
            EmotionAnalysis: Analysis results
        """
        # TODO: Implement LLM-based analysis in the future
        logger.warning("LLM-based analysis not implemented yet, falling back to pattern matching")
        return await self._analyze_with_patterns(text) 