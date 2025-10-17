"""
使用LangChain与MCP工具的示例
"""
import asyncio
import logging
import os
import sys
from typing import Dict, Any

# 确保可以导入本地模块
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

# 第三方库导入
try:
    from dotenv import load_dotenv
    from langchain.schema import HumanMessage
    from langchain_ollama import ChatOllama
    from langgraph.prebuilt import create_react_agent
except ImportError as e:
    print(f'\n错误: 未找到所需的包: {e}')
    print('请确保已安装所有必需的包\n')
    sys.exit(1)

# 本地模块导入
from test import convert_mcp_to_langchain_tools

# 简单的日志记录器
def init_logger() -> logging.Logger:
    logging.basicConfig(
        level=logging.INFO,  # logging.DEBUG,
        format='\x1b[90m[%(levelname)s]\x1b[0m %(message)s'
    )
    return logging.getLogger()

async def run() -> None:
    # 确保加载环境变量
    load_dotenv()

    # 根据需要设置API密钥
    if os.environ.get('ANTHROPIC_API_KEY') is None and 'anthropic' in os.environ.get('MODEL_PROVIDER', '').lower():
        raise Exception('需要设置ANTHROPIC_API_KEY环境变量')
    
    if os.environ.get('OPENAI_API_KEY') is None and 'openai' in os.environ.get('MODEL_PROVIDER', '').lower():
        raise Exception('需要设置OPENAI_API_KEY环境变量')

    try:
        # 配置MCP工具
        mcp_configs = {
            'filesystem': {
                'command': 'npx',
                'args': [
                    '-y',
                    '@modelcontextprotocol/server-filesystem',
                    '.'  # 允许访问的目录路径
                ],
                'description': '文件系统工具，可以读取、写入和管理文件'
            },
            'fetch': {
                'command': 'uvx',
                'args': [
                    'mcp-server-fetch'
                ],
                'description': '网络请求工具，可以获取网页内容和API数据'
            },
            'weather': {
                'command': 'npx',
                'args': [
                    '-y',
                    '@h1deya/mcp-server-weather'
                ],
                'description': '天气查询工具，可以获取全球各地的天气信息'
            },
        }
        
        # 初始化日志记录器
        logger = init_logger()
        
        # 转换MCP配置为LangChain工具
        logger.info("正在初始化MCP工具...")
        tools, cleanup = await convert_mcp_to_langchain_tools(mcp_configs, logger)
        
        # 初始化LLM
        model_name = os.environ.get('MODEL_NAME', 'qwen2.5:72b')
        logger.info(f"正在初始化LLM: {model_name}")
        llm = ChatOllama(model=model_name)
        
        # 创建Agent
        logger.info("正在创建Agent...")
        agent = create_react_agent(llm, tools)
        
        # 测试一些查询
        queries = [
            "查看明天的天气",
            "从北京到上海的驾车路线",
            "查询深圳的天气"
        ]

        for query in queries:
            logger.info(f"\x1b[33m处理查询: {query}\x1b[0m")
            
            messages = [HumanMessage(content=query)]
            result = await agent.ainvoke({'messages': messages})
            
            # 获取最后一条消息作为响应
            response = result['messages'][-1].content
            logger.info(f"\x1b[36m助手回复: {response}\x1b[0m")
        
    finally:
        # 确保清理资源
        if 'cleanup' in locals() and cleanup is not None:
            logger.info("正在清理资源...")
            await cleanup()

def main() -> None:
    """主函数"""
    asyncio.run(run())

if __name__ == '__main__':
    main() 