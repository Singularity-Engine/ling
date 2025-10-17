"""
记忆工具模块 - 提供记忆相关的工具

该模块实现了与记忆系统交互的各种工具，包括记忆搜索、用户偏好查询等。
所有工具都基于BaseTool基类实现，可以轻松集成到工具管理系统中。
"""

import json
from typing import Optional
from loguru import logger
from ..important.memories import search_similar_memories
from .base_tool import BaseTool
from pydantic import BaseModel, Field
from typing import List

class MemorySearchArgs(BaseModel):
    query: str = Field(..., description="要搜索的记忆内容关键词")
    user_id: Optional[str] = Field(default="default_user", description="用户ID")
    limit: Optional[int] = Field(default=5, description="返回结果数量限制")


class MemorySearchTool(BaseTool):
    """记忆搜索工具 - 让AI可以搜索相似的记忆内容"""
    
    def __init__(self):
        super().__init__(
            name="search_similar_memories",
            description="搜索相似的历史记忆内容。当用户询问过去的对话、偏好、经历或任何需要回忆历史信息的问题时使用此工具。特别是当用户询问'我的姓名是什么'、'我叫什么'、'我是谁'、'我的名字'等个人信息时，必须使用此工具。"
        )
    
    @property
    def args_schema(self):
        return MemorySearchArgs
    
    async def execute(self, query=None, user_id=None, limit=None, **kwargs) -> str:
        """执行记忆搜索
        
        支持多种参数格式:
        1. 直接参数: execute(query="查询内容", user_id="用户ID", limit=5)
        2. 字典参数: execute({"query": "查询内容", "user_id": "用户ID"})
        3. 混合参数: execute(query="查询内容", **其他参数)
        """
        try:
            print(f"\n==== 记忆搜索工具被调用 ====")
            
            # 处理参数 - 支持多种格式
            if query is None and len(kwargs) == 1 and isinstance(next(iter(kwargs.values())), dict):
                # 如果第一个参数是字典，使用它作为参数源
                params = next(iter(kwargs.values()))
                query = params.get("query", "")
                user_id = params.get("user_id")
                limit = params.get("limit", 5)
            elif query is None and kwargs:
                # 如果query为None但有其他参数，尝试从kwargs中获取
                query = kwargs.get("query", "")
                if not user_id:
                    user_id = kwargs.get("user_id")
                if not limit:
                    limit = kwargs.get("limit", 5)
            elif isinstance(query, dict):
                # 如果query是字典，从中提取参数
                params = query
                query = params.get("query", "")
                if not user_id:
                    user_id = params.get("user_id")
                if not limit:
                    limit = params.get("limit", 5)
            
            # 确保默认值
            if not query:
                query = ""
            # 如果没有提供user_id，尝试从用户上下文获取
            if not user_id:
                try:
                    from ..bff_integration.auth.user_context import UserContextManager
                    user_id = UserContextManager.get_current_user_id()
                    if not user_id:
                        user_id = "default_user"
                        logger.warning("⚠️ 记忆搜索工具：无法获取当前用户ID，使用默认用户ID: default_user")
                    else:
                        logger.info(f"✅ 记忆搜索工具：从用户上下文获取用户ID: {user_id}")
                except Exception as e:
                    user_id = "default_user"
                    logger.warning(f"⚠️ 记忆搜索工具：获取用户上下文失败，使用默认用户ID: {e}")
            if not limit or not isinstance(limit, int):
                limit = 5
                
            print(f"处理后的参数:")
            print(f"查询: {query}")
            print(f"用户ID: {user_id}")
            print(f"限制数量: {limit}")
            
            results = search_similar_memories(query=query, user_id=user_id, limit=limit)
            
            print(f"搜索结果数量: {len(results) if results else 0}")
            if results:
                print(f"第一条记忆: {results[0][1][:100]}...")
            print("==== 记忆搜索结束 ====\n")
            
            if not results:
                return "没有找到相关的记忆内容。"
            
            # 直接返回结果给大模型，让它基于这些信息回答问题，而不是通过MCP处理
            result_text = "检索到以下相关记忆内容：\n\n"
            for i, (memory_id, summary, mem_user_id, created_at, updated_at, triples) in enumerate(results, 1):
                result_text += f"{i}. {summary}\n"
                if created_at:
                    result_text += f"   时间：{created_at}\n"
                result_text += "\n"
            
            return result_text
        except Exception as e:
            print(f"搜索记忆时出错：{str(e)}")
            import traceback
            traceback.print_exc()
            return f"搜索记忆时出错：{str(e)}"





# 创建工具实例的便捷函数
def create_memory_search_tool() -> MemorySearchTool:
    # 创建工具实例
    tool = MemorySearchTool()
    
    # 确保工具已注册到全局注册表
    from .base_tool import tool_registry
    if tool.name not in tool_registry.get_all_tools():
        tool_registry.register(tool)
        print(f"✅ 记忆搜索工具 {tool.name} 已手动注册到全局注册表")
    
    return tool

def create_all_memory_tools() -> List[BaseTool]:
    """创建所有记忆相关工具实例"""
    tools = [create_memory_search_tool()]
    print(f"✅ 创建了 {len(tools)} 个记忆工具")
    return tools
