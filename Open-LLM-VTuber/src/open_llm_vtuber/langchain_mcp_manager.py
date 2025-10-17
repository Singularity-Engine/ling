"""
Langchain MCP Manager

这个模块提供了使用Langchain模式的MCP管理器，与原生MCP管理器接口兼容。
它使用langchain_mcp_agent中的MCPToolkit来管理MCP工具。
"""

import json
import asyncio
import logging
from typing import Dict, List, Any, Optional
from pathlib import Path

from .agent.langchain_mcp_agent import MCPToolkit

logger = logging.getLogger(__name__)


class LangchainMCPManager:
    """Langchain模式的MCP管理器，与MCPManager接口兼容"""

    def __init__(self, config_file: str = "enhanced_mcp_config.json"):
        """初始化Langchain MCP管理器

        Args:
            config_file: MCP配置文件路径
        """
        self.config_file = config_file
        self.toolkit: Optional[MCPToolkit] = None
        self.tools: List[Any] = []
        self.servers_info: Dict[str, Any] = {}
        self._initialized = False

        logger.info(f"🔧 初始化Langchain MCP管理器，配置文件: {config_file}")

    async def initialize(self):
        """初始化MCP工具包"""
        if self._initialized:
            return

        try:
            logger.info("🚀 开始初始化Langchain MCP工具包...")

            # 创建MCPToolkit实例
            self.toolkit = MCPToolkit(self.config_file)

            # 初始化工具包
            await self.toolkit.initialize()

            # 获取工具列表
            self.tools = self.toolkit.tools

            # 读取服务器信息
            await self._load_servers_info()

            self._initialized = True
            logger.info(f"✅ Langchain MCP工具包初始化成功，加载了 {len(self.tools)} 个工具")

        except Exception as e:
            logger.error(f"❌ Langchain MCP工具包初始化失败: {e}")
            import traceback
            logger.error(f"详细错误: {traceback.format_exc()}")
            raise

    async def _load_servers_info(self):
        """加载服务器信息"""
        try:
            if Path(self.config_file).exists():
                with open(self.config_file, 'r', encoding='utf-8') as f:
                    config = json.load(f)
                    self.servers_info = config.get("mcpServers", {})
                    logger.debug(f"加载了 {len(self.servers_info)} 个服务器配置")
            else:
                logger.warning(f"配置文件不存在: {self.config_file}")

        except Exception as e:
            logger.error(f"加载服务器信息失败: {e}")

    async def get_available_tools(self) -> List[Dict[str, Any]]:
        """获取可用工具列表，与MCPManager接口兼容

        Returns:
            工具信息列表
        """
        if not self._initialized:
            await self.initialize()

        tools_info = []
        for tool in self.tools:
            try:
                tool_info = {
                    "name": getattr(tool, 'name', 'Unknown'),
                    "description": getattr(tool, 'description', 'No description'),
                    "type": "langchain_tool",
                    "server": "langchain_mcp",
                    "enabled": True
                }

                # 尝试获取更多信息
                if hasattr(tool, 'schema'):
                    try:
                        tool_info["schema"] = str(tool.schema)
                    except:
                        pass

                if hasattr(tool, 'input_schema'):
                    try:
                        tool_info["input_schema"] = str(tool.input_schema)
                    except:
                        pass

                tools_info.append(tool_info)

            except Exception as e:
                logger.warning(f"获取工具信息失败: {e}")
                continue

        logger.debug(f"返回 {len(tools_info)} 个工具信息")
        return tools_info

    async def get_servers_status(self) -> Dict[str, Any]:
        """获取服务器状态，与MCPManager接口兼容

        Returns:
            服务器状态信息
        """
        if not self._initialized:
            await self.initialize()

        status = {}
        for server_name, server_config in self.servers_info.items():
            status[server_name] = {
                "name": server_name,
                "url": server_config.get("url", ""),
                "status": "connected" if server_config.get("enabled", True) else "disabled",
                "tools_count": len([t for t in self.tools if hasattr(t, 'name')]),
                "type": server_config.get("type", "unknown")
            }

        return status

    async def call_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Any:
        """调用工具，与MCPManager接口兼容

        Args:
            tool_name: 工具名称
            arguments: 工具参数

        Returns:
            工具执行结果
        """
        if not self._initialized:
            await self.initialize()

        # 查找工具
        target_tool = None
        for tool in self.tools:
            if getattr(tool, 'name', None) == tool_name:
                target_tool = tool
                break

        if not target_tool:
            raise ValueError(f"工具未找到: {tool_name}")

        try:
            logger.info(f"🔧 调用Langchain工具: {tool_name}")
            logger.debug(f"工具参数: {arguments}")

            # 调用工具
            if hasattr(target_tool, 'arun'):
                # 异步工具
                result = await target_tool.arun(**arguments)
            elif hasattr(target_tool, 'run'):
                # 同步工具
                result = target_tool.run(**arguments)
            else:
                # 直接调用
                result = await target_tool(**arguments)

            logger.info(f"✅ 工具调用成功: {tool_name}")
            return result

        except Exception as e:
            logger.error(f"❌ 工具调用失败 {tool_name}: {e}")
            raise

    async def refresh_tools(self):
        """刷新工具列表"""
        logger.info("🔄 刷新Langchain MCP工具...")
        self._initialized = False
        await self.initialize()

    async def cleanup(self):
        """清理资源"""
        try:
            if self.toolkit and hasattr(self.toolkit, 'close'):
                await self.toolkit.close()
                logger.info("✅ Langchain MCP工具包已清理")
        except Exception as e:
            logger.warning(f"清理Langchain MCP工具包时出错: {e}")

    def __del__(self):
        """析构函数"""
        if self.toolkit and hasattr(self.toolkit, 'close'):
            try:
                # 在事件循环中清理
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    loop.create_task(self.cleanup())
            except Exception:
                pass