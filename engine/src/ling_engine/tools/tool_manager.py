"""
工具管理器 - 统一管理和集成所有工具
"""

from typing import List, Dict, Any, Optional
from loguru import logger
from .base_tool import tool_registry, BaseTool


class ToolManager:
    """工具管理器，负责工具的加载、管理和集成"""
    
    def __init__(self):
        self.logger = logger.bind(component="ToolManager")
        self._initialized = False
    
    def initialize(self):
        """初始化工具管理器"""
        if self._initialized:
            return
        
        try:
            # 获取所有注册的工具
            tools = tool_registry.get_all_tools()
            self.logger.info(f"🔧 工具管理器初始化，发现 {len(tools)} 个工具")
            
            # 列出所有工具
            for name, tool in tools.items():
                self.logger.info(f"  - {name}: {tool.description[:50]}...")
            
            self._initialized = True
            self.logger.info("✅ 工具管理器初始化完成")
            
        except Exception as e:
            self.logger.error(f"❌ 工具管理器初始化失败: {e}")
            raise
    
    def get_all_tools(self) -> Dict[str, BaseTool]:
        """获取所有工具"""
        if not self._initialized:
            self.initialize()
        return tool_registry.get_all_tools()
    
    def get_tool(self, name: str) -> Optional[BaseTool]:
        """获取指定工具"""
        if not self._initialized:
            self.initialize()
        return tool_registry.get_tool(name)
    
    def get_langchain_tools(self) -> List[Any]:
        """获取所有工具的Langchain版本"""
        if not self._initialized:
            self.initialize()
        
        try:
            langchain_tools = tool_registry.get_langchain_tools()
            self.logger.info(f"🔧 创建了 {len(langchain_tools)} 个Langchain工具")
            return langchain_tools
        except Exception as e:
            self.logger.error(f"❌ 创建Langchain工具失败: {e}")
            return []
    
    def register_tool(self, tool: BaseTool):
        """注册新工具"""
        tool_registry.register(tool)
        self.logger.info(f"✅ 新工具已注册: {tool.name}")
    
    def list_tools(self) -> List[Dict[str, str]]:
        """列出所有工具的基本信息"""
        if not self._initialized:
            self.initialize()
        return tool_registry.list_tools()
    
    def add_tools_to_mcp_list(self, mcp_tools: List[Any]) -> List[Any]:
        """将内置工具添加到MCP工具列表中"""
        try:
            # 获取内置工具
            builtin_tools = self.get_langchain_tools()
            
            # 合并工具列表
            if not mcp_tools:
                mcp_tools = []
            
            combined_tools = mcp_tools + builtin_tools
            
            self.logger.info(f"🔧 工具合并完成: MCP工具 {len(mcp_tools)} 个 + 内置工具 {len(builtin_tools)} 个 = 总计 {len(combined_tools)} 个")
            
            return combined_tools
            
        except Exception as e:
            self.logger.error(f"❌ 合并工具列表失败: {e}")
            return mcp_tools or []


# 全局工具管理器实例
tool_manager = ToolManager()