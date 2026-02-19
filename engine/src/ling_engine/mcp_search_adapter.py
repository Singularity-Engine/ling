#!/usr/bin/env python3
"""
MCP搜索工具适配器 - 使搜索工具能够与langchain MCP框架集成
"""

from typing import Dict, Any, List, Optional
from langchain.tools import BaseTool
from pydantic import BaseModel, Field
import json
from loguru import logger


class MCPSearchToolSchema(BaseModel):
    """MCP搜索工具的输入schema"""
    requirement: str = Field(description="用户的具体需求描述，例如：'需要地图导航工具'、'需要天气查询工具'等")
    tool_type: Optional[str] = Field(default=None, description="需要的工具类型，例如：'地图'、'天气'、'翻译'、'计算'等")
    user_id: Optional[str] = Field(default=None, description="用户ID，用于区分不同用户的搜索请求")


class MCPSearchLangChainTool(BaseTool):
    """将MCP搜索工具包装成LangChain工具"""
    
    name: str = "search_mcp_tools"
    description: str = """搜索并获取新的MCP工具。

使用场景：
1. 当用户询问关于地理位置、地图、导航相关问题，但没有地图工具时
2. 当用户需要特定功能但当前工具无法满足时
3. 当用户明确提到需要某种特定工具时

注意：只有在确实没有合适的本地工具时才使用此工具"""
    
    args_schema: type[BaseModel] = MCPSearchToolSchema
    search_tool: Any = Field(exclude=True)
    
    class Config:
        arbitrary_types_allowed = True
    
    def __init__(self, search_tool, **kwargs):
        super().__init__(search_tool=search_tool, **kwargs)
    
    def _run(self, requirement: str, tool_type: Optional[str] = None) -> str:
        """同步运行方法 - 不应该被调用，因为我们的工具是异步的"""
        raise NotImplementedError("This tool only supports async execution")
    
    async def _arun(self, requirement: str, tool_type: Optional[str] = None, user_id: Optional[str] = None) -> str:
        """异步运行MCP搜索工具"""
        try:
            logger.info(f"🔍 LangChain MCP搜索工具被调用: {requirement}")

            # 如果没有传入user_id，尝试从当前上下文获取
            if not user_id:
                try:
                    # 方法1：尝试从Context Variable获取
                    from ..bff_integration.auth.user_context import UserContextManager
                    user_id = UserContextManager.get_current_user_id()
                    if user_id:
                        logger.info(f"🔍 从Context Variable获取用户ID: {user_id}")
                except Exception:
                    pass

                if not user_id:
                    try:
                        # 方法2：尝试从用户上下文助手获取
                        from ..utils.user_context_helper import get_current_user_id
                        user_id = get_current_user_id("default_user")
                        if user_id != "default_user":
                            logger.info(f"🔍 从用户上下文助手获取用户ID: {user_id}")
                    except Exception:
                        pass

                if not user_id:
                    user_id = "default_user"
                    logger.info(f"🔍 使用默认用户ID: {user_id}")
            else:
                logger.info(f"🔍 使用传入的用户ID: {user_id}")

            # 调用实际的搜索工具，传递user_id
            result = await self.search_tool.search_mcp_tools(requirement, tool_type, user_id)

            # 格式化返回结果
            return self._format_result(result)

        except Exception as e:
            logger.error(f"MCP搜索工具执行失败: {e}")
            return f"搜索工具执行出错: {str(e)}"
    
    def _format_result(self, result: Dict[str, Any]) -> str:
        """格式化搜索结果为用户友好的文本"""
        if not result:
            return "搜索工具调用失败，未返回结果。"
        
        if result.get("success"):
            tools_count = result.get("tools_found", 0)
            message = result.get("message", "")
            
            # 构建响应消息
            response_parts = [f"✅ {message}"]
            
            # 添加工具预览
            if "tools_preview" in result and result["tools_preview"]:
                response_parts.append("\n📋 找到的工具预览：")
                for tool_preview in result["tools_preview"]:
                    response_parts.append(f"  {tool_preview}")
            
            # 添加配置更新信息
            if result.get("config_updated"):
                response_parts.append("\n💾 新工具已成功保存到配置文件")
                response_parts.append("⚡ 已触发热更新，通常数秒内生效，无需重启")
            
            # 添加建议
            if result.get("recommendation"):
                response_parts.append(f"\n💡 建议: {result['recommendation']}")
            
            return "".join(response_parts)
        else:
            # 搜索失败
            message = result.get("message", "搜索失败")
            recommendation = result.get("recommendation", "")
            
            response = f"❌ {message}"
            if recommendation:
                response += f"\n💡 建议: {recommendation}"
            
            return response


def create_mcp_search_langchain_tool(mcp_search_tool) -> MCPSearchLangChainTool:
    """创建MCP搜索工具的LangChain包装器"""
    return MCPSearchLangChainTool(search_tool=mcp_search_tool)


class EnhancedMCPClient:
    """增强的MCP客户端，支持内置搜索工具和延迟加载"""
    
    def __init__(self, base_client, mcp_search_tool=None, server_config: Optional[Dict[str, Dict[str, Any]]] = None):
        """
        初始化增强的MCP客户端
        
        Args:
            base_client: 基础的MCP客户端
            mcp_search_tool: MCP搜索工具实例
            server_config: MultiServerMCPClient 使用的服务器配置（用于逐台回退尝试）
        """
        self.base_client = base_client
        self.mcp_search_tool = mcp_search_tool
        self._search_langchain_tool = None
        self._tools_cache = None  # 工具缓存
        self._tools_loaded = False  # 工具是否已加载
        self._server_config: Dict[str, Dict[str, Any]] = server_config or {}
        self._session_blacklist: set[str] = set()
        
        if mcp_search_tool:
            self._search_langchain_tool = create_mcp_search_langchain_tool(mcp_search_tool)

    def clear_tools_cache(self):
        """清理工具缓存，强制重新加载"""
        self._tools_cache = None
        self._tools_loaded = False
        logger.info("🧹 工具缓存已清理，下次调用get_tools()时将重新加载")

    async def _get_tools_with_fallback(self, timeout_sec: float = 30.0) -> List[BaseTool]:
        """在基础调用失败时，逐台服务器独立尝试并聚合可用工具。"""
        tools: List[BaseTool] = []
        if not self._server_config:
            logger.warning("⚠️ 无可用的 server_config，跳过逐台回退尝试")
            return tools
        try:
            from langchain_mcp_adapters.client import MultiServerMCPClient
            import asyncio
        except Exception:
            logger.warning("⚠️ 无法导入 MultiServerMCPClient，跳过逐台回退尝试")
            return tools
        
        # 并行逐台尝试
        async def fetch_one(name: str, cfg: Dict[str, Any]) -> List[BaseTool]:
            if name in self._session_blacklist:
                logger.info(f"⏭️ 跳过黑名单服务器: {name}")
                return []
            single_client = MultiServerMCPClient({name: cfg})
            try:
                result = await asyncio.wait_for(single_client.get_tools(), timeout=timeout_sec)
                ok = len(result or [])
                if ok:
                    logger.info(f"✅ 单台成功: {name} → {ok} 个工具")
                else:
                    logger.warning(f"⚠️ 单台返回空列表: {name}")
                return result or []
            except Exception as e:
                self._session_blacklist.add(name)
                logger.error(f"❌ 单台失败: {name}, {type(e).__name__}: {e}")
                return []

        import asyncio
        tasks = [fetch_one(n, c) for n, c in self._server_config.items()]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for arr in results:
            # 跳过异常结果，只处理正常返回的工具列表
            if isinstance(arr, Exception):
                logger.warning(f"❌ 某个MCP服务器获取工具失败: {type(arr).__name__}: {arr}")
                continue
            tools.extend(arr)
        
        # 去重（按工具名）
        seen = set()
        deduped: List[BaseTool] = []
        for t in tools:
            tname = getattr(t, 'name', None) or id(t)
            if tname in seen:
                continue
            seen.add(tname)
            deduped.append(t)
        logger.info(f"🧰 聚合后可用工具数: {len(deduped)} (黑名单: {sorted(self._session_blacklist)})")
        return deduped

    async def get_tools(self) -> List[BaseTool]:
        """获取所有可用工具，直接使用单台机制，每个工具20秒超时"""
        # 如果工具已经加载，直接返回缓存（注意：空列表也是有效缓存）
        if self._tools_loaded and self._tools_cache is not None:
            logger.info(f"🔄 使用缓存的工具列表: {len(self._tools_cache)} 个工具")
            return self._tools_cache

        # 直接使用单台机制加载工具
        logger.info("🔧 开始直接使用单台机制获取MCP工具...")
        tools = []

        try:
            # 直接使用单台逐个初始化机制
            logger.info("🔁 直接使用逐台服务器机制...")
            tools = await self._get_tools_with_fallback(timeout_sec=20.0)
        except Exception as e:
            logger.error(f"❌ 获取MCP工具失败: {e}")
            logger.error(f"❌ 异常详情: {str(e)}", exc_info=True)

        # 添加搜索工具
        if self._search_langchain_tool:
            tools.append(self._search_langchain_tool)
            logger.info("添加了MCP搜索工具")

        # 缓存工具列表
        self._tools_cache = tools
        self._tools_loaded = True
        logger.info(f"✅ 工具已缓存，总共可用工具数量: {len(tools)}")

        # 记录详细的工具列表用于调试
        tool_names = [tool.name for tool in tools if hasattr(tool, 'name')]
        logger.info(f"🔧 缓存的工具列表: {tool_names}")

        return tools
    
    def __getattr__(self, name):
        """将其他属性和方法代理到基础客户端"""
        return getattr(self.base_client, name)


def enhance_mcp_client(base_client, mcp_search_tool, server_config: Optional[Dict[str, Dict[str, Any]]] = None):
    """
    增强现有的MCP客户端，添加搜索工具功能
    
    Args:
        base_client: 基础的MCP客户端
        mcp_search_tool: MCP搜索工具实例
        server_config: MultiServerMCPClient 使用的服务器配置
        
    Returns:
        增强后的MCP客户端
    """
    return EnhancedMCPClient(base_client, mcp_search_tool, server_config=server_config) 