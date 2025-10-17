import json
import os
from loguru import logger
from .client.client import get_openai_client
from ..utils.token_counter import token_stats, TokenCalculator, TokenUsage

# 使用统一的OpenAI客户端
try:
    client = get_openai_client()
    logger.info("记忆功能OpenAI客户端初始化成功")
except Exception as e:
    logger.error(f"记忆功能OpenAI客户端初始化失败: {e}")
    client = None


def process_content(content):
    """处理传入的内容：判断重要性并在重要时生成总结、权重和三元组，同时对三元组中的宾语进行分类"""
    if not content or len(content.strip()) < 5:
        return False, "内容过短，无需处理", 0, []

    prompt = f"""你现在是一个用户私人AI记忆评估专家，请判断以下用户与AI猫娘的对话内容对于用户来说是否重要，并评估其权重。以下类型的内容通常被认为是重要的：

1. 用户表达的个人计划和安排（如旅行、约会、工作安排等）
2. 用户的重要决定和想法
3. 需要后续跟进的事项
4. 有价值的信息和学习要点
5. 用户与AI之间的重要互动和承诺
6. 用户表达的特殊情感或重要事件
7. 任何用户明确表示为"重要"的内容
8. 用户的私人信息（如生日、姓名、好朋友、家庭成员等个人信息）
9. 用户的兴趣爱好和偏好（如喜欢的运动、音乐、食物等）

内容: {content}

请按以下格式回答：
重要性：[重要/不重要]
总结：[如果重要，请用中文对重要内容进行简明扼要的总结，保留关键信息和要点；如果不重要，请填写"无"。特别注意：要准确识别用户实际提供的信息，不要凭空推断。如果用户说"我的名字是"但没有提供具体名字，总结应该反映用户尚未提供完整信息。]
权重：[如果重要，请给出一个1到10的权重评分，1表示最低，10表示最高；如果不重要，请填写0]
三元组：[如果重要，请从原始内容中提取所有可以识别出的三元组，以 (主体, 动作, 客体) 的格式返回一个 JSON 数组；如果不重要，请填写[]。确保提取的三元组准确、完整且有意义，避免提取不相关或不准确的信息。对于具有唯一性的个人信息（如姓名、年龄等），请确保无论用户如何表述（如"我的姓名是小明"或"我的名字叫小明"），生成的动作和客体都使用统一的标准词，例如统一使用"姓名是"作为动作，"小明"作为客体。]
分类结果：[如果有三元组，请对每个三元组的宾语（即客体）进行分类，返回一个 JSON 数组，每个元素是一个类别标签，例如‘运动’、‘音乐’、‘食物’、‘人物’等。如果无法确定，返回‘其他’。如果没有三元组，请填写[]。]
唯一性标记：[如果有三元组，请对每个三元组判断是否具有唯一性（如姓名、年龄等个人信息通常是唯一的），返回一个 JSON 数组，每个元素是一个布尔值（true表示唯一，false表示非唯一）。如果没有三元组，请填写[]。]

例如：
重要性：重要
总结：用户喜欢打羽毛球，这是一个重要的个人爱好信息。
权重：6
三元组：[["用户", "喜欢", "打羽毛球"]]
分类结果：["运动"]
唯一性标记：[false]

重要性：重要
总结：用户计划明天去成都旅行，并邀请小明，这是一个重要的个人安排。
权重：8
三元组：[["用户", "计划", "成都旅行"], ["用户", "邀请", "小明"]]
分类结果：["旅行", "人物"]
唯一性标记：[false, false]

重要性：重要
总结：用户提到了姓名信息但尚未提供具体姓名，这是一个重要的个人信息话题。
权重：5
三元组：[["用户", "提到", "姓名信息"]]
分类结果：["人物"]
唯一性标记：[false]

重要性：不重要
总结：无
权重：0
三元组：[]
分类结果：[]
唯一性标记：[]"""

    try:
        # 检查客户端是否可用
        if client is None:
            logger.error("记忆功能暂时禁用 - OpenAI客户端不可用")
            return False, "记忆功能暂时禁用", 0, []
            
        # 计算token使用量
        model_name = "gpt-4o-mini"
        calculator = TokenCalculator(model_name)
        
        messages = [
            {"role": "system",
             "content": "You are a professional assistant responsible for judging the importance of conversations between users and AI characters, summarizing important content, and evaluating content weight. Please pay special attention to users' personal arrangements, explicitly expressed importance, and items that need to be remembered. In user-AI interactions, users' personal plans, explicit needs, and private information are usually important. Pay special attention to handling expired information by inferring the latest information from context, applicable to all types of personal information updates. You also need to accurately extract triplet relationships from the original content and classify the objects of the triplets. Users' interests and hobbies are also important personal information that needs to be recorded. For unique personal information (such as name, age, etc.), please ensure accurate identification of information actually provided by users, and do not make unfounded inferences."},
            {"role": "user", "content": prompt}
        ]
        
        input_tokens = calculator.count_messages_tokens(messages).prompt_tokens
        
        response = client.chat.completions.create(
            model=model_name,
            messages=messages,
            temperature=0,
            max_tokens=600
        )
        
        # 获取输出token数量
        completion_tokens = len(response.choices[0].message.content.split()) * 1.3  # 近似估计
        
        # 记录token使用情况
        usage = TokenUsage(
            prompt_tokens=input_tokens,
            completion_tokens=int(completion_tokens),
            total_tokens=input_tokens + int(completion_tokens)
        )
        
        # 估算成本
        cost_info = calculator.estimate_cost(usage)
        
        # 添加到统计
        token_stats.add_usage(
            model=model_name,
            usage=usage,
            cost=cost_info.total_cost,
            metadata={
                "service_type": "important_content_processing",
                "content_length": len(content)
            }
        )
        
        logger.info(f"[Token跟踪] 重要性分析: {model_name}, 输入Token: {input_tokens}, " +
                  f"输出Token: {int(completion_tokens)}, 总成本: ${cost_info.total_cost:.6f}")

        result = response.choices[0].message.content.strip()

        # 解析响应
        lines = result.split('\n')
        importance = ""
        summary = ""
        weight = 0
        triples = []
        categories = []
        uniqueness_flags = []

        for line in lines:
            if line.startswith("重要性："):
                importance = line.split("：", 1)[1].strip()
            elif line.startswith("总结："):
                summary = line.split("：", 1)[1].strip()
            elif line.startswith("权重："):
                weight_str = line.split("：", 1)[1].strip()
                try:
                    weight = int(weight_str) if weight_str.isdigit() else 0
                except ValueError:
                    weight = 0
            elif line.startswith("三元组："):
                triples_str = line.split("：", 1)[1].strip()
                try:
                    triples = json.loads(triples_str)
                except Exception:
                    triples = []
            elif line.startswith("分类结果："):
                categories_str = line.split("：", 1)[1].strip()
                try:
                    categories = json.loads(categories_str)
                except Exception:
                    categories = []
            elif line.startswith("唯一性标记："):
                uniqueness_str = line.split("：", 1)[1].strip()
                try:
                    uniqueness_flags = json.loads(uniqueness_str)
                except Exception:
                    uniqueness_flags = []

        if '重要' in importance and summary != "无":
            
            # 将分类结果与三元组结合，并包含唯一性标记
            categorized_triples = []
            for i, triple in enumerate(triples):
                category = categories[i] if i < len(categories) else "其他"
                is_unique = uniqueness_flags[i] if i < len(uniqueness_flags) else False
                categorized_triples.append(triple + [category, is_unique])
            return True, summary, weight if 1 <= weight <= 10 else 5, categorized_triples
        else:
            return False, "内容不重要，无需总结", 0, []

    except Exception as e:
        return False, "处理失败", 0, []
