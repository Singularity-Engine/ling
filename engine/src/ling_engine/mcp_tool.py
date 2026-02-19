import aiohttp
import asyncio
import json
import logging
from typing import Dict, Any, Optional, AsyncGenerator, List, Type
from langchain.tools import BaseTool
from langchain.callbacks.manager import AsyncCallbackManager
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

class MCPToolConfig(BaseModel):
    """MCP工具配置模型"""
    name: str = Field(..., description="工具名称")
    url: str = Field(..., description="服务器URL")
    type: str = Field(default="sse", description="通信类型: sse 或 rest")
    description: str = Field(default="", description="工具描述")
    timeout: int = Field(default=30, description="超时时间(秒)")
    poll_interval: int = Field(default=1, description="轮询间隔(秒)")

class MCPToolArgs(BaseModel):
    """MCP工具输入参数模型"""
    requirement: str = Field(..., description="用户请求内容")

class MCPTool(BaseTool):
    """集成到Langchain的MCP工具实现"""
    
    name: str
    description: str
    args_schema: Type[BaseModel] = MCPToolArgs
    return_direct: bool = False
    
    # 自定义字段
    mcp_config: MCPToolConfig = Field(...)
    
    def __init__(self, config: Dict[str, Any], **kwargs):
        """初始化MCP工具
        
        Args:
            config: 工具配置字典
            **kwargs: 其他参数
        """
        mcp_config = MCPToolConfig(**config)
        
        # 从配置中获取工具的基本信息
        super().__init__(
            name=mcp_config.name,
            description=mcp_config.description,
            mcp_config=mcp_config,
            **kwargs
        )
        
    async def _arun(self, requirement: str, **kwargs) -> str:
        """异步执行工具调用
        
        Args:
            requirement: 用户请求内容
            **kwargs: 其他参数
            
        Returns:
            工具执行结果
        """
        try:
            if self.mcp_config.type == "sse":
                async for chunk in self._call_sse(requirement):
                    # 对于SSE，我们返回最后一个chunk作为结果
                    result = chunk
                return json.dumps(result, ensure_ascii=False)
            else:
                result = await self._call_rest(requirement)
                return json.dumps(result, ensure_ascii=False)
        except Exception as e:
            logger.error(f"Tool {self.name} execution failed: {str(e)}")
            return json.dumps({"error": str(e)}, ensure_ascii=False)

    def _run(self, requirement: str, **kwargs) -> str:
        """同步执行工具调用（不推荐使用）
        
        Args:
            requirement: 用户请求内容
            **kwargs: 其他参数
            
        Returns:
            工具执行结果
        """
        raise NotImplementedError("请使用异步方法 _arun")

    async def _call_sse(self, requirement: str) -> Dict[str, Any]:
        """处理SSE类型的工具调用
        
        Args:
            requirement: 用户请求内容
            
        Returns:
            服务器返回的结果
        """
        async with aiohttp.ClientSession() as session:
            # 启动会话
            start_url = f"{self.mcp_config.url.rstrip('/')}/start"
            async with session.post(
                start_url,
                json={"requirement": requirement},
                timeout=self.mcp_config.timeout
            ) as resp:
                if resp.status != 200:
                    raise ConnectionError(f"Start failed: {resp.status}")
                data = await resp.json()
                session_id = data.get("session_id")
                if not session_id:
                    raise ValueError("No session_id in response")

            # 轮询结果
            result_url = f"{self.mcp_config.url.rstrip('/')}/result"
            while True:
                async with session.get(
                    result_url,
                    params={"session_id": session_id},
                    timeout=self.mcp_config.timeout
                ) as resp:
                    if resp.status == 200:
                        return await resp.json()
                    elif resp.status == 202:
                        await asyncio.sleep(self.mcp_config.poll_interval)
                        continue
                    else:
                        raise ConnectionError(f"Poll failed: {resp.status}")

    async def _call_sse_stream(self, requirement: str) -> AsyncGenerator[Dict[str, Any], None]:
        """流式处理SSE类型的工具调用，实时返回结果
        
        Args:
            requirement: 用户请求内容
            
        Yields:
            服务器返回的数据块
        """
        logger.info(f"🌊 开始流式SSE调用: {self.name}, URL: {self.mcp_config.url}")
        async with aiohttp.ClientSession() as session:
            # 启动会话
            start_url = f"{self.mcp_config.url.rstrip('/')}/start"
            logger.info(f"🌊 发送启动请求: {start_url}")
            try:
                async with session.post(
                    start_url,
                    json={"requirement": requirement},
                    timeout=self.mcp_config.timeout
                ) as resp:
                    logger.info(f"🌊 收到启动响应: 状态码={resp.status}")
                    if resp.status != 200:
                        error_msg = f"Start failed: {resp.status}"
                        logger.error(f"❌ {error_msg}")
                        raise ConnectionError(error_msg)
                    data = await resp.json()
                    logger.info(f"🌊 启动响应数据: {data}")
                    session_id = data.get("session_id")
                    if not session_id:
                        error_msg = "No session_id in response"
                        logger.error(f"❌ {error_msg}")
                        raise ValueError(error_msg)
                    
                    logger.info(f"✅ 成功获取会话ID: {session_id}")
                    # 返回初始响应
                    yield {"status": "started", "session_id": session_id}
            except Exception as e:
                logger.error(f"启动SSE会话失败: {e}")
                yield {"error": f"启动失败: {str(e)}"}
                return

            # 轮询结果，实时返回中间状态
            result_url = f"{self.mcp_config.url.rstrip('/')}/result"
            logger.info(f"🌊 准备轮询结果: {result_url}")
            poll_count = 0
            max_polls = 30  # 最大轮询次数，避免无限循环
            
            while poll_count < max_polls:
                poll_count += 1
                logger.info(f"🌊 轮询 #{poll_count}/{max_polls}")
                try:
                    async with session.get(
                        result_url,
                        params={"session_id": session_id},
                        timeout=self.mcp_config.timeout
                    ) as resp:
                        logger.info(f"🌊 轮询响应: 状态码={resp.status}")
                        if resp.status == 200:
                            # 最终结果
                            final_result = await resp.json()
                            logger.info(f"✅ 获取到最终结果: {final_result}")
                            yield final_result
                            return
                        elif resp.status == 202:
                            # 处理中，返回进度信息
                            progress_data = {"status": "processing", "progress": poll_count / max_polls}
                            try:
                                # 尝试获取进度信息
                                progress_text = await resp.text()
                                logger.info(f"🌊 进度信息原始文本: {progress_text}")
                                if progress_text:
                                    try:
                                        progress_json = json.loads(progress_text)
                                        logger.info(f"🌊 成功解析进度JSON: {progress_json}")
                                        progress_data.update(progress_json)
                                    except json.JSONDecodeError:
                                        logger.warning(f"⚠️ 进度信息不是有效的JSON: {progress_text[:50]}...")
                                        progress_data["message"] = progress_text[:100]
                            except Exception as e:
                                logger.error(f"❌ 获取进度信息失败: {e}")
                            
                            logger.info(f"🌊 返回进度数据: {progress_data}")
                            yield progress_data
                            logger.info(f"🌊 等待 {self.mcp_config.poll_interval} 秒后继续轮询")
                            await asyncio.sleep(self.mcp_config.poll_interval)
                            continue
                        else:
                            error_msg = f"Poll failed: {resp.status}"
                            logger.error(error_msg)
                            yield {"error": error_msg}
                            return
                except asyncio.TimeoutError:
                    yield {"status": "timeout", "message": f"轮询超时 (第{poll_count}次)"}
                except Exception as e:
                    logger.error(f"轮询过程中出错: {e}")
                    yield {"error": f"轮询错误: {str(e)}"}
                    return
            
            # 达到最大轮询次数
            yield {"status": "max_polls_reached", "message": "达到最大轮询次数，请求可能仍在处理中"}

    async def _call_rest(self, requirement: str) -> Dict[str, Any]:
        """处理REST类型的工具调用
        
        Args:
            requirement: 用户请求内容
            
        Returns:
            服务器返回的结果
        """
        async with aiohttp.ClientSession() as session:
            async with session.post(
                self.mcp_config.url,
                json={"requirement": requirement},
                timeout=self.mcp_config.timeout
            ) as resp:
                if resp.status == 200:
                    return await resp.json()
                raise ConnectionError(f"Request failed: {resp.status}")

class MCPToolkit:
    """MCP工具集管理器"""
    
    def __init__(self, config_path: str):
        """初始化工具集管理器
        
        Args:
            config_path: MCP工具配置文件路径
        """
        self.config_path = config_path
        self.tools: List[MCPTool] = []
        self._load_config()
        
    def _load_config(self):
        """加载工具配置"""
        try:
            with open(self.config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
            
            # 创建工具实例
            for server_name, server_config in config.get("mcpServers", {}).items():
                if server_config.get("enabled", False):
                    tool_config = {
                        "name": server_name,
                        "url": server_config["url"],
                        "type": server_config["type"],
                        "description": server_config.get("description", f"MCP工具: {server_name}"),
                        "timeout": 30,
                        "poll_interval": 1
                    }
                    self.tools.append(MCPTool(config=tool_config))
                    logger.info(f"Loaded MCP tool: {server_name}")
                    
        except Exception as e:
            logger.error(f"Failed to load MCP tools config: {str(e)}")
            raise

    def get_tools(self) -> List[MCPTool]:
        """获取所有可用的MCP工具
        
        Returns:
            工具列表
        """
        return self.tools