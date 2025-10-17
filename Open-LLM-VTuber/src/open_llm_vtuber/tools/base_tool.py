"""
基础工具类 - 提供可扩展的工具框架
"""

from abc import ABC, abstractmethod
from typing import Any, Dict, Optional
from langchain_core.tools import tool
from loguru import logger


class BaseTool(ABC):
    """基础工具抽象类，所有工具都应继承此类"""
    
    def __init__(self, name: str, description: str):
        """
        初始化基础工具
        
        Args:
            name: 工具名称
            description: 工具描述
        """
        self.name = name
        self.description = description
        self.logger = logger.bind(tool=name)
    
    @abstractmethod
    async def execute(self, **kwargs) -> str:
        """
        执行工具的核心逻辑
        
        Args:
            **kwargs: 工具参数
            
        Returns:
            str: 执行结果
        """
        pass
    
    def validate_params(self, params: Dict[str, Any], required_params: list) -> bool:
        """
        验证参数是否完整
        
        Args:
            params: 参数字典
            required_params: 必需参数列表
            
        Returns:
            bool: 验证是否通过
        """
        missing_params = [param for param in required_params if param not in params or params[param] is None]
        if missing_params:
            self.logger.error(f"缺少必需参数: {missing_params}")
            return False
        return True
    
    def log_execution(self, params: Dict[str, Any], result: str):
        """
        记录工具执行日志
        
        Args:
            params: 执行参数
            result: 执行结果
        """
        self.logger.info(f"🔧 工具执行: {self.name}")
        self.logger.debug(f"参数: {params}")
        self.logger.debug(f"结果: {result[:100]}..." if len(result) > 100 else f"结果: {result}")
    
    def create_langchain_tool(self):
        """
        创建对应的Langchain工具实例
        
        Returns:
            Langchain工具实例
        """
        # 动态创建工具函数
        async def tool_func(**kwargs):
            try:
                self.logger.info(f"🔍 开始执行工具: {self.name}")
                
                # 特殊处理记忆搜索工具
                if self.name == "search_similar_memories":
                    
                    
                    
                    # 尝试提取查询参数
                    query = None
                    if "query" in kwargs:
                        query = kwargs["query"]
                    elif len(kwargs) == 1 and isinstance(next(iter(kwargs.values())), str):
                        # 如果只有一个参数且是字符串，假设是查询
                        query = next(iter(kwargs.values()))
                    
                    if query:
                        print(f"提取到查询参数: {query}")
                # 调用工具执行
                result = await self.execute(**kwargs)
                self.log_execution(kwargs, result)
                return result
            except Exception as e:
                error_msg = f"工具执行失败: {str(e)}"
                self.logger.error(f"❌ {error_msg}")
                import traceback
                traceback.print_exc()
                return error_msg
        
        # 设置工具函数的名称和描述
        tool_func.__name__ = self.name
        tool_func.__doc__ = self.description
        
        # 使用@tool装饰器创建Langchain工具
        return tool(tool_func)


class ToolRegistry:
    """工具注册表，管理所有可用工具"""
    
    def __init__(self):
        self._tools: Dict[str, BaseTool] = {}
        self.logger = logger.bind(component="ToolRegistry")
    
    def register(self, tool_instance: BaseTool):
        """
        注册工具
        
        Args:
            tool_instance: 工具实例
        """
        self._tools[tool_instance.name] = tool_instance
        self.logger.info(f"✅ 工具已注册: {tool_instance.name}")
    
    def get_tool(self, name: str) -> Optional[BaseTool]:
        """
        获取工具实例
        
        Args:
            name: 工具名称
            
        Returns:
            工具实例或None
        """
        return self._tools.get(name)
    
    def get_all_tools(self) -> Dict[str, BaseTool]:
        """
        获取所有注册的工具
        
        Returns:
            工具字典
        """
        return self._tools.copy()
    
    def get_langchain_tools(self) -> list:
        """
        获取所有工具的Langchain版本
        
        Returns:
            Langchain工具列表
        """
        langchain_tools = []
        for tool_instance in self._tools.values():
            try:
                langchain_tool = tool_instance.create_langchain_tool()
                langchain_tools.append(langchain_tool)
                self.logger.debug(f"✅ 创建Langchain工具: {tool_instance.name}")
            except Exception as e:
                self.logger.error(f"❌ 创建Langchain工具失败: {tool_instance.name}, 错误: {e}")
        
        self.logger.info(f"🔧 总共创建了 {len(langchain_tools)} 个Langchain工具")
        return langchain_tools
    
    def list_tools(self) -> list:
        """
        列出所有工具的基本信息
        
        Returns:
            工具信息列表
        """
        return [
            {
                "name": tool.name,
                "description": tool.description
            }
            for tool in self._tools.values()
        ]


# 全局工具注册表实例
tool_registry = ToolRegistry()