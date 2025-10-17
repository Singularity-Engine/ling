"""
工具模块 - 包含各种AI可调用的工具
"""

# 导入基础工具系统
from .base_tool import BaseTool, ToolRegistry, tool_registry

# 导入工具管理器
from .tool_manager import ToolManager, tool_manager

# 原有工具已被新的工具系统替代，保留接口以便向后兼容
# from .memory_search_tool import search_similar_memories_tool, create_memory_search_langchain_tool

# 导入新的记忆工具
from .memory_tools import (
    MemorySearchTool,
    create_memory_search_tool,
    create_all_memory_tools
)

# 自动注册工具到全局注册表
def _auto_register_tools():
    """自动注册所有工具到全局注册表"""
    try:
        # 注册所有记忆工具
        for tool in create_all_memory_tools():
            tool_registry.register(tool)
        
        # 确保记忆搜索工具已注册
        all_tools = tool_registry.get_all_tools()
        if 'search_similar_memories' not in all_tools:
            memory_tool = create_memory_search_tool()
            tool_registry.register(memory_tool)
    except Exception as e:
        print(f"❌ 自动注册工具失败: {e}")

# 执行自动注册
_auto_register_tools()

__all__ = [
    # 工具系统基础组件
    'BaseTool',
    'ToolRegistry', 
    'tool_registry',
    'ToolManager',
    'tool_manager',
    
    # 原有工具（向后兼容）- 已被新工具系统替代
    # 'search_similar_memories_tool',
    # 'create_memory_search_langchain_tool',
    
    # 记忆工具
    'MemorySearchTool',
    'create_memory_search_tool',
    'create_all_memory_tools'
]