"""
MCP Util Agent 集成接口

这个模块提供了原 agent 与 util agent 的集成接口，使得原 agent 可以
在需要 MCP 工具调用时，将结果处理委托给 util agent。

集成流程：
1. 原 agent 判断需要使用 MCP 工具
2. 调用 MCP 工具获取原始结果
3. 通过集成接口将结果传递给 util agent 处理
4. 返回用户友好的结果给原 agent
"""

import asyncio
import logging
from typing import Dict, List, Any, Optional, Union, Callable
from .agents.mcp_result_util_agent import MCPResultUtilAgent, MCPResultUtilAgentFactory
from .stateless_llm.stateless_llm_interface import StatelessLLMInterface

logger = logging.getLogger(__name__)

class MCPUtilIntegration:
    """MCP Util Agent 集成类"""
    
    def __init__(self, llm: StatelessLLMInterface, mcp_tools_accessor: Optional[Callable] = None, mcp_tools: Optional[List] = None):
        """初始化集成接口
        
        Args:
            llm: StatelessLLM 实例，用于创建 util agent
            mcp_tools_accessor: MCP工具访问器，用于依赖链调用（向后兼容）
            mcp_tools: 直接传入的MCP工具列表（推荐）
        """
        print(f"\n[Config][Config][Config] MCPUtilIntegration 初始化 [Config][Config][Config]")
        print(f"[Config] LLM类型: {type(llm).__name__}")
        print(f"[Config] MCP工具访问器: {'已提供' if mcp_tools_accessor else '未提供'}")
        print(f"[Config] 直接工具列表: {'已提供 {} 个工具'.format(len(mcp_tools)) if mcp_tools else '未提供'}")
        
        self.llm = llm
        self.mcp_tools_accessor = mcp_tools_accessor
        self.mcp_tools = mcp_tools or []
        self.util_agent = None
        self._initialized = False
        
        print(f"[Success] MCPUtilIntegration 初始化完成")
        
    async def initialize(self):
        """异步初始化 util agent"""
        try:
            print(f"\n[Setup] 异步初始化 util agent...")
            print(f"[Setup] 使用直接工具列表: {'是，{} 个工具'.format(len(self.mcp_tools)) if self.mcp_tools else '否'}")
            print(f"[Setup] 使用MCP工具访问器: {'是' if self.mcp_tools_accessor else '否'}")
            
            self.util_agent = MCPResultUtilAgentFactory.create_util_agent(
                self.llm,
                mcp_tools_accessor=self.mcp_tools_accessor,
                mcp_tools=self.mcp_tools
            )
            self._initialized = True
            
            print(f"[Success] Util Agent 初始化完成")
            print(f"[Success] - 直接工具: {len(self.mcp_tools)} 个")
            print(f"[Success] - 支持依赖链调用: {'是' if self.mcp_tools_accessor else '否'}")
            logger.info(f"MCPUtilIntegration 初始化完成，直接工具: {len(self.mcp_tools)}, 支持依赖链调用: {bool(self.mcp_tools_accessor)}")
            return True
        except Exception as e:
            print(f"[Error] Util Agent 初始化失败: {e}")
            logger.error(f"MCPUtilIntegration 初始化失败: {e}")
            return False
    
    def _ensure_initialized(self):
        """确保已初始化"""
        if not self._initialized or not self.util_agent:
            # 同步创建 util agent 作为后备方案
            print(f"\n[Process] 后备初始化 util agent...")
            self.util_agent = MCPResultUtilAgentFactory.create_util_agent(
                self.llm,
                mcp_tools_accessor=self.mcp_tools_accessor,
                mcp_tools=self.mcp_tools
            )
            self._initialized = True
            print(f"[Success] 后备初始化完成")
            print(f"[Success] - 直接工具: {len(self.mcp_tools)} 个")
            print(f"[Success] - 支持依赖链调用: {'是' if self.mcp_tools_accessor else '否'}")
            logger.info(f"MCPUtilIntegration 后备初始化完成，直接工具: {len(self.mcp_tools)}, 支持依赖链调用: {bool(self.mcp_tools_accessor)}")
    
    def process_first_mcp_result_async(
        self,
        user_query: str,
        first_tool_name: str,
        first_result: Any,
        stream_callback = None,
        completion_callback = None,
        workspace_callback = None,
        previous_tool_calls: List[Dict] = None
    ) -> asyncio.Task:
        """处理第一次MCP结果，让util agent决定后续操作 - 异步不阻塞
        
        Args:
            user_query: 用户原始问题
            first_tool_name: 第一次调用的工具名
            first_result: 第一次MCP结果
            stream_callback: 流式输出回调
            completion_callback: 完成回调
            workspace_callback: 工作区发送回调
            
        Returns:
            asyncio.Task: 异步处理任务
        """
        print(f"\n[First MCP] 处理第一次MCP结果: {first_tool_name}")
        print(f"[First MCP] 用户问题: {user_query}")
        
        try:
            self._ensure_initialized()
            
            # 直接调用util agent的真正异步方法
            task = self.util_agent.process_with_first_mcp_result_truly_async(
                user_query=user_query,
                first_tool_name=first_tool_name,
                first_result=first_result,
                stream_callback=stream_callback,
                completion_callback=completion_callback,
                workspace_callback=workspace_callback,
                previous_tool_calls=previous_tool_calls
            )
            logger.info(f"第一次MCP结果处理任务已启动: {first_tool_name}")
            return task
            
        except Exception as e:
            logger.error(f"启动第一次MCP结果处理失败: {e}")
            
            async def error_task():
                return self._fallback_result_processing(user_query, first_tool_name, first_result)
            
            return asyncio.create_task(error_task())

    def process_mcp_result_truly_async(
        self,
        user_query: str,
        tool_name: str,
        raw_result: Any,
        context: Dict[str, Any] = None,
        callback = None,
        workspace_callback = None
    ) -> asyncio.Task:
        """真正异步处理单个 MCP 工具调用结果 - 立即返回，不阻塞
        
        Args:
            user_query: 用户原始查询
            tool_name: 调用的工具名称
            raw_result: MCP 工具返回的原始结果
            context: 额外的上下文信息
            callback: 处理完成回调
            workspace_callback: 工作区发送回调
            
        Returns:
            asyncio.Task: 后台处理任务
        """
        print("\n" + "[Fast]" * 30)
        print("[Fast] [集成接口] 启动真正异步处理")
        print(f"[Tool] 工具: {tool_name}")
        print("[Fast] 立即返回任务，绝不阻塞")
        print("[Fast]" * 30)
        
        try:
            self._ensure_initialized()
            
            # 调用 util agent 的真正异步方法，立即返回任务
            task = self.util_agent.process_mcp_result_truly_async(
                user_query=user_query,
                tool_name=tool_name,
                raw_result=raw_result,
                context=context,
                callback=callback,
                workspace_callback=workspace_callback
            )
            
            logger.info(f"[Fast] 真正异步处理启动成功: {tool_name}")
            return task
            
        except Exception as e:
            logger.error(f"启动真正异步处理失败: {e}")
            # 创建一个失败的任务
            async def error_task():
                error_result = self._fallback_result_processing(user_query, tool_name, raw_result)
                if callback:
                    try:
                        if asyncio.iscoroutinefunction(callback):
                            await callback(error_result, tool_name, user_query)
                        else:
                            callback(error_result, tool_name, user_query)
                    except Exception as cb_e:
                        logger.error(f"错误回调执行失败: {cb_e}")
                return error_result
            
            return asyncio.create_task(error_task())

    async def process_mcp_result(
        self,
        user_query: str,
        tool_name: str,
        raw_result: Any,
        context: Dict[str, Any] = None
    ) -> str:
        """处理单个 MCP 工具调用结果（同步版本，向后兼容）
        
        Args:
            user_query: 用户原始查询
            tool_name: 调用的工具名称
            raw_result: MCP 工具返回的原始结果
            context: 额外的上下文信息
            
        Returns:
            处理后的用户友好回答
        """
        try:
            self._ensure_initialized()
            
            result = await self.util_agent.process_mcp_result(
                user_query=user_query,
                tool_name=tool_name,
                raw_result=raw_result,
                context=context
            )
            
            logger.debug(f"MCP结果处理成功，工具: {tool_name}")
            return result
            
        except Exception as e:
            logger.error(f"处理MCP结果时出错: {e}")
            # 返回原始结果作为后备方案
            return self._fallback_result_processing(user_query, tool_name, raw_result)
    
    async def process_multiple_mcp_results(
        self,
        user_query: str,
        tool_results: List[Dict[str, Any]]
    ) -> str:
        """处理多个 MCP 工具调用结果
        
        Args:
            user_query: 用户查询
            tool_results: 工具结果列表，每个包含 tool_name 和 result
            
        Returns:
            综合处理后的回答
        """
        try:
            self._ensure_initialized()
            
            result = await self.util_agent.batch_process_results(
                user_query=user_query,
                tool_results=tool_results
            )
            
            logger.debug(f"多个MCP结果处理成功，工具数量: {len(tool_results)}")
            return result
            
        except Exception as e:
            logger.error(f"处理多个MCP结果时出错: {e}")
            # 返回简化的后备结果
            return self._fallback_multiple_results_processing(user_query, tool_results)
    
    def _fallback_result_processing(self, user_query: str, tool_name: str, raw_result: Any) -> str:
        """后备结果处理方案 - 但排除记忆工具"""
        # 🚨 强制拦截记忆工具，即使在异常路径中
        if tool_name == "search_similar_memories":
            print(f"[FALLBACK BLOCK] 后备处理中拦截记忆工具: {tool_name}")
            logger.info(f"🛡️ 后备处理中拦截记忆工具: {tool_name}")
            return f"记忆工具 {tool_name} 应由Main Agent处理，不使用Utils Agent后备方案。"
        
        try:
            if isinstance(raw_result, dict):
                # 尝试提取关键信息
                if 'error' in raw_result:
                    return f"抱歉，查询时遇到了问题：{raw_result.get('error', '未知错误')}"
                
                # 简单格式化字典结果
                key_info = []
                for key, value in raw_result.items():
                    if key not in ['timestamp', 'status', 'metadata']:
                        key_info.append(f"{key}: {value}")
                
                if key_info:
                    return f"根据您的查询「{user_query}」，我找到了以下信息：\n" + "\n".join(key_info)
            
            elif isinstance(raw_result, str):
                return f"根据您的查询「{user_query}」，得到以下结果：{raw_result}"
            
            else:
                return f"根据您的查询「{user_query}」，我获取到了相关信息，但处理时遇到了一些问题。原始结果：{str(raw_result)}"
                
        except Exception as e:
            logger.error(f"后备结果处理也失败: {e}")
            return f"抱歉，处理您的查询「{user_query}」时遇到了问题。"
    
    def _fallback_multiple_results_processing(self, user_query: str, tool_results: List[Dict[str, Any]]) -> str:
        """后备多结果处理方案"""
        try:
            if not tool_results:
                return f"抱歉，没有找到关于「{user_query}」的相关信息。"
            
            response = f"根据您的查询「{user_query}」，我找到了以下信息：\n\n"
            
            for i, result in enumerate(tool_results, 1):
                tool_name = result.get('tool_name', f'工具{i}')
                tool_result = result.get('result', '无结果')
                
                if isinstance(tool_result, dict):
                    # 简单提取字典中的有用信息
                    useful_info = []
                    for key, value in tool_result.items():
                        if key not in ['timestamp', 'status', 'metadata'] and value:
                            useful_info.append(f"{key}: {value}")
                    
                    if useful_info:
                        response += f"{i}. {tool_name}：\n" + "\n".join(f"   - {info}" for info in useful_info) + "\n\n"
                else:
                    response += f"{i}. {tool_name}：{str(tool_result)}\n\n"
            
            return response.strip()
            
        except Exception as e:
            logger.error(f"后备多结果处理失败: {e}")
            return f"抱歉，处理您的查询「{user_query}」时遇到了问题。"


class MCPUtilIntegrationManager:
    """MCP Util 集成管理器，单例模式"""
    
    _instance = None
    _integration_cache: Dict[str, MCPUtilIntegration] = {}
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(MCPUtilIntegrationManager, cls).__new__(cls)
        return cls._instance
    
    def get_integration(
        self, 
        llm: StatelessLLMInterface, 
        cache_key: str = "default",
        mcp_tools_accessor: Optional[Callable] = None,
        mcp_tools: Optional[List] = None
    ) -> MCPUtilIntegration:
        """获取集成实例
        
        Args:
            llm: StatelessLLM 实例
            cache_key: 缓存键
            mcp_tools_accessor: MCP工具访问器（向后兼容）
            mcp_tools: 直接传入的MCP工具列表（推荐）
            
        Returns:
            MCPUtilIntegration 实例
        """
        # 如果直接提供了MCP工具列表，创建新的集成实例
        if mcp_tools:
            print(f"[Direct] 创建使用直接工具列表的MCPUtilIntegration: {cache_key}")
            integration = MCPUtilIntegration(llm, mcp_tools_accessor, mcp_tools)
            self._integration_cache[cache_key] = integration
            logger.info(f"创建新的使用直接工具列表的 MCPUtilIntegration 实例: {cache_key}, 工具数量: {len(mcp_tools)}")
            return integration
        
        # 如果提供了MCP工具访问器，创建新的集成实例（支持依赖链调用）
        if mcp_tools_accessor:
            print(f"[Chain] 创建支持依赖链的MCPUtilIntegration: {cache_key}")
            integration = MCPUtilIntegration(llm, mcp_tools_accessor)
            self._integration_cache[cache_key] = integration
            logger.info(f"创建新的支持依赖链的 MCPUtilIntegration 实例: {cache_key}")
            return integration
        
        if cache_key not in self._integration_cache:
            integration = MCPUtilIntegration(llm)
            self._integration_cache[cache_key] = integration
            logger.info(f"创建新的 MCPUtilIntegration 实例: {cache_key}")
        
        return self._integration_cache[cache_key]
    
    async def initialize_integration(self, llm: StatelessLLMInterface, cache_key: str = "default") -> bool:
        """异步初始化集成实例"""
        integration = self.get_integration(llm, cache_key)
        return await integration.initialize()
    
    def clear_cache(self):
        """清空集成缓存"""
        self._integration_cache.clear()
        logger.info("MCPUtilIntegration 缓存已清空")


# 便捷函数
def get_mcp_util_integration(
    llm: StatelessLLMInterface, 
    cache_key: str = "default", 
    mcp_tools_accessor: Optional[Callable] = None,
    mcp_tools: Optional[List] = None
) -> MCPUtilIntegration:
    """获取 MCP Util 集成实例的便捷函数"""
    manager = MCPUtilIntegrationManager()
    return manager.get_integration(llm, cache_key, mcp_tools_accessor, mcp_tools)


async def initialize_mcp_util_integration(llm: StatelessLLMInterface, cache_key: str = "default") -> bool:
    """异步初始化 MCP Util 集成的便捷函数"""
    manager = MCPUtilIntegrationManager()
    return await manager.initialize_integration(llm, cache_key)


# 原 agent 集成帮助类
class AgentMCPUtilHelper:
    """
    为原 agent 提供的 MCP Util 集成帮助类
    
    支持异步处理 MCP 结果，不阻塞原 agent
    """
    
    def __init__(self, agent, llm: StatelessLLMInterface):
        """初始化帮助类
        
        Args:
            agent: 原 agent 实例
            llm: StatelessLLM 实例
        """
        print(f"\n[Agent Helper] AgentMCPUtilHelper 初始化")
        print(f"[Agent Helper] Agent类型: {type(agent).__name__}")
        print(f"[Agent Helper] LLM类型: {type(llm).__name__}")
        
        self.agent = agent
        
        # 创建MCP工具访问器函数
        async def mcp_tools_accessor():
            """访问主agent的MCP工具列表"""
            print(f"\n[Tool Accessor] MCP工具访问器被调用")
            if hasattr(agent, 'tools') and agent.tools:
                print(f"[Tool Accessor] 从agent.tools获取到 {len(agent.tools)} 个工具")
                return agent.tools
            elif hasattr(agent, 'mcp_client') and agent.mcp_client:
                print(f"[Tool Accessor] 从agent.mcp_client获取工具...")
                try:
                    tools = await agent.mcp_client.get_tools()
                    print(f"[Tool Accessor] 从mcp_client获取到 {len(tools) if tools else 0} 个工具")
                    return tools or []
                except Exception as e:
                    print(f"[Tool Accessor] 从mcp_client获取工具失败: {e}")
                    return []
            else:
                print(f"[Tool Accessor] agent没有可用的工具或mcp_client")
                return []
        
        # 优先使用直接工具列表
        agent_tools = None
        if hasattr(agent, 'tools') and agent.tools:
            agent_tools = agent.tools
            print(f"[Direct] 直接从agent.tools获取到 {len(agent_tools)} 个工具")
        
        # 使用直接工具列表或工具访问器创建集成
        self.integration = get_mcp_util_integration(llm, mcp_tools_accessor=mcp_tools_accessor, mcp_tools=agent_tools)
        self._integration_initialized = False
        # 异步任务追踪
        self._background_tasks = set()
        
        print(f"[Success] AgentMCPUtilHelper 初始化完成")
    
    async def ensure_integration_ready(self):
        """确保集成已准备就绪"""
        if not self._integration_initialized:
            success = await self.integration.initialize()
            self._integration_initialized = success
            if success:
                logger.info("Agent MCP Util 集成已准备就绪")
            else:
                logger.warning("Agent MCP Util 集成初始化失败，将使用后备方案")
    
    def handle_first_mcp_result_async(
        self,
        user_query: str,
        first_tool_name: str,
        first_result: Any,
        stream_callback = None,
        completion_callback = None,
        workspace_callback = None,
        previous_tool_calls: List[Dict] = None
    ) -> Optional[asyncio.Task]:
        """处理第一次MCP结果，异步不阻塞
        
        Args:
            user_query: 用户问题
            first_tool_name: 第一次调用的工具名
            first_result: 第一次MCP结果
            stream_callback: 流式输出回调（发送到工作区）
            completion_callback: 完成回调
            workspace_callback: 工作区发送回调
            
        Returns:
            asyncio.Task 或 None
        """
        print(f"\n[Helper] 处理第一次MCP结果: {first_tool_name}")
        
        if self.should_use_util_agent(first_tool_name):
            print("[Helper] 启动util agent处理...")
            
            try:
                task = self.integration.process_first_mcp_result_async(
                    user_query=user_query,
                    first_tool_name=first_tool_name,
                    first_result=first_result,
                    stream_callback=stream_callback,
                    completion_callback=completion_callback,
                    workspace_callback=workspace_callback,
                    previous_tool_calls=previous_tool_calls
                )
                
                # 添加到任务追踪
                self._background_tasks.add(task)
                task.add_done_callback(self._background_tasks.discard)
                
                print(f"[Helper] 任务创建成功！任务总数: {len(self._background_tasks)}")
                logger.info(f"启动第一次MCP结果异步处理: {first_tool_name}")
                return task
                
            except Exception as e:
                print(f"[Helper Error] 启动异步处理失败: {e}")
                logger.error(f"启动第一次MCP结果异步处理失败: {e}")
                return None
        else:
            print("[Helper] 跳过记忆工具，不使用util agent处理")
            logger.info(f"跳过记忆工具，不异步处理: {first_tool_name}")
            return None

    def handle_mcp_result_truly_async(
        self,
        user_query: str,
        tool_name: str,
        raw_result: Any,
        context: Dict[str, Any] = None,
        callback = None,
        workspace_callback = None
    ) -> Optional[asyncio.Task]:
        """真正异步处理 MCP 结果，绝不阻塞原 agent - 立即返回
        
        Args:
            user_query: 用户查询
            tool_name: 工具名称
            raw_result: 原始结果
            context: 上下文
            callback: 处理完成后的回调函数
            workspace_callback: 工作区发送回调
            
        Returns:
            asyncio.Task 或 None
        """
        print(f"\n[ASYNC REQUEST] ========== 异步处理请求 ==========")
        print(f"[ASYNC REQUEST] 用户查询: {user_query}")
        print(f"[ASYNC REQUEST] 工具名称: '{tool_name}'")
        print(f"[ASYNC REQUEST] ==============================\n")
        
        should_use_util = self.should_use_util_agent(tool_name)
        
        print(f"\n[ASYNC DECISION] ========== 路由决策结果 ==========")
        print(f"[ASYNC DECISION] 工具: '{tool_name}'")
        print(f"[ASYNC DECISION] 使用Util Agent: {should_use_util}")
        print(f"[ASYNC DECISION] ==============================\n")
        
        if should_use_util:
            print("[Fast] 启动真正异步处理，立即返回任务...")
            
            try:
                # 使用真正异步的方法，立即返回任务
                task = self.integration.process_mcp_result_truly_async(
                    user_query=user_query,
                    tool_name=tool_name,
                    raw_result=raw_result,
                    context=context,
                    callback=callback,
                    workspace_callback=workspace_callback
                )
                
                # 添加到任务追踪
                self._background_tasks.add(task)
                task.add_done_callback(self._background_tasks.discard)
                
                print(f"[Fast] 任务创建成功，立即返回！任务总数: {len(self._background_tasks)}")
                print("[Async]" * 20)
                logger.info(f"[Fast] 启动真正异步处理: {tool_name}")
                return task
                
            except Exception as e:
                print("[Async]" * 20)
                logger.error(f"启动真正异步处理失败: {e}")
                return None
        else:
            print(f"\n[SKIP UTIL] ========== 跳过Util Agent处理 ==========")
            print(f"[SKIP UTIL] 工具名称: '{tool_name}'")
            print(f"[SKIP UTIL] 原因: 记忆工具或其他不需要Util Agent的工具")
            print(f"[SKIP UTIL] ===================================\n")
            logger.info(f"跳过记忆工具，不异步处理: {tool_name}")
            return None
    
    def handle_multiple_mcp_results_async(
        self,
        user_query: str,
        tool_results: List[Dict[str, Any]],
        callback = None
    ) -> None:
        """异步处理多个 MCP 结果，不阻塞原 agent
        
        Args:
            user_query: 用户查询
            tool_results: 工具结果列表
            callback: 处理完成后的回调函数
        """
        # 过滤出需要 util agent 处理的结果
        filtered_results = self.filter_non_memory_tools(tool_results)
        
        if filtered_results:
            # 创建后台任务
            task = asyncio.create_task(
                self._background_process_multiple_results(
                    user_query, filtered_results, callback
                )
            )
            self._background_tasks.add(task)
            task.add_done_callback(self._background_tasks.discard)
            logger.info(f"启动异步处理多个 MCP 结果，数量: {len(filtered_results)}")
        else:
            logger.info("没有需要 util agent 处理的结果，跳过异步处理")
    
    async def _background_process_single_result(
        self,
        user_query: str,
        tool_name: str,
        raw_result: Any,
        context: Dict[str, Any],
        callback
    ):
        """后台处理单个结果"""
        print(f"\n[Fast] [后台任务] 开始异步处理工具: {tool_name}")
        start_time = asyncio.get_event_loop().time()
        
        try:
            print("[Config] 确保集成接口准备就绪...")
            await self.ensure_integration_ready()
            
            print("[Send] 调用 Util Agent 处理结果...")
            processed_result = await self.integration.process_mcp_result(
                user_query, tool_name, raw_result, context
            )
            
            end_time = asyncio.get_event_loop().time()
            processing_time = end_time - start_time
            
            print(f"[Fast] [后台任务] 异步处理完成: {tool_name}")
            print(f"[Time]  处理耗时: {processing_time:.2f} 秒")
            print(f"[Info] 是否有回调函数: {'是' if callback else '否'}")
            
            # 调用回调函数
            if callback:
                try:
                    print("[Callback] 执行回调函数...")
                    if asyncio.iscoroutinefunction(callback):
                        await callback(processed_result, tool_name, user_query)
                    else:
                        callback(processed_result, tool_name, user_query)
                    print("[Success] 回调函数执行成功")
                except Exception as e:
                    print(f"[Error] 回调函数执行失败: {e}")
                    logger.error(f"回调函数执行失败: {e}")
            else:
                print("[Query] 无回调函数，结果处理完毕")
                
            logger.info(f"异步处理完成: {tool_name}")
                    
        except Exception as e:
            end_time = asyncio.get_event_loop().time()
            processing_time = end_time - start_time
            
            print(f"[Error] [后台任务] 异步处理失败: {tool_name}")
            print(f"[Time]  失败耗时: {processing_time:.2f} 秒")
            print(f"[Block] 错误信息: {str(e)}")
            
            logger.error(f"异步处理 MCP 结果失败: {e}")
            
            if callback:
                try:
                    error_result = f"处理 {tool_name} 结果时出错: {str(e)}"
                    print("[Callback] 执行错误回调函数...")
                    if asyncio.iscoroutinefunction(callback):
                        await callback(error_result, tool_name, user_query)
                    else:
                        callback(error_result, tool_name, user_query)
                    print("[Success] 错误回调执行成功")
                except Exception as cb_e:
                    print(f"[Error] 错误回调执行失败: {cb_e}")
                    logger.error(f"错误回调执行失败: {cb_e}")
    
    async def _background_process_multiple_results(
        self,
        user_query: str,
        tool_results: List[Dict[str, Any]],
        callback
    ):
        """后台处理多个结果"""
        try:
            await self.ensure_integration_ready()
            
            processed_result = await self.integration.process_multiple_mcp_results(
                user_query, tool_results
            )
            
            logger.info(f"异步处理多个结果完成，数量: {len(tool_results)}")
            
            # 调用回调函数
            if callback:
                try:
                    if asyncio.iscoroutinefunction(callback):
                        await callback(processed_result, tool_results, user_query)
                    else:
                        callback(processed_result, tool_results, user_query)
                except Exception as e:
                    logger.error(f"回调函数执行失败: {e}")
                    
        except Exception as e:
            logger.error(f"异步处理多个 MCP 结果失败: {e}")
            if callback:
                try:
                    error_result = f"处理多个工具结果时出错: {str(e)}"
                    if asyncio.iscoroutinefunction(callback):
                        await callback(error_result, tool_results, user_query)
                    else:
                        callback(error_result, tool_results, user_query)
                except Exception as cb_e:
                    logger.error(f"错误回调执行失败: {cb_e}")
    
    async def wait_for_background_tasks(self, timeout: float = 30.0):
        """等待所有后台任务完成（可选，用于测试或关闭时）"""
        if self._background_tasks:
            try:
                await asyncio.wait_for(
                    asyncio.gather(*self._background_tasks, return_exceptions=True),
                    timeout=timeout
                )
                logger.info("所有后台处理任务已完成")
            except asyncio.TimeoutError:
                logger.warning(f"等待后台任务超时 ({timeout}秒)，强制取消")
                for task in self._background_tasks:
                    task.cancel()
                self._background_tasks.clear()
    
    # 保留同步方法以便向后兼容
    async def handle_mcp_result(
        self,
        user_query: str,
        tool_name: str,
        raw_result: Any,
        context: Dict[str, Any] = None
    ) -> str:
        """处理 MCP 结果的简化接口（同步版本）"""
        await self.ensure_integration_ready()
        return await self.integration.process_mcp_result(
            user_query, tool_name, raw_result, context
        )
    
    async def handle_multiple_mcp_results(
        self,
        user_query: str,
        tool_results: List[Dict[str, Any]]
    ) -> str:
        """处理多个 MCP 结果的简化接口（同步版本）"""
        await self.ensure_integration_ready()
        return await self.integration.process_multiple_mcp_results(
            user_query, tool_results
        )
    
    def is_memory_related_tool(self, tool_name: str) -> bool:
        """根据MCP工具名称判断是否是记忆相关的工具（util agent 不处理这类工具）"""
        # 基于实际存在于 src/open_llm_vtuber/tools/ 目录中的记忆工具
        memory_tool_names = {
            'search_similar_memories'  # memory_tools.py 中唯一的记忆工具
        }
        
        # 强化匹配逻辑：精确匹配工具名称
        normalized_tool_name = tool_name.lower().strip()
        is_memory = normalized_tool_name in memory_tool_names
        
        print(f"\n[HARD CHECK] ========== 记忆工具检查 ==========")
        print(f"[HARD CHECK] 原始工具名: '{tool_name}'")
        print(f"[HARD CHECK] 标准化后: '{normalized_tool_name}'")
        print(f"[HARD CHECK] 记忆工具集: {memory_tool_names}")
        print(f"[HARD CHECK] 是否为记忆工具: {is_memory}")
        print(f"[HARD CHECK] =====================================\n")
        
        logger.info(f"[Brain] 工具记忆类型检查: '{tool_name}' -> {is_memory} (记忆工具集合: {memory_tool_names})")
        return is_memory
    
    def should_use_util_agent(self, tool_name: str) -> bool:
        """判断是否应该使用 util agent 处理此工具的结果"""
        is_memory = self.is_memory_related_tool(tool_name)
        should_use = not is_memory
        
        print(f"\n[UTIL AGENT CHECK] ========== 工具路由决策 ==========")
        print(f"[UTIL AGENT CHECK] 工具名: '{tool_name}'")
        print(f"[UTIL AGENT CHECK] 是否记忆工具: {is_memory}")
        print(f"[UTIL AGENT CHECK] 是否使用Util Agent: {should_use}")
        print(f"[UTIL AGENT CHECK] ================================\n")
        
        logger.info(f"[Brain] 工具路由决策: '{tool_name}' -> 记忆工具:{is_memory}, 使用UtilAgent:{should_use}")
        return should_use
    
    def filter_non_memory_tools(self, tool_results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """过滤掉记忆相关工具的结果，只保留非记忆工具结果供 util agent 处理"""
        filtered_results = []
        
        for result in tool_results:
            tool_name = result.get('tool_name', '')
            if self.should_use_util_agent(tool_name):
                filtered_results.append(result)
            else:
                logger.info(f"跳过记忆工具结果，不使用 util agent 处理: {tool_name}")
        
        return filtered_results


# 使用示例
async def example_integration_usage():
    """集成使用示例 - 异步分流处理策略"""
    # 在原 agent 中的使用方式：
    
    # 1. 初始化帮助类（在 agent 初始化时）
    # helper = AgentMCPUtilHelper(self, self.llm)
    
    # 2. 异步 MCP 调用结果处理 - 推荐方式
    # def result_callback(processed_result, tool_name, user_query):
    #     """处理完成后的回调"""
    #     print(f"工具 {tool_name} 处理完成: {processed_result}")
    #     # 这里可以做进一步处理，比如发送到前端、记录日志等
    # 
    # tool_name = "weather_tool"
    # raw_result = {"temperature": 25, "condition": "晴天"}
    # 
    # # 异步启动处理，不阻塞原 agent
    # helper.handle_mcp_result_async(
    #     user_query="今天北京天气怎么样？",
    #     tool_name=tool_name,
    #     raw_result=raw_result,
    #     callback=result_callback
    # )
    # 
    # # 原 agent 立即继续处理，不等待 util agent
    # return "我正在为您查询天气信息..."  # 立即返回给用户
    
    # 3. 多工具异步处理
    # def multiple_results_callback(processed_result, tool_results, user_query):
    #     """多工具处理完成的回调"""
    #     print(f"处理了 {len(tool_results)} 个工具的结果: {processed_result}")
    # 
    # all_tool_results = [
    #     {"tool_name": "weather_tool", "result": {...}},
    #     {"tool_name": "search_similar_memories", "result": {...}},  # 这个会被过滤掉
    #     {"tool_name": "route_tool", "result": {...}}
    # ]
    # 
    # # 异步启动处理
    # helper.handle_multiple_mcp_results_async(
    #     user_query="帮我查路线和天气",
    #     tool_results=all_tool_results,
    #     callback=multiple_results_callback
    # )
    # 
    # # 原 agent 立即返回
    # return "我正在整理相关信息..."
    
    # 4. 如果需要同步处理（不推荐，会阻塞）
    # if helper.should_use_util_agent(tool_name):
    #     processed_result = await helper.handle_mcp_result(
    #         user_query="今天北京天气怎么样？",
    #         tool_name=tool_name,
    #         raw_result=raw_result
    #     )
    #     return processed_result
    # else:
    #     # 记忆工具，走原流程
    #     return None
    
    # 5. 关闭时等待所有异步任务完成（可选）
    # await helper.wait_for_background_tasks(timeout=10.0)
    
    pass