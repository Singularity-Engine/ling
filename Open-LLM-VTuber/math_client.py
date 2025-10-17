import asyncio
import logging
import sys
import traceback
import argparse
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.prebuilt import create_react_agent
from langchain_openai import ChatOpenAI
import functools
from langchain_core.messages import HumanMessage
import yaml

# 配置命令行参数
parser = argparse.ArgumentParser(description="MCP客户端 - 连接数学和天气服务")
parser.add_argument("--local", action="store_true", help="使用本地服务器而不是远程服务器")
parser.add_argument("--math-server", type=str, default="stdio", help="数学服务器传输类型 (stdio/sse)")
parser.add_argument("--weather-server", type=str, default="sse", help="天气服务器传输类型 (stdio/sse)")
parser.add_argument("--verbose", action="store_true", help="显示详细日志")
args = parser.parse_args()

# 配置日志
log_level = logging.DEBUG if args.verbose else logging.INFO
logging.basicConfig(level=log_level, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# 超时设置（秒）
TOOLS_TIMEOUT = 30
API_CALL_TIMEOUT = 60

CONF_PATH = r"F:\vtuber\Open-LLM-VTuber\Open-LLM-VTuber\conf.yaml"

def _load_llm_from_conf():
    try:
        with open(CONF_PATH, "r", encoding="utf-8") as f:
            conf = yaml.safe_load(f)

        char_conf = conf.get("character_config", {})
        agent_conf = char_conf.get("agent_config", {})
        agent_settings = agent_conf.get("agent_settings", {})
        basic_agent = agent_settings.get("basic_memory_agent", {})
        llm_provider = basic_agent.get("llm_provider", "openai_compatible_llm")
        llm_pool = agent_conf.get("llm_configs", {})
        llm_cfg = llm_pool.get(llm_provider, {})

        api_key = llm_cfg.get("llm_api_key")
        model = llm_cfg.get("model", "gpt-4o-mini")
        temperature = llm_cfg.get("temperature", 0.7)
        base_url = llm_cfg.get("base_url")
        if not base_url and "deepseek" in llm_provider:
            base_url = "https://api.deepseek.com/v1"

        kwargs = {
            "model": model,
            "temperature": temperature,
            "request_timeout": 30,
        }
        if api_key:
            kwargs["api_key"] = api_key
        if base_url:
            kwargs["base_url"] = base_url

        logger.info(f"使用 LLM 提供商: {llm_provider}, 模型: {model}, base_url: {base_url or '默认'}")
        return ChatOpenAI(**kwargs)
    except Exception as e:
        logger.error(f"读取 {CONF_PATH} 失败，回退默认: {e}")
        return ChatOpenAI(
            model="gpt-4o-mini",
            temperature=0.7,
            request_timeout=30
        )

# 初始化 LLM（读取 conf.yaml）
llm = _load_llm_from_conf()

# 带超时的异步函数装饰器
def async_timeout(timeout):
    def decorator(func):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            try:
                return await asyncio.wait_for(func(*args, **kwargs), timeout=timeout)
            except asyncio.TimeoutError:
                logger.error(f"函数 {func.__name__} 执行超时 (>{timeout}秒)")
                raise TimeoutError(f"操作超时，请稍后重试")
        return wrapper
    return decorator

# 错误处理函数
def handle_error(e, context=""):
    """详细处理错误并提供有用的错误信息"""
    error_type = type(e).__name__
    error_msg = str(e)
    
    # 获取完整的错误堆栈
    exc_type, exc_value, exc_traceback = sys.exc_info()
    stack_trace = traceback.format_exception(exc_type, exc_value, exc_traceback)
    
    # 记录详细错误信息到日志
    logger.error(f"{context} - {error_type}: {error_msg}")
    logger.debug("".join(stack_trace))
    
    # 根据错误类型返回用户友好的错误消息
    if isinstance(e, asyncio.TimeoutError) or isinstance(e, TimeoutError):
        return f"请求超时。请检查您的网络连接或稍后重试。"
    elif isinstance(e, ConnectionError):
        return f"连接错误。无法连接到服务器，请检查您的网络连接。"
    elif "API key" in error_msg.lower():
        return f"API密钥错误。请检查您的API密钥是否有效。"
    elif "rate limit" in error_msg.lower():
        return f"请求频率限制。请稍后再试。"
    else:
        return f"发生错误: {error_type} - {error_msg}"

# 解析并输出结果
def print_optimized_result(agent_response):
    """
    解析代理响应并输出优化后的结果。
    :param agent_response: 代理返回的完整响应
    """
    try:
        logger.info("开始解析代理响应")
        logger.info(f"代理响应类型: {type(agent_response)}")
        logger.info(f"代理响应内容: {agent_response}")
        
        messages = agent_response.get("messages", [])
        steps = []  # 用于记录计算步骤
        final_answer = None  # 最终答案

        logger.info(f"收到 {len(messages)} 条消息")
        for message in messages:
            logger.info(f"处理消息类型: {message.type if hasattr(message, 'type') else '未知类型'}")
            if hasattr(message, "additional_kwargs") and "tool_calls" in message.additional_kwargs:
                # 提取工具调用信息
                tool_calls = message.additional_kwargs["tool_calls"]
                for tool_call in tool_calls:
                    tool_name = tool_call["function"]["name"]
                    tool_args = tool_call["function"]["arguments"]
                    logger.info(f"工具调用: {tool_name} 参数: {tool_args}")
                    steps.append(f"调用工具: {tool_name}({tool_args})")
            elif message.type == "tool":
                # 提取工具执行结果
                tool_name = message.name
                tool_result = message.content
                logger.info(f"工具结果: {tool_name} 结果: {tool_result}")
                steps.append(f"{tool_name} 的结果是: {tool_result}")
            elif message.type == "ai":
                # 提取最终答案
                final_answer = message.content
                logger.info(f"AI回答: {final_answer[:100]}..." if final_answer else "AI没有回答")

        # 打印优化后的结果
        print("\n计算过程:")
        for step in steps:
            print(f"- {step}")
        if final_answer:
            print(f"\n最终答案: {final_answer}")
        else:
            logger.warning("没有找到最终答案")
            print("\n未能获取到回答，请重试。")
    except Exception as e:
        error_msg = handle_error(e, "解析代理响应时")
        print(f"\n处理结果时出错: {error_msg}")

# 获取服务器配置
def get_server_config():
    """根据命令行参数获取服务器配置"""
    if args.local:
        logger.info("使用本地服务器")
        return {
            "math": {
                "command": ["python", "lm/math_server.py"],
                "transport": args.math_server
            },
            "weather": {
                "command": ["python", "lm/weather_server.py"],
                "transport": args.weather_server
            }
        }
    else:
        logger.info("使用远程服务器")
        return {
            "math": {
                "url": "https://mcp.api-inference.modelscope.net/b7998bf872884c/sse",
                "transport": "sse"
            },
            "weather": {
                "url": "https://mcp.api-inference.modelscope.net/2b080ffd061a49/sse",
                "transport": "sse"
            },
            "time": {
                "url": "https://mcp.api-inference.modelscope.net/b7998bf872884c/sse",
                "transport": "sse"
            },
            "mcp_tool": {
                "url": "https://mcp.api-inference.modelscope.net/2b080ffd061a49/sse",
                "transport": "sse"
            },
            "howtocook-mcp": {
                "url": "https://mcp.api-inference.modelscope.net/88ccabb5f2594b/sse",
                "transport": "sse"
            },
            "mcp-trends-hub": {
                "url": "https://mcp.api-inference.modelscope.net/271f9017e41846/sse",
                "transport": "sse"
            },
            "12306-mcp": {
                "url": "https://mcp.api-inference.modelscope.net/a2b13a13761647/sse",
                "transport": "sse"
            }
        }

# 启动本地服务器
async def start_local_servers():
    """启动本地服务器进程"""
    if not args.local:
        return None, None
    
    try:
        logger.info("正在启动本地数学服务器...")
        math_server = await asyncio.create_subprocess_exec(
            "python", "lm/math_server.py",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        logger.info(f"数学服务器启动成功，PID: {math_server.pid}")
        
        logger.info("正在启动本地天气服务器...")
        weather_server = await asyncio.create_subprocess_exec(
            "python", "lm/weather_server.py",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        logger.info(f"天气服务器启动成功，PID: {weather_server.pid}")
        
        return math_server, weather_server
    except Exception as e:
        error_msg = handle_error(e, "启动本地服务器时")
        print(f"启动本地服务器失败: {error_msg}")
        return None, None

# 定义异步主函数
async def main():
    logger.info("程序启动")
    
    # 启动本地服务器（如果需要）
    math_server, weather_server = await start_local_servers()
    
    # MultiServerMCPClient 是用于连接多个 MCP 服务器的客户端。
    client = None
    try:
        server_config = get_server_config()
        client = MultiServerMCPClient(server_config)
        logger.info("MCP客户端创建成功")

        # 获取工具
        logger.info("正在获取工具...")
        try:
            tools = await asyncio.wait_for(client.get_tools(), timeout=TOOLS_TIMEOUT)
            logger.info(f"成功获取 {len(tools)} 个工具")
            for tool in tools:
                logger.info(f"工具名称: {tool.name}, 描述: {tool.description[:50]}...")
        except asyncio.TimeoutError:
            logger.error(f"获取工具超时 (>{TOOLS_TIMEOUT}秒)")
            print(f"获取工具超时，请检查网络连接或服务器状态后重试。")
            return
        except Exception as e:
            error_msg = handle_error(e, "获取工具时")
            print(f"获取工具失败: {error_msg}")
            return
        
        # 创建一个智能代理，思考 → 行动 → 观察 → 思考 → 行动 → ... → 最终答案
        logger.info("正在创建智能代理...")
        try:
            agent = create_react_agent(llm, tools)
            logger.info("智能代理创建成功")
        except Exception as e:
            error_msg = handle_error(e, "创建智能代理时")
            print(f"创建智能代理失败: {error_msg}")
            return

        # 循环接收用户输入
        while True:
            try:
                # 提示用户输入问题
                user_input = input("\n请输入您的问题（或输入 'exit' 退出）：")
                if user_input.lower() == "exit":
                    print("感谢使用！再见！")
                    break

                logger.info(f"用户输入: {user_input}")
                # 调用代理处理问题
                logger.info("正在调用智能代理处理问题...")
                try:
                    # 创建符合LangChain要求的消息格式
                    human_message = HumanMessage(content=user_input)
                    logger.info(f"创建的消息对象: {type(human_message)}")
                    
                    # 方式1：使用消息列表
                    messages_list = [human_message]
                    logger.info("尝试使用消息列表格式调用代理")
                    
                    agent_response = await asyncio.wait_for(
                        agent.ainvoke({"messages": messages_list}), 
                        timeout=API_CALL_TIMEOUT
                    )
                    logger.info("智能代理处理完成")
                    # 调用抽取的方法处理输出结果
                    print_optimized_result(agent_response)
                except asyncio.TimeoutError:
                    logger.error(f"API调用超时 (>{API_CALL_TIMEOUT}秒)")
                    print(f"处理请求超时，请稍后重试或尝试简化您的问题。")
                    continue
                except Exception as e:
                    error_msg = handle_error(e, "调用智能代理时")
                    print(f"处理请求失败: {error_msg}")
                    continue

            except Exception as e:
                error_msg = handle_error(e, "处理用户输入时")
                print(f"发生错误：{error_msg}")
                continue

    except Exception as e:
        error_msg = handle_error(e, "程序初始化时")
        print(f"程序初始化失败: {error_msg}")
    finally:
        # 清理资源
        logger.info("正在清理资源...")
        if client and hasattr(client, 'close'):
            try:
                await client.close()
                logger.info("客户端资源清理完成")
            except Exception as e:
                logger.error(f"清理客户端资源时发生错误: {e}")
        
        # 终止本地服务器进程
        if math_server and math_server.returncode is None:
            logger.info("正在终止本地数学服务器...")
            math_server.terminate()
            await math_server.wait()
            logger.info("本地数学服务器已终止")
        
        if weather_server and weather_server.returncode is None:
            logger.info("正在终止本地天气服务器...")
            weather_server.terminate()
            await weather_server.wait()
            logger.info("本地天气服务器已终止")
        
        logger.info("所有资源清理完成")

# 使用 asyncio 运行异步主函数
if __name__ == "__main__":
    logger.info("开始执行主函数")
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n程序被用户中断")
        logger.info("程序被用户中断")
    except Exception as e:
        error_msg = handle_error(e, "主程序执行时")
        print(f"程序执行失败: {error_msg}")
        logger.critical("程序异常退出", exc_info=True)
