"""
LangChain MCP Agent 模块

这个模块提供了使用 LangChain 和 MCP (Model Context Protocol) 工具创建智能代理的功能。
它使用 langchain_mcp_adapters 库中的 MultiServerMCPClient 来连接多个 MCP 服务器，
并将 MCP 工具转换为 LangChain 工具，以便在 LangChain 代理中使用。

主要组件:
- MCPToolkit: 管理 MCP 工具的类，使用 MultiServerMCPClient 加载和管理工具
- create_mcp_agent: 创建一个使用 MCP 工具的 LangChain Agent

配置文件格式 (mcp_tools_config.json):
{
  "mcpServers": {
    "server-id": {
      "type": "sse",
      "url": "https://example.com/mcp/sse",
      "description": "工具描述",
      "enabled": true
    }
  }
}
"""

from typing import Dict, Any, Optional, List
import asyncio
import json
import logging
from langchain.agents import AgentExecutor, create_react_agent
from langchain_openai import ChatOpenAI
from langchain.schema import SystemMessage
from langchain.prompts import MessagesPlaceholder
from langchain_mcp_adapters.client import MultiServerMCPClient

logger = logging.getLogger(__name__)

class MCPToolkit:
    """MCP 工具管理类，使用 MultiServerMCPClient"""
    def __init__(self, config_path: str = "enhanced_mcp_config.json"):
        """初始化工具管理器"""
        self.config_path = config_path
        self.client = None
        self.tools = []
        
    async def initialize(self):
        """加载工具配置并初始化客户端"""
        try:
            with open(self.config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
                
            # 从配置文件中提取服务器配置
            server_config = {}
            for tool_id, tool_config in config.get("mcpServers", {}).items():
                if tool_config.get("enabled", True):
                    # 修正传输类型映射：将 streamableHttp/http/rest 统一为 streamable_http
                    raw_type = tool_config.get("type", "sse")
                    transport = "streamable_http" if str(raw_type).lower() in ("streamablehttp", "streamable_http", "http", "rest") else str(raw_type).lower()
                    
                    server_config[tool_id] = {
                        "url": tool_config.get("url", ""),
                        "transport": transport,
                        "description": tool_config.get("description", "")
                    }
            
            # 初始化 MultiServerMCPClient
            self.client = MultiServerMCPClient(server_config)
            
            # 获取工具
            self.tools = await self.client.get_tools()
            
            # 详细的工具格式调试信息
            print("=" * 60)
            print(f"🔧 获取到 {len(self.tools)} 个工具")
            print("=" * 60)
            
            for i, tool in enumerate(self.tools):
                print(f"\n📋 工具 {i+1}:")
                print(f"  类型: {type(tool)}")

                # 如果有 schema 属性，打印它
                if hasattr(tool, 'schema'):
                    print(f"  Schema: {tool.schema}")
                
                # 如果有 input_schema 属性，打印它
                if hasattr(tool, 'input_schema'):
                    print(f"  Input Schema: {tool.input_schema}")
                
                # 打印工具的完整字典表示（如果可能）
                if hasattr(tool, '__dict__'):
                    print(f"  完整属性: {tool.__dict__}")
                
                print("-" * 40)
            
            # 原始的完整打印
            print("\n🔍 原始工具对象:")
            print(self.tools)
            print("=" * 60)
            
            # 将工具信息保存到JSON文件以便分析
            try:
                import json
                from datetime import datetime
                
                tools_info = []
                for tool in self.tools:
                    tool_info = {
                        "name": getattr(tool, 'name', 'N/A'),
                        "description": getattr(tool, 'description', 'N/A'),
                        "type": str(type(tool)),
                        "attributes": [attr for attr in dir(tool) if not attr.startswith('_')],
                    }
                    
                    # 尝试获取 schema 信息
                    if hasattr(tool, 'schema'):
                        try:
                            tool_info["schema"] = str(tool.schema)
                        except:
                            tool_info["schema"] = "无法序列化"
                    
                    if hasattr(tool, 'input_schema'):
                        try:
                            tool_info["input_schema"] = str(tool.input_schema)
                        except:
                            tool_info["input_schema"] = "无法序列化"
                    
                    # 尝试获取字典属性
                    if hasattr(tool, '__dict__'):
                        try:
                            tool_info["dict_attrs"] = {k: str(v) for k, v in tool.__dict__.items()}
                        except:
                            tool_info["dict_attrs"] = "无法序列化"
                    
                    tools_info.append(tool_info)
                
                # 保存到文件
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                filename = f"tools_debug_{timestamp}.json"
                with open(filename, 'w', encoding='utf-8') as f:
                    json.dump({
                        "timestamp": datetime.now().isoformat(),
                        "total_tools": len(self.tools),
                        "tools": tools_info
                    }, f, ensure_ascii=False, indent=2)
                
                print(f"💾 工具信息已保存到: {filename}")
            except Exception as e:
                print(f"❌ 保存工具信息失败: {e}")
            
            return self.tools
        except Exception as e:
            logger.error(f"Error loading MCP config: {e}")
            return []





    async def close(self):
        """关闭客户端连接"""
        if self.client:
            await self.client.close()

async def create_mcp_agent(llm_api_key: str, model: str = "gpt-4", temperature: float = 0):
    """创建一个使用 MCP 工具的 LangChain Agent
    
    参数改为从统一配置传入的 llm_api_key；model 与 temperature 允许调用方指定。
    """
    # 初始化 LLM（从统一配置注入 Key）
    llm = ChatOpenAI(
        temperature=temperature,
        model=model,
        api_key=llm_api_key
    )

    # 初始化工具
    toolkit = MCPToolkit()
    tools = await toolkit.initialize()

    # 创建系统消息
    system_message = SystemMessage(
        content="""You are a powerful AI assistant with access to 11 specialized tools to help users accomplish various tasks.

**Available Tools Overview:**

🌤️ **Weather Tools (6)** - US Weather Information Service
- get_current_weather: Get real-time weather for US cities
- get_weather_forecast: Get daily forecast (up to 7 days)
- get_hourly_forecast: Get hourly weather predictions
- get_weather_alerts: Get active weather warnings
- find_weather_stations: Find nearby observation stations
- get_local_time: Get current time for a location

🎨 **Image Generation (3)** - AI Image Creation & Editing
- generate_image: Create images from text descriptions (supports DALL-E, Gemini models)
- edit_image: Modify existing images with AI assistance
- create_image_variation: Generate variations of existing images

🎵 **Music Generation (1)** - AI Music Creation
- suno-generate-music-with-stream: Generate music with Suno AI, supports streaming

🔍 **Tool Discovery (1)** - MCP Marketplace
- search_mcp_tools: Search for additional MCP tools in the marketplace

**Tool Usage Guidelines:**

1. **Weather Queries**:
   - Use weather tools for US city weather information
   - For current conditions → get_current_weather
   - For future predictions → get_weather_forecast or get_hourly_forecast
   - Always include city and state (e.g., "New York, NY")

2. **Image Generation**:
   - Use generate_image for creating new images from descriptions
   - Be specific with style, composition, and artistic direction
   - For editing → edit_image with clear modification instructions
   - For variations → create_image_variation with the original image

3. **Music Creation**:
   - Use suno-generate-music-with-stream for music generation
   - Specify genre, mood, tempo, and instruments when possible
   - Supports streaming download for immediate playback

4. **Tool Discovery**:
   - Use search_mcp_tools when users ask about available capabilities
   - Search by keyword to find relevant MCP services

**Important:**
- Choose the most appropriate tool based on the user's intent
- Provide clear, descriptive parameters to tools
- If a tool fails, try an alternative approach or inform the user clearly
- Always return results in a user-friendly, natural language format
        """
    )

    # 创建提示模板
    prompt = [
        system_message,
        MessagesPlaceholder(variable_name="chat_history"),
        MessagesPlaceholder(variable_name="messages"),
    ]

    # 创建 agent
    agent = create_react_agent(llm, tools, prompt)

    # 创建 agent executor
    agent_executor = AgentExecutor(
        agent=agent,
        tools=tools,
        verbose=True,
        handle_parsing_errors=True,
        max_iterations=10,  # 增加迭代次数限制，避免工具调用被过早停止
        max_execution_time=60  # 60秒执行时间限制
    )

    return agent_executor, toolkit  # 返回toolkit以便后续关闭连接

# 使用示例
async def main():
    # 示例：从外部配置读取后传入 llm_api_key
    agent, toolkit = await create_mcp_agent("your-llm-api-key-from-config")
    try:
        response = await agent.ainvoke({
            "messages": [{"role": "user", "content": "查看明天的天气"}]
        })
        print(response)
    finally:
        # 确保关闭连接
        await toolkit.close()

if __name__ == "__main__":
    asyncio.run(main()) 