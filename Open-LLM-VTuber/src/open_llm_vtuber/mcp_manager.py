import json
import os
import aiohttp
import asyncio
from typing import Dict, List, Optional, Any
from loguru import logger
from datetime import datetime


class MCPManager:
    """MCP工具管理器，类似Cursor的MCP配置管理"""

    def __init__(self, config_file_path: str = "enhanced_mcp_config.json"):
        self.config_file_path = config_file_path
        self.config = self._load_config()
        # 从配置文件中获取搜索API URL
        self.search_api_url = self.config.get("searchApiUrl", "http://13.54.95.72:8080/mcp/search/agent")
        # 添加设备级session管理：key格式为 "user_id_client_uid_tool_name"
        self.device_sessions = {}  # 存储每个设备的session信息
        logger.info(f"MCP Manager使用搜索API URL: {self.search_api_url}")

    def _load_config(self) -> Dict[str, Any]:
        """加载MCP工具配置"""
        try:
            if os.path.exists(self.config_file_path):
                with open(self.config_file_path, 'r', encoding='utf-8') as f:
                    config = json.load(f)
                    logger.info(f"Loaded MCP config with {len(config.get('mcpServers', {}))} tools")
                    return config
            else:
                logger.warning(f"MCP config file not found: {self.config_file_path}")
                return self._create_default_config()
        except Exception as e:
            logger.error(f"Error loading MCP config: {e}")
            return self._create_default_config()
    
    def _create_default_config(self) -> Dict[str, Any]:
        """创建默认配置"""
        return {
            "mcpServers": {},
            "lastUpdated": datetime.now().isoformat()
        }
    
    def _save_config(self):
        """保存配置到文件"""
        try:
            self.config["lastUpdated"] = datetime.now().isoformat()
            with open(self.config_file_path, 'w', encoding='utf-8') as f:
                json.dump(self.config, f, ensure_ascii=False, indent=2)
            logger.info("MCP config saved successfully")
        except Exception as e:
            logger.error(f"Error saving MCP config: {e}")

    def _get_device_session_key(self, user_id: str, client_uid: str, tool_name: str) -> str:
        """生成设备级session的唯一标识"""
        return f"{user_id}_{client_uid}_{tool_name}"

    def get_device_session(self, user_id: str, client_uid: str, tool_name: str) -> Optional[str]:
        """获取特定设备的session ID"""
        session_key = self._get_device_session_key(user_id, client_uid, tool_name)
        return self.device_sessions.get(session_key)

    def set_device_session(self, user_id: str, client_uid: str, tool_name: str, session_id: str):
        """设置特定设备的session ID"""
        session_key = self._get_device_session_key(user_id, client_uid, tool_name)
        self.device_sessions[session_key] = session_id
        logger.info(f"Set device session for {session_key}: {session_id}")

    def clear_device_session(self, user_id: str, client_uid: str, tool_name: str):
        """清除特定设备的session"""
        session_key = self._get_device_session_key(user_id, client_uid, tool_name)
        if session_key in self.device_sessions:
            del self.device_sessions[session_key]
            logger.info(f"Cleared device session for {session_key}")
    
    def find_matching_tool(self, user_requirement: str) -> Optional[Dict[str, Any]]:
        """简化版工具查找 - 移除硬编码匹配逻辑，由大模型自主选择"""
        # 获取所有启用的工具
        available_tools = self.get_available_tools()
        enabled_tools = {name: config for name, config in available_tools.items()
                        if config.get("enabled", True)}

        if not enabled_tools:
            logger.warning("No enabled tools available")
            return None

        # 返回第一个可用工具，让上层（大模型）决定使用哪个
        # 这里可以根据需要调整策略，比如随机选择或按配置优先级
        first_tool_name = list(enabled_tools.keys())[0]
        first_tool_config = enabled_tools[first_tool_name]

        logger.info(f"Returning first available tool for LLM selection: {first_tool_name}")
        logger.info(f"User requirement: {user_requirement}")
        logger.info("Hard-coded matching logic removed - LLM will decide tool selection")

        return {
            "tool_name": first_tool_name,
            "config": first_tool_config,
            "match_keyword": None,  # 不再使用关键词匹配
            "score": 100  # 固定分数，让LLM决定
        }
    
    async def search_new_tools(self, requirement: str) -> Optional[Dict[str, Any]]:
        """搜索新的MCP工具"""
        try:
            search_url = self.search_api_url
            if not search_url:
                logger.error("No search API URL configured")
                return None
            
            payload = {"requirement": requirement}
            logger.info(f"Searching for new MCP tools with requirement: {requirement}")
            
            async with aiohttp.ClientSession() as session:
                async with session.post(search_url, json=payload) as response:
                    if response.status == 200:
                        result = await response.json()
                        logger.info(f"Found new tools: {result}")
                        return result
                    else:
                        logger.error(f"Search API error: {response.status}")
                        return None
        except Exception as e:
            logger.error(f"Error searching for new tools: {e}")
            return None
    
    def add_tools_from_search_result(self, search_result: Dict[str, Any], requirement: str):
        """将搜索结果中的工具添加到配置文件"""
        if not search_result or search_result.get("code") != 200:
            logger.warning("Invalid search result")
            return
        
        data = search_result.get("data", {})
        added_tools = []
        updated_tools = []
        
        for tool_key, tool_info in data.items():
            tool_id = tool_info.get("mcp_id")
            
            # 检查是否已存在相同 ID 的工具
            existing_tool = None
            existing_key = None
            for key, config in self.config["mcpServers"].items():
                if config.get("mcp_id") == tool_id:
                    existing_tool = config
                    existing_key = key
                    break
            
            if existing_tool:
                # 更新现有工具的信息
                existing_tool.update({
                    "description": tool_info.get("description", existing_tool.get("description", "")),
                    "reason": tool_info.get("reason", existing_tool.get("reason", "")),
                    "type": tool_info.get("type", existing_tool.get("type", "sse")),
                    "url": tool_info.get("url", existing_tool.get("url", "")),
                })
                
                # 合并关键词
                new_keywords = self._generate_keywords(tool_info, "")  # 不使用用户需求生成关键词
                existing_keywords = set(existing_tool.get("keywords", []))
                existing_tool["keywords"] = list(existing_keywords.union(new_keywords))
                
                updated_tools.append(existing_key)
                logger.info(f"Updated existing MCP tool: {existing_key}")
                
            else:
                # 添加新工具
                keywords = self._generate_keywords(tool_info, "")  # 不使用用户需求生成关键词
                
                tool_config = {
                    "command": "node",
                    "args": [],
                    "env": {},
                    "description": tool_info.get("description", ""),
                    "reason": tool_info.get("reason", ""),
                    "mcp_id": tool_id,
                    "type": tool_info.get("type", "sse"),
                    "url": tool_info.get("url", ""),
                    "keywords": keywords,
                    "enabled": True
                }
                
                self.config["mcpServers"][tool_key] = tool_config
                added_tools.append(tool_key)
                logger.info(f"Added new MCP tool: {tool_key}")
        
        if added_tools or updated_tools:
            self._save_config()
            if added_tools:
                logger.info(f"Added {len(added_tools)} new tools: {added_tools}")
            if updated_tools:
                logger.info(f"Updated {len(updated_tools)} existing tools: {updated_tools}")
    
    def _generate_keywords(self, tool_info: Dict[str, Any], requirement: str = "") -> List[str]:
        """简化的关键词生成 - 移除硬编码逻辑"""
        # 只从工具的原始描述中提取基本信息
        description = tool_info.get("description", "")

        # 直接返回描述中的词汇，让LLM自行判断
        if description:
            # 简单分词，移除停用词
            import jieba
            words = list(jieba.cut(description))
            # 过滤掉长度过短的词
            keywords = [w for w in words if len(w) >= 2 and w.strip()]
            return keywords[:10]  # 限制数量，避免过多

        return []

    def get_all_tools_for_llm_selection(self) -> Dict[str, Any]:
        """获取所有可用工具信息，供大模型选择"""
        available_tools = self.get_available_tools()

        # 只返回启用的工具
        enabled_tools = {name: config for name, config in available_tools.items()
                        if config.get("enabled", True)}

        # 为大模型提供结构化的工具信息
        tools_info = {}
        for tool_name, tool_config in enabled_tools.items():
            tools_info[tool_name] = {
                "name": tool_name,
                "description": tool_config.get("description", ""),
                "type": tool_config.get("type", ""),
                "url": tool_config.get("url", ""),
                "keywords": tool_config.get("keywords", []),
                "enabled": tool_config.get("enabled", True)
            }

        logger.info(f"Returning {len(tools_info)} tools for LLM selection")
        return tools_info

    def select_tool_by_name(self, tool_name: str) -> Optional[Dict[str, Any]]:
        """根据工具名称选择工具（供大模型调用）"""
        available_tools = self.get_available_tools()

        # 只考虑启用的工具
        enabled_tools = {name: config for name, config in available_tools.items()
                        if config.get("enabled", True)}

        if tool_name not in enabled_tools:
            logger.warning(f"Tool '{tool_name}' not found or not enabled")
            return None

        tool_config = enabled_tools[tool_name]
        logger.info(f"LLM selected tool: {tool_name}")

        return {
            "tool_name": tool_name,
            "config": tool_config,
            "match_keyword": None,
            "score": 100
        }

    async def call_mcp_tool_for_device(self, tool_config: Dict[str, Any], requirement: str,
                                      user_id: str, client_uid: str, tool_name: str) -> Optional[Dict[str, Any]]:
        """为特定设备调用MCP工具，支持设备级session管理"""
        try:
            tool_url = tool_config.get("url")
            if not tool_url:
                logger.error("Tool URL not found in config")
                return None

            is_sse = tool_config.get("type", "").lower() == "sse"
            logger.info(f"Calling MCP tool for device {client_uid} (user: {user_id}): {tool_name}")
            logger.info(f"Tool URL: {tool_url}, Type: {'SSE' if is_sse else 'Regular'}")

            async with aiohttp.ClientSession() as session:
                if is_sse:
                    # 检查是否有现有的设备session
                    existing_session_id = self.get_device_session(user_id, client_uid, tool_name)

                    if existing_session_id:
                        # 尝试使用现有session
                        logger.info(f"Using existing session for device {client_uid}: {existing_session_id}")
                        base_url = tool_url.rsplit('/', 1)[0]
                        messages_url = f"{base_url}/messages/?session_id={existing_session_id}"

                        try:
                            async with session.get(messages_url, timeout=10) as response:
                                if response.status == 200:
                                    result = await response.json()
                                    logger.info(f"Reused session result for device {client_uid}: {result}")
                                    return result
                        except Exception as e:
                            logger.warning(f"Failed to reuse session for device {client_uid}, creating new one: {e}")
                            self.clear_device_session(user_id, client_uid, tool_name)

                    # 创建新的SSE连接
                    params = {"requirement": requirement}
                    async with session.get(tool_url, params=params, timeout=30) as response:
                        if response.status == 200:
                            session_id = None
                            endpoint = None
                            async for line in response.content:
                                line = line.decode('utf-8').strip()
                                if line.startswith('data: '):
                                    endpoint = line[6:].strip()
                                    if '/messages/?session_id=' in endpoint:
                                        session_id = endpoint.split('session_id=')[1].strip()
                                        # 保存session到设备级存储
                                        self.set_device_session(user_id, client_uid, tool_name, session_id)
                                        logger.info(f"Device {client_uid} got new session ID: {session_id}")
                                        break

                            if session_id and endpoint:
                                # 获取实际结果
                                base_url = tool_url.rsplit('/', 1)[0]
                                messages_url = f"{base_url}{endpoint}" if endpoint.startswith('/') else f"{base_url}/{endpoint}"

                                async with session.get(messages_url, timeout=30) as msg_response:
                                    if msg_response.status == 200:
                                        result = await msg_response.json()
                                        logger.info(f"Device {client_uid} tool result: {result}")
                                        return result
                                    else:
                                        logger.error(f"Messages request failed for device {client_uid}: {msg_response.status}")
                                        return None
                            else:
                                logger.error(f"No session ID received for device {client_uid}")
                                return None
                        else:
                            logger.error(f"Tool request failed for device {client_uid}: {response.status}")
                            return None
                else:
                    # 非SSE工具
                    async with session.post(tool_url, json={"requirement": requirement}, timeout=30) as response:
                        if response.status == 200:
                            result = await response.json()
                            logger.info(f"Device {client_uid} tool result: {result}")
                            return result
                        else:
                            logger.error(f"Tool request failed for device {client_uid}: {response.status}")
                            return None

        except Exception as e:
            logger.error(f"Error calling MCP tool for device {client_uid}: {e}")
            return {
                "error": True,
                "error_type": type(e).__name__,
                "error_message": str(e),
                "device_id": client_uid,
                "user_id": user_id
            }

    async def call_mcp_tool(self, tool_config: Dict[str, Any], requirement: str) -> Optional[Dict[str, Any]]:
        """调用MCP工具
        
        该函数负责调用MCP工具并处理响应。支持SSE和REST两种类型的工具。
        对于SSE类型的工具，会先获取session_id，然后使用session_id获取实际结果。
        
        特性:
        - 支持多种URL格式尝试
        - 实现了自动重试机制（最多3次，指数退避）
        - 详细的错误处理和日志记录
        
        Args:
            tool_config: 工具配置，包含URL、类型等信息
            requirement: 用户请求内容
            
        Returns:
            工具调用结果，如果失败则返回错误信息
        """
        try:
            tool_url = tool_config.get("url")
            if not tool_url:
                logger.error("Tool URL not found in config")
                return None

            # 如果是 SSE 类型的工具，使用 GET 方法
            is_sse = tool_config.get("type", "").lower() == "sse"
            logger.info(f"Calling MCP tool with URL: {tool_url}")
            logger.info(f"Tool type: {'SSE' if is_sse else 'Regular'}")
            logger.info(f"Request requirement: {requirement}")
            
            async with aiohttp.ClientSession() as session:
                if is_sse:
                    # 对于 SSE 工具，将参数添加到 URL 中
                    params = {"requirement": requirement}
                    logger.info(f"Making GET request with params: {params}")
                    try:
                        # 第一步：获取 session_id
                        async with session.get(tool_url, params=params, timeout=30) as response:
                            logger.info(f"Response status: {response.status}")
                            logger.info(f"Response headers: {response.headers}")
                            if response.status == 200:
                                session_id = None
                                endpoint = None
                                async for line in response.content:
                                    line = line.decode('utf-8').strip()
                                    logger.info(f"SSE line: {line}")
                                    if line.startswith('event: endpoint'):
                                        # 跳过事件行，下一行是数据行
                                        continue
                                    if line.startswith('data: '):
                                        try:
                                            # 提取endpoint和session_id
                                            endpoint = line[6:].strip()  # 去掉 "data: " 前缀
                                            if '/messages/?session_id=' in endpoint:
                                                session_id = endpoint.split('session_id=')[1].strip()
                                                logger.info(f"Got session ID: {session_id}")
                                                logger.info(f"Got endpoint: {endpoint}")
                                                break
                                        except Exception as e:
                                            logger.error(f"Failed to parse session ID: {e}")
                                            continue

                                if session_id and endpoint:
                                    # 第二步：使用完整的 endpoint 获取实际结果
                                    # 从工具 URL 中提取基础域名和路径
                                    base_url = tool_url.rsplit('/', 1)[0]  # 移除最后一个路径部分（通常是 'sse'）
                                    messages_url = f"{base_url}{endpoint}" if endpoint.startswith('/') else f"{base_url}/{endpoint}"
                                    logger.info(f"Making GET request to messages endpoint: {messages_url}")
                                    
                                    # 添加重试逻辑
                                    max_retries = 3
                                    retry_delay = 1  # 秒
                                    
                                    for retry in range(max_retries):
                                        try:
                                            async with session.get(messages_url, timeout=30) as msg_response:
                                                if msg_response.status == 200:
                                                    result = await msg_response.json()
                                                    logger.info(f"Messages response: {result}")
                                                    return result
                                                else:
                                                    response_text = await msg_response.text()
                                                    logger.error(f"Messages request failed with status {msg_response.status}")
                                                    logger.error(f"Response body: {response_text}")
                                                    
                                                    # 如果是404错误，可能是endpoint格式问题，尝试修改URL格式
                                                    if msg_response.status == 404 and retry == 0:
                                                        # 尝试替代URL格式
                                                        base_url = tool_url.split('/sse')[0]
                                                        messages_url = f"{base_url}/messages/?session_id={session_id}"
                                                        logger.info(f"Retrying with alternative URL format: {messages_url}")
                                                        continue
                                                    
                                                    if retry < max_retries - 1:
                                                        logger.info(f"Retrying in {retry_delay} seconds... (attempt {retry+1}/{max_retries})")
                                                        await asyncio.sleep(retry_delay)
                                                        retry_delay *= 2  # 指数退避
                                                    else:
                                                        return None
                                        except aiohttp.ClientError as e:
                                            logger.error(f"Network error during GET request to messages endpoint: {str(e)}")
                                            if retry < max_retries - 1:
                                                logger.info(f"Retrying in {retry_delay} seconds... (attempt {retry+1}/{max_retries})")
                                                await asyncio.sleep(retry_delay)
                                                retry_delay *= 2
                                            else:
                                                return None
                                        except asyncio.TimeoutError:
                                            logger.error("Request to messages endpoint timed out")
                                            if retry < max_retries - 1:
                                                logger.info(f"Retrying in {retry_delay} seconds... (attempt {retry+1}/{max_retries})")
                                                await asyncio.sleep(retry_delay)
                                                retry_delay *= 2
                                            else:
                                                return None
                                    
                                    return None
                                else:
                                    logger.error("No session ID or endpoint received")
                                    return None
                            else:
                                response_text = await response.text()
                                logger.error(f"Tool request failed with status {response.status}")
                                logger.error(f"Response body: {response_text}")
                                return None
                    except aiohttp.ClientError as e:
                        logger.error(f"Network error during GET request: {str(e)}")
                        return None
                    except asyncio.TimeoutError:
                        logger.error("Request timed out after 30 seconds")
                        return None
                    finally:
                        pass  # 确保try语句有一个完整的结构
                else:
                    # 对于非 SSE 工具，使用 POST 方法
                    logger.info("Making POST request with JSON payload")
                    try:
                        async with session.post(tool_url, json={"requirement": requirement}, timeout=30) as response:
                            logger.info(f"Response status: {response.status}")
                            logger.info(f"Response headers: {response.headers}")
                            if response.status == 200:
                                result = await response.json()
                                logger.info(f"Tool response: {result}")
                                return result
                            else:
                                response_text = await response.text()
                                logger.error(f"Tool request failed with status {response.status}")
                                logger.error(f"Response body: {response_text}")
                                return None
                    except aiohttp.ClientError as e:
                        logger.error(f"Network error during POST request: {str(e)}")
                        return None
                    except asyncio.TimeoutError:
                        logger.error("Request timed out after 30 seconds")
                        return None
        except Exception as e:
            error_type = type(e).__name__
            logger.error(f"Error calling MCP tool: {error_type} - {e}")
            logger.exception("Full traceback:")
            
            # 提供更具体的错误信息
            if "ConnectionRefused" in error_type:
                logger.error("连接被拒绝，请检查工具服务器是否在线")
            elif "Timeout" in error_type:
                logger.error("请求超时，请检查网络连接或增加超时时间")
            elif "JSONDecodeError" in error_type:
                logger.error("JSON解析错误，响应不是有效的JSON格式")
            elif "SSLError" in error_type:
                logger.error("SSL错误，请检查证书配置")
            
            return {
                "error": True,
                "error_type": error_type,
                "error_message": str(e)
            }

    async def handle_mcp_request(self, requirement: str) -> Optional[Dict[str, Any]]:
        """处理MCP请求"""
        # 1. 先查找本地工具
        matching_tool = self.find_matching_tool(requirement)
        if matching_tool:
            tool_config = matching_tool["config"]
            logger.info(f"Using local tool: {matching_tool['tool_name']}")
            
            # 调用工具
            result = await self.call_mcp_tool(tool_config, requirement)
            if result:
                return {
                    "source": "local",
                    "tool": matching_tool,
                    "response": result
                }

        # 2. 如果没有找到匹配的工具，搜索新工具
        logger.info("No local tool found, searching for new tools...")
        search_result = await self.search_new_tools(requirement)
        if search_result:
            # 添加新工具到配置
            self.add_tools_from_search_result(search_result, requirement)
            
            # 再次尝试查找匹配的工具
            matching_tool = self.find_matching_tool(requirement)
            if matching_tool:
                logger.info(f"Using newly added tool: {matching_tool['tool_name']}")
                
                # 调用新添加的工具
                result = await self.call_mcp_tool(matching_tool["config"], requirement)
                if result:
                    return {
                        "source": "new",
                        "tool": matching_tool,
                        "response": result
                    }
            
            # 如果仍然没有找到匹配的工具，返回搜索结果
            logger.info("Returning search result as fallback")
            return {
                "source": "search_only",
                "search_result": search_result
            }
        
        return None
    
    def get_available_tools(self) -> Dict[str, Any]:
        """获取所有可用的工具"""
        return {
            name: config for name, config in self.config.get("mcpServers", {}).items()
            if config.get("enabled", True)
        }
    
    def enable_tool(self, tool_name: str):
        """启用工具"""
        if tool_name in self.config.get("mcpServers", {}):
            self.config["mcpServers"][tool_name]["enabled"] = True
            self._save_config()
            logger.info(f"Enabled tool: {tool_name}")
    
    def disable_tool(self, tool_name: str):
        """禁用工具"""
        if tool_name in self.config.get("mcpServers", {}):
            self.config["mcpServers"][tool_name]["enabled"] = False
            self._save_config()
            logger.info(f"Disabled tool: {tool_name}")
    
    async def call_tool_with_stream_for_device(self, tool_match: Dict[str, Any], requirement: str,
                                               user_id: str, client_uid: str):
        """为特定设备流式调用MCP工具

        Args:
            tool_match: 匹配的工具信息，包含tool_name和config
            requirement: 用户请求内容
            user_id: 用户ID
            client_uid: 设备ID

        Yields:
            流式结果，每个结果包含status和相关数据
        """
        try:
            tool_config = tool_match.get("config", {})
            tool_name = tool_match.get("tool_name", "unknown")
            tool_url = tool_config.get("url", "")
            is_sse = tool_config.get("type", "").lower() == "sse"

            logger.info(f"开始为设备 {client_uid} (用户: {user_id}) 流式调用工具: {tool_name}")

            if not tool_url:
                yield {
                    "status": "error",
                    "error": "工具URL未配置",
                    "tool_name": tool_name,
                    "device_id": client_uid,
                    "user_id": user_id
                }
                return

            async with aiohttp.ClientSession() as session:
                if is_sse:
                    # SSE工具的流式处理（使用设备级session）
                    async for result in self._handle_sse_stream(session, tool_url, tool_name, requirement):
                        # 添加设备信息到结果中
                        result["device_id"] = client_uid
                        result["user_id"] = user_id
                        yield result
                else:
                    # 非SSE工具，模拟流式处理
                    async for result in self._handle_regular_stream(session, tool_url, tool_name, requirement):
                        # 添加设备信息到结果中
                        result["device_id"] = client_uid
                        result["user_id"] = user_id
                        yield result

        except Exception as e:
            logger.error(f"设备 {client_uid} 流式调用工具 {tool_name} 失败: {e}")
            yield {
                "status": "error",
                "error": str(e),
                "tool_name": tool_name,
                "device_id": client_uid,
                "user_id": user_id
            }

    async def call_tool_with_stream(self, tool_match: Dict[str, Any], requirement: str):
        """流式调用MCP工具

        Args:
            tool_match: 匹配的工具信息，包含tool_name和config
            requirement: 用户请求内容

        Yields:
            流式结果，每个结果包含status和相关数据
        """
        try:
            tool_config = tool_match.get("config", {})
            tool_name = tool_match.get("tool_name", "Unknown")
            tool_url = tool_config.get("url")
            
            if not tool_url:
                yield {
                    "status": "error",
                    "error": "工具URL未配置",
                    "tool_name": tool_name
                }
                return
            
            logger.info(f"🌊 开始流式调用工具: {tool_name}")
            logger.info(f"🔗 工具URL: {tool_url}")
            logger.info(f"📝 请求内容: {requirement}")
            
            # 发送开始信号
            yield {
                "status": "started",
                "tool_name": tool_name,
                "message": f"开始调用工具 {tool_name}"
            }
            
            is_sse = tool_config.get("type", "").lower() == "sse"
            
            async with aiohttp.ClientSession() as session:
                if is_sse:
                    # SSE工具的流式处理
                    async for result in self._handle_sse_stream(session, tool_url, tool_name, requirement):
                        yield result
                else:
                    # 非SSE工具，模拟流式处理
                    async for result in self._handle_regular_stream(session, tool_url, tool_name, requirement):
                        yield result
                    
        except Exception as e:
            logger.error(f"❌ 流式工具调用失败: {e}")
            yield {
                "status": "error",
                "error": str(e),
                "tool_name": tool_match.get("tool_name", "Unknown")
            }
    
    async def _handle_sse_stream(self, session: aiohttp.ClientSession, tool_url: str, tool_name: str, requirement: str):
        """处理SSE工具的流式调用"""
        try:
            params = {"requirement": requirement}
            
            # 发送进度信息
            yield {
                "status": "in_progress",
                "partial_result": {"message": "正在连接SSE服务..."},
                "tool_name": tool_name
            }
            
            async with session.get(tool_url, params=params, timeout=30) as response:
                if response.status != 200:
                    yield {
                        "status": "error",
                        "error": f"HTTP {response.status}",
                        "tool_name": tool_name
                    }
                    return
                
                session_id = None
                endpoint = None
                
                # 逐行读取SSE响应
                async for line in response.content:
                    line = line.decode('utf-8').strip()
                    logger.info(f"🌊 SSE行: {line}")
                    
                    if line.startswith('data: '):
                        endpoint = line[6:].strip()
                        if '/messages/?session_id=' in endpoint:
                            session_id = endpoint.split('session_id=')[1].strip()
                            logger.info(f"🔑 获取到session ID: {session_id}")
                            
                            # 发送进度更新
                            yield {
                                "status": "in_progress",
                                "partial_result": {"message": f"已建立会话，session_id: {session_id}"},
                                "tool_name": tool_name
                            }
                            break
                
                if session_id and endpoint:
                    # 获取实际结果
                    base_url = tool_url.rsplit('/', 1)[0]
                    messages_url = f"{base_url}{endpoint}" if endpoint.startswith('/') else f"{base_url}/{endpoint}"
                    
                    yield {
                        "status": "in_progress",
                        "partial_result": {"message": "正在获取结果..."},
                        "tool_name": tool_name
                    }
                    
                    # 实现轮询获取结果，模拟流式效果
                    max_attempts = 10
                    for attempt in range(max_attempts):
                        try:
                            async with session.get(messages_url, timeout=10) as msg_response:
                                if msg_response.status == 200:
                                    result = await msg_response.json()
                                    
                                    # 检查结果是否完整
                                    if result and (result.get("result") or result.get("data")):
                                        yield {
                                            "status": "completed",
                                            "result": result,
                                            "tool_name": tool_name
                                        }
                                        return
                                    else:
                                        # 部分结果或仍在处理中
                                        yield {
                                            "status": "in_progress",
                                            "partial_result": result or {"message": f"第{attempt+1}次查询..."},
                                            "tool_name": tool_name
                                        }
                                        
                                        # 等待一段时间再次尝试
                                        await asyncio.sleep(1)
                                else:
                                    logger.warning(f"⚠️ 消息端点返回状态: {msg_response.status}")
                                    if attempt < max_attempts - 1:
                                        await asyncio.sleep(1)
                                    else:
                                        yield {
                                            "status": "error",
                                            "error": f"消息端点返回错误状态: {msg_response.status}",
                                            "tool_name": tool_name
                                        }
                                        return
                        except Exception as e:
                            logger.error(f"❌ 轮询消息端点出错: {e}")
                            if attempt < max_attempts - 1:
                                await asyncio.sleep(1)
                            else:
                                yield {
                                    "status": "error",
                                    "error": str(e),
                                    "tool_name": tool_name
                                }
                                return
                    
                    # 如果所有尝试都失败了
                    yield {
                        "status": "error",
                        "error": "超过最大尝试次数，未能获取完整结果",
                        "tool_name": tool_name
                    }
                else:
                    yield {
                        "status": "error",
                        "error": "未能获取到session_id或endpoint",
                        "tool_name": tool_name
                    }
                    
        except Exception as e:
            logger.error(f"❌ SSE流式处理出错: {e}")
            yield {
                "status": "error",
                "error": str(e),
                "tool_name": tool_name
            }
    
    async def _handle_regular_stream(self, session: aiohttp.ClientSession, tool_url: str, tool_name: str, requirement: str):
        """处理普通工具的流式调用（模拟流式效果）"""
        try:
            # 发送进度信息
            yield {
                "status": "in_progress",
                "partial_result": {"message": "正在发送请求..."},
                "tool_name": tool_name
            }
            
            async with session.post(tool_url, json={"requirement": requirement}, timeout=30) as response:
                if response.status == 200:
                    # 先发送一个进度更新
                    yield {
                        "status": "in_progress",
                        "partial_result": {"message": "正在处理响应..."},
                        "tool_name": tool_name
                    }
                    
                    # 短暂延迟以模拟处理时间
                    await asyncio.sleep(0.5)
                    
                    result = await response.json()
                    
                    yield {
                        "status": "completed",
                        "result": result,
                        "tool_name": tool_name
                    }
                else:
                    response_text = await response.text()
                    yield {
                        "status": "error",
                        "error": f"HTTP {response.status}: {response_text}",
                        "tool_name": tool_name
                    }
                    
        except Exception as e:
            logger.error(f"❌ 普通工具流式处理出错: {e}")
            yield {
                "status": "error",
                "error": str(e),
                "tool_name": tool_name
            }
    
    async def find_matching_tool_async(self, requirement: str) -> Optional[Dict[str, Any]]:
        """异步版本的find_matching_tool方法"""
        return self.find_matching_tool(requirement)
        
    async def find_matching_tool_and_call(self, requirement: str, user_id: str = "default_user",
                                         client_uid: str = "default_device") -> Optional[Dict[str, Any]]:
        """查找匹配的工具并调用（支持设备级session）

        Returns:
            包含工具调用结果和工具名称的字典，格式:
            {
                "result": <工具调用结果>,
                "tool_name": <工具名称>,
                ...
            }
        """
        tool_match = self.find_matching_tool(requirement)
        if tool_match:
            tool_config = tool_match.get("config", {})
            tool_name = tool_match.get("tool_name", "unknown")
            result = await self.call_mcp_tool_for_device(tool_config, requirement, user_id, client_uid, tool_name)

            # 将工具名称添加到返回结果中
            if result is not None:
                if isinstance(result, dict):
                    result["_tool_name"] = tool_name  # 添加工具名称标识
                    return result
                else:
                    # 如果result不是字典，包装它
                    return {
                        "result": result,
                        "_tool_name": tool_name
                    }
            return None
        return None

    async def call_tool_with_cache(self, tool_match: Dict[str, Any], requirement: str) -> Optional[Dict[str, Any]]:
        """带缓存的工具调用（非流式）"""
        tool_config = tool_match.get("config", {})
        return await self.call_mcp_tool(tool_config, requirement) 