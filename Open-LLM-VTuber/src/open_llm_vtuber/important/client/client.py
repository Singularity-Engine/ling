import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

# 统一的OpenAI API密钥配置
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

def get_openai_client():
    """
    获取OpenAI客户端，使用与主对话系统一致的配置
    不指定base_url，让OpenAI使用默认配置以保证网络连接的一致性
    """
    client = OpenAI(api_key=OPENAI_API_KEY)
    return client

def get_openai_client_legacy():
    """
    遗留方法：使用环境变量配置的OpenAI客户端
    如果需要特定的base_url配置可以使用这个方法
    """
    base_url = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1")
    api_key = os.environ.get("OPENAI_API_KEY", OPENAI_API_KEY)
    return OpenAI(base_url=base_url, api_key=api_key)
