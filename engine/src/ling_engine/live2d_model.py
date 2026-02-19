import json
import chardet
from loguru import logger

# This class will only prepare the payload for the live2d model
# the process of sending the payload should be done by the caller
# This class is **Not responsible** for sending the payload to the server


class Live2dModel:
    """
    A class to represent a Live2D model. This class only prepares and stores the information of the Live2D model. It does not send anything to the frontend or server or anything.

    Attributes:
        model_dict_path (str): The path to the model dictionary file.
        live2d_model_name (str): The name of the Live2D model.
        model_info (dict): The information of the Live2D model.
        emo_map (dict): The emotion map of the Live2D model.
        emo_str (str): The string representation of the emotion map of the Live2D model.
        current_expression (dict): The current expression being displayed.
    """

    model_dict_path: str
    live2d_model_name: str
    model_info: dict
    emo_map: dict
    emo_str: str
    current_expression: dict

    def __init__(
        self, live2d_model_name: str, model_dict_path: str = "model_dict.json"
    ):
        self.model_dict_path: str = model_dict_path
        self.live2d_model_name: str = live2d_model_name
        self.current_expression = None
        self.set_model(live2d_model_name)

    def set_model(self, model_name: str) -> None:
        """
        Set the model with its name and load the model information. This method will initialize the `self.model_info`, `self.emo_map`, and `self.emo_str` attributes.
        This method is called in the constructor.

        Parameters:
            model_name (str): The name of the live2d model.

            Returns:
            None
        """

        self.model_info: dict = self._lookup_model_info(model_name)
        self.emo_map: dict = {
            k.lower(): v for k, v in self.model_info["emotionMap"].items()
        }
        self.emo_str: str = " ".join([f"[{key}]," for key in self.emo_map.keys()])
        # emo_str is a string of the keys in the emoMap dictionary. The keys are enclosed in square brackets.
        # example: `"[fear], [anger], [disgust], [sadness], [joy], [neutral], [surprise]"`
        print(f"🎨 生成的emo_str: {self.emo_str}")
        logger.info(f"🎨 Live2D模型 {model_name} 加载完成，表情映射: {self.emo_map}")

    def set_expression(self, expression_index: int, weight: float) -> None:
        """Set the current expression
        
        Args:
            expression_index: Expression index to display
            weight: Expression weight/intensity
        """
        self.current_expression = {
            'index': expression_index,
            'weight': weight
        }
        logger.debug(f"Set expression: index={expression_index}, weight={weight:.2f}")

    def play_motion_group(self, group_name: str) -> dict:
        """Play a group of motions defined in motionGroups

        Args:
            group_name: Name of the motion group to play

        Returns:
            dict: Payload for websocket containing motion group actions
        """
        motion_groups = self.model_info.get("motionGroups", {})
        if not motion_groups:
            logger.warning(f"No motion groups defined for model {self.live2d_model_name}")
            return {}

        motion_group = motion_groups.get(group_name, [])
        if not motion_group:
            logger.warning(f"Motion group '{group_name}' not found for model {self.live2d_model_name}")
            return {}

        logger.info(f"Playing motion group '{group_name}' with motions: {motion_group}")
        return {
            "type": "live2d-action",
            "actions": {
                "motions": motion_group
            }
        }

    def get_expressions_by_emotion(self, emotion: str) -> list:
        """Get all expression indices for a given emotion
        
        Args:
            emotion: Emotion name to find expressions for
            
        Returns:
            list: List of expression indices matching the emotion
        """
        expressions = []
        for emo, idx in self.emo_map.items():
            if emotion.lower() in emo.lower():
                expressions.append(idx)
        return expressions

    def get_motions_by_emotion(self, emotion: str) -> list:
        """Get all motion groups related to an emotion
        
        Args:
            emotion: Emotion name to find motions for
            
        Returns:
            list: List of motion group names related to the emotion
        """
        motion_groups = self.model_info.get("motionGroups", {})
        related_groups = []
        
        # Map emotions to potential group names
        emotion_group_mapping = {
            "joy": ["Happy", "Excitement"],
            "happy": ["Happy", "Excitement"],
            "sad": ["Sad"],
            "anger": ["Angry"],
            "caring": ["Caring"],
            "neutral": ["Neutral"],
            "agreement": ["Agreement", "Nod"],
            "disagreement": ["Disagreement", "Shake"]
        }
        
        # Get potential groups for this emotion
        potential_groups = emotion_group_mapping.get(emotion.lower(), [])
        
        # Add any group that exists in model's motion groups
        for group in potential_groups:
            if group in motion_groups:
                related_groups.append(group)
                
        return related_groups

    def create_expression_playlist(self, emotion: str) -> dict:
        """Create a playlist of expressions and motions for an emotion
        
        Args:
            emotion: Emotion to create playlist for
            
        Returns:
            dict: Payload containing expressions and motions to play
        """
        expressions = self.get_expressions_by_emotion(emotion)
        motion_groups = self.get_motions_by_emotion(emotion)
        
        if not expressions and not motion_groups:
            logger.warning(f"No expressions or motions found for emotion: {emotion}")
            return {}
            
        # Collect all motions from the motion groups
        all_motions = []
        for group in motion_groups:
            group_motions = self.model_info.get("motionGroups", {}).get(group, [])
            all_motions.extend(group_motions)
            
        logger.info(f"Created playlist for {emotion} with {len(expressions)} expressions and {len(all_motions)} motions")
        
        return {
            "type": "live2d-action",
            "actions": {
                "expressions": expressions,
                "motions": all_motions,
                "isPlaylist": True  # Flag to indicate this should be played as a sequence
            }
        }

    def _load_file_content(self, file_path: str) -> str:
        """Load the content of a file with robust encoding handling."""
        # Try common encodings first
        encodings = ["utf-8", "utf-8-sig", "gbk", "gb2312", "ascii"]

        for encoding in encodings:
            try:
                with open(file_path, "r", encoding=encoding) as file:
                    return file.read()
            except UnicodeDecodeError:
                continue

        # If all common encodings fail, try to detect encoding
        try:
            with open(file_path, "rb") as file:
                raw_data = file.read()
            detected = chardet.detect(raw_data)
            detected_encoding = detected["encoding"]

            if detected_encoding:
                try:
                    return raw_data.decode(detected_encoding)
                except UnicodeDecodeError:
                    pass
        except Exception as e:
            logger.error(f"Error detecting encoding for {file_path}: {e}")

        raise UnicodeError(f"Failed to decode {file_path} with any encoding")

    def _lookup_model_info(self, model_name: str) -> dict:
        """
        Find the model information from the model dictionary and return the information about the matched model.

        Parameters:
            model_name (str): The name of the live2d model.

        Returns:
            dict: The dictionary with the information of the matched model.

        Raises:
            FileNotFoundError if the model dictionary file is not found.

            json.JSONDecodeError if the model dictionary file is not a valid JSON file.

            KeyError if the model name is not found in the model dictionary.

        """

        self.live2d_model_name = model_name

        try:
            file_content = self._load_file_content(self.model_dict_path)
            model_dict = json.loads(file_content)
        except FileNotFoundError as file_e:
            logger.critical(
                f"Model dictionary file not found at {self.model_dict_path}."
            )
            raise file_e
        except json.JSONDecodeError as json_e:
            logger.critical(
                f"Error decoding JSON from model dictionary file at {self.model_dict_path}."
            )
            raise json_e
        except UnicodeError as uni_e:
            logger.critical(
                f"Error reading model dictionary file at {self.model_dict_path}."
            )
            raise uni_e
        except Exception as e:
            logger.critical(
                f"Error occurred while reading model dictionary file at {self.model_dict_path}."
            )
            raise e

        # Find the model in the model_dict
        matched_model = next(
            (model for model in model_dict if model["name"] == model_name), None
        )

        if matched_model is None:
            logger.critical(f"Unable to find {model_name} in {self.model_dict_path}.")
            raise KeyError(
                f"{model_name} not found in model dictionary {self.model_dict_path}."
            )

        # The feature: "translate model url to full url if it starts with '/' " is no longer implemented here

        logger.info("Model Information Loaded.")

        return matched_model

    def extract_emotion(self, str_to_check: str) -> list:
        """
        Check the input string for any emotion keywords and return a list of values (the expression index) of the emotions found in the string.

        Parameters:
            str_to_check (str): The string to check for emotions.

        Returns:
            list: A list of values of the emotions found in the string. An empty list is returned if no emotions are found.
        """

        # 添加详细的表情提取调试输出
        # print(f"🎭 表情提取开始 - 输入文本: {str_to_check}")
        # logger.debug(f"🎭 表情提取：分析文本长度 {len(str_to_check)} 字符")
        
        expression_list = []
        str_to_check = str_to_check.lower()
        
        # print(f"🔍 可用表情映射: {self.emo_map}")
        # logger.debug(f"🔍 表情映射键值: {list(self.emo_map.keys())}")

        i = 0
        while i < len(str_to_check):
            if str_to_check[i] != "[":
                i += 1
                continue
            for key in self.emo_map.keys():
                emo_tag = f"[{key}]"
                if str_to_check[i : i + len(emo_tag)] == emo_tag:
                    # print(f"✅ 找到表情标记: {emo_tag} -> 索引: {self.emo_map[key]}")
                    # logger.info(f"✅ 表情提取成功：{emo_tag} 映射到索引 {self.emo_map[key]}")
                    expression_list.append(self.emo_map[key])
                    i += len(emo_tag) - 1
                    break
            i += 1
        
        # print(f"🎯 表情提取结果: {expression_list}")
        # logger.info(f"🎯 表情提取完成：共找到 {len(expression_list)} 个表情 - {expression_list}")
        return expression_list

    def remove_emotion_keywords(self, target_str: str) -> str:
        """
        Remove the emotion keywords from the input string and return the cleaned string.

        Parameters:
            str_to_check (str): The string to check for emotions.

        Returns:
            str: The cleaned string with the emotion keywords removed.
        """

        lower_str = target_str.lower()

        for key in self.emo_map.keys():
            lower_key = f"[{key}]".lower()
            while lower_key in lower_str:
                start_index = lower_str.find(lower_key)
                end_index = start_index + len(lower_key)
                target_str = target_str[:start_index] + target_str[end_index:]
                lower_str = lower_str[:start_index] + lower_str[end_index:]
        return target_str
