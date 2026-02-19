#!/usr/bin/env python3
"""
MCP搜索工具 - 将搜索API封装成MCP工具
当找不到合适的本地MCP工具时，可以调用此工具获取新的MCP工具
"""

import json
import aiohttp
import asyncio
from typing import Dict, Any, Optional, List
from loguru import logger
from datetime import datetime
import os
import time  # Added for time.time()


class MCPSearchTool:
    """MCP搜索工具 - 用于获取新的MCP工具"""

    def __init__(self, search_api_url: str = None, config_path: str = None):
        """
        初始化MCP搜索工具
        
        Args:
            search_api_url: 搜索API的URL
            config_path: MCP配置文件路径
        """
        self.config_path = config_path
        self.name = "mcp_search_tool"
        self.description = "搜索并获取新的MCP工具。当找不到合适的本地工具处理用户需求时，使用此工具获取相关的新工具。"
        # 存储工具的定时删除任务
        self._deletion_tasks = {}

        # 添加搜索缓存相关属性
        self._search_cache = {}  # 搜索结果缓存
        self._cache_ttl = 300  # 缓存有效期（秒）
        self._last_search_time = {}  # 上次搜索时间记录
        self._search_cooldown = 30  # 搜索冷却期（秒）
        self._similar_search_threshold = 0.8  # 相似搜索阈值

        # 如果没有提供search_api_url，从配置文件中读取
        if search_api_url:
            self.search_api_url = search_api_url
            logger.info(f"🔗 使用提供的搜索API URL: {self.search_api_url}")
        else:
            # 从配置文件中获取API URL
            logger.info("🔍 未提供搜索API URL，从配置文件中读取...")
            config = self._load_config_json()
            if config and config.get("searchApiUrl"):
                self.search_api_url = config["searchApiUrl"]
                logger.info(f"✅ 从配置文件获取搜索API URL: {self.search_api_url}")
            else:
                self.search_api_url = None
                logger.warning("⚠️ 未找到搜索API URL，搜索功能将不可用")

    def get_tool_schema(self) -> Dict[str, Any]:
        """获取工具的JSON Schema定义"""
        return {
            "type": "function",
            "function": {
                "name": "search_mcp_tools",
                "description": """搜索并获取新的MCP工具。
                
                使用场景：
                1. 当用户询问关于地理位置、地图、导航相关问题，但没有地图工具时
                2. 当用户需要特定功能但当前工具无法满足时
                3. 当用户明确提到需要某种特定工具时
                
                注意：只有在确实没有合适的本地工具时才使用此工具""",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "requirement": {
                            "type": "string",
                            "description": "用户的具体需求描述，例如：'需要地图导航工具'、'需要天气查询工具'等"
                        },
                        "tool_type": {
                            "type": "string",
                            "description": "需要的工具类型，例如：'地图'、'天气'、'翻译'、'计算'等"
                        }
                    },
                    "required": ["requirement"]
                }
            }
        }

    def _load_config_json(self) -> Dict[str, Any]:
        data: Dict[str, Any] = {}
        try:
            # 定义可能的配置文件路径
            config_paths = [
                "enhanced_mcp_config.json",  # 当前目录
                os.path.join("Open-LLM-VTuber", "enhanced_mcp_config.json"),  # 子目录
                self.config_path  # 自定义路径
            ]

            for config_path in config_paths:
                if config_path and os.path.exists(config_path):
                    with open(config_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    logger.info(f"✅ 从配置文件读取设置: {config_path}")
                    # 验证是否包含searchApiUrl
                    if 'searchApiUrl' in data:
                        logger.info(f"🔗 配置文件中的searchApiUrl: {data['searchApiUrl']}")
                    break
            else:
                logger.warning("⚠️ 未找到任何配置文件")
        except Exception as e:
            logger.warning(f"读取配置文件失败: {e}")
        return data

    def _is_dev_mode_enabled(self, cfg: Optional[Dict[str, Any]] = None) -> bool:
        if cfg is None:
            cfg = self._load_config_json()
        # 配置优先
        if isinstance(cfg.get('searchApiDevMode'), bool):
            return cfg['searchApiDevMode']
        # 环境变量
        env_flag = os.getenv('MCP_SEARCH_DEV_MODE', '').lower()
        return env_flag in ('1', 'true', 'yes', 'on')

    def _get_backup_api_url(self, cfg: Optional[Dict[str, Any]] = None) -> str:
        if cfg is None:
            cfg = self._load_config_json()

        # 首先尝试从配置文件获取主要的searchApiUrl
        primary_url = cfg.get('searchApiUrl')
        if isinstance(primary_url, str) and primary_url.startswith('http'):
            logger.info(f"使用配置文件中的主要搜索API URL: {primary_url}")
            return primary_url

        # 然后尝试备份URL
        url = cfg.get('searchApiBackupUrl')
        if isinstance(url, str) and url.startswith('http'):
            logger.info(f"使用配置文件中的备份搜索API URL: {url}")
            return url

        # 默认使用 apifox mock 作为备份，使用文档指定的灵(ling)端点
        logger.warning("使用默认的备份API URL")
        return "http://13.54.95.72:8080/lain/mcp/search/agent"

    def _get_test_key(self, cfg: Optional[Dict[str, Any]] = None) -> Optional[str]:
        if cfg is None:
            cfg = self._load_config_json()
        # 配置里的测试Key
        test_key = cfg.get('searchApiTestKey')
        if isinstance(test_key, str) and test_key:
            return test_key
        # 环境变量里的测试Key
        env_key = os.getenv('MCP_SEARCH_TEST_KEY')
        if env_key:
            return env_key
        return None

    async def search_mcp_tools(self, requirement: str, tool_type: str = None, userId: str = None) -> Dict[str, Any]:
        """
        搜索MCP工具

        Args:
            requirement: 用户需求描述
            tool_type: 工具类型（可选）
            userId: 用户ID（可选），用于区分不同用户的搜索请求

        Returns:
            搜索结果和工具信息
        """
        try:
            logger.info(f"🔍 MCP搜索工具被调用，需求: {requirement}")
            if tool_type:
                logger.info(f"🔍 工具类型: {tool_type}")
            if userId:
                logger.info(f"👤 用户ID: {userId}")

            # 生成缓存键，包含用户ID以区分用户
            cache_key = f"{userId or 'anonymous'}:{requirement}:{tool_type or 'general'}"

            # 检查是否在冷却期内
            current_time = time.time()
            if cache_key in self._last_search_time:
                elapsed = current_time - self._last_search_time[cache_key]
                if elapsed < self._search_cooldown:
                    logger.info(f"🧊 搜索请求在冷却期内 ({elapsed:.1f}秒 < {self._search_cooldown}秒)，使用缓存结果")
                    if cache_key in self._search_cache:
                        return self._search_cache[cache_key]

            # 检查是否有相似的搜索请求
            for existing_key in self._search_cache:
                # 简单的相似度检查：分割成词，计算重叠率
                existing_req, existing_type = existing_key.split(":", 1)
                if tool_type == existing_type or (not tool_type and existing_type == 'general'):
                    similarity = self._calculate_similarity(requirement, existing_req)
                    if similarity > self._similar_search_threshold:
                        logger.info(f"🔄 找到相似的搜索请求 (相似度: {similarity:.2f})，使用缓存结果")
                        cache_entry = self._search_cache[existing_key]
                        # 检查缓存是否过期
                        if current_time - cache_entry.get("_cache_time", 0) < self._cache_ttl:
                            return cache_entry

            # 检查缓存
            if cache_key in self._search_cache:
                cache_entry = self._search_cache[cache_key]
                cache_time = cache_entry.get("_cache_time", 0)
                if current_time - cache_time < self._cache_ttl:
                    logger.info(f"🔄 使用缓存的搜索结果，缓存时间: {current_time - cache_time:.1f}秒")
                    return cache_entry

            # 更新上次搜索时间
            self._last_search_time[cache_key] = current_time

            # 构建搜索查询
            search_query = requirement
            if tool_type:
                search_query = f"{tool_type}工具：{requirement}"

            # 调用搜索API
            api_response = await self._call_search_api(search_query, userId=userId)

            if not api_response:
                # 在开发模式下，直接返回内置示例响应以便端到端联调
                if self._is_dev_mode_enabled():
                    logger.warning("DEV模式启用：返回内置示例响应用于联调")
                    api_response = self._build_stub_success_response()
                else:
                    result = {
                        "success": False,
                        "message": "搜索API调用失败",
                        "tools_found": 0,
                        "recommendation": "请尝试使用现有工具或稍后重试"
                    }
                    # 缓存失败结果（较短时间）
                    result["_cache_time"] = current_time
                    self._search_cache[cache_key] = result
                    return result

            # 解析API响应
            result = await self._process_api_response(api_response, requirement)

            # 如果找到新工具，保存到配置文件
            if result.get("success") and result.get("tools_found", 0) > 0:
                # 先尝试提取有效工具，避免过期工具导致的误判
                try:
                    extracted_tools = self._extract_tools_from_response(api_response)
                except Exception:
                    extracted_tools = {}

                if not extracted_tools:
                    # 明确提示：工具已过期或无效，未保存
                    result["config_updated"] = False
                    result["message"] += "。注意：搜索返回的工具已过期或无效，未保存到配置文件。"
                else:
                    saved = await self._save_tools_to_config(api_response)
                    result["config_updated"] = saved
                    if saved:
                        result["message"] += "。新工具已保存到配置文件，已触发热更新，通常数秒内生效，无需重启。"
                    else:
                        result["message"] += "。保存新工具失败，请检查配置文件权限或路径。"

            # 缓存搜索结果
            result["_cache_time"] = current_time
            self._search_cache[cache_key] = result

            return result

        except Exception as e:
            logger.error(f"MCP搜索工具执行失败: {e}")
            result = {
                "success": False,
                "message": f"搜索工具执行出错: {str(e)}",
                "tools_found": 0,
                "recommendation": "请检查网络连接或联系管理员"
            }
            # 缓存错误结果（较短时间）
            result["_cache_time"] = time.time()
            self._search_cache[cache_key] = result
            return result

    def _load_search_api_headers_from_config(self) -> Dict[str, str]:
        """从配置文件或环境变量加载自定义请求头，用于通过鉴权/网关校验。
        支持以下来源（按优先级）：
        1) 配置文件中的 searchApiHeaders（对象，直接作为headers）
        2) 环境变量 MCP_SEARCH_HEADERS_JSON（JSON字符串）
        3) 环境变量 MCP_SEARCH_AUTHORIZATION（作为 Authorization 头）
        4) 环境变量 MCP_SEARCH_API_KEY（作为 x-api-key 头）
        5) 测试Key（searchApiTestKey 或 MCP_SEARCH_TEST_KEY）作为 Authorization: Bearer <key> 与 x-api-key
        """
        headers: Dict[str, str] = {}
        # 0) 确保解析到可用的配置路径
        try:
            if not self.config_path or not os.path.exists(self.config_path):
                resolved = self._resolve_config_path()
                if resolved:
                    self.config_path = resolved
        except Exception:
            pass

        # 1) 配置文件
        try:
            if self.config_path and os.path.exists(self.config_path):
                with open(self.config_path, 'r', encoding='utf-8') as f:
                    config_data = json.load(f)
                cfg_headers = config_data.get('searchApiHeaders')
                if isinstance(cfg_headers, dict):
                    headers.update({str(k): str(v) for k, v in cfg_headers.items()})
                # 测试Key（如未设置Authorization或x-api-key则补充）
                test_key = config_data.get('searchApiTestKey')
                if isinstance(test_key, str) and test_key:
                    if 'Authorization' not in headers:
                        headers['Authorization'] = f"Bearer {test_key}"
                    if 'x-api-key' not in headers:
                        headers['x-api-key'] = test_key
        except Exception as e:
            logger.warning(f"读取配置文件自定义请求头失败: {e}")

        # 2) 环境变量 JSON
        try:
            env_headers_json = os.getenv('MCP_SEARCH_HEADERS_JSON')
            if env_headers_json:
                parsed = json.loads(env_headers_json)
                if isinstance(parsed, dict):
                    headers.update({str(k): str(v) for k, v in parsed.items()})
        except Exception as e:
            logger.warning(f"解析 MCP_SEARCH_HEADERS_JSON 失败: {e}")

        # 3) Authorization
        auth = os.getenv('MCP_SEARCH_AUTHORIZATION')
        if auth and 'Authorization' not in headers:
            headers['Authorization'] = auth

        # 4) x-api-key
        api_key = os.getenv('MCP_SEARCH_API_KEY')
        if api_key and 'x-api-key' not in headers:
            headers['x-api-key'] = api_key

        # 5) 测试Key环境变量兜底
        if ('Authorization' not in headers) or ('x-api-key' not in headers):
            env_test_key = os.getenv('MCP_SEARCH_TEST_KEY')
            if env_test_key:
                if 'Authorization' not in headers:
                    headers['Authorization'] = f"Bearer {env_test_key}"
                if 'x-api-key' not in headers:
                    headers['x-api-key'] = env_test_key
        return headers

    def _is_lain_endpoint(self, url: str) -> bool:
        """检查是否为灵(Ling)端点（无需认证）"""
        return '/lain/' in url if url else False

    def _ensure_lain_endpoint(self, url: str) -> str:
        """确保使用正确的灵(Ling)端点路径"""
        if not url:
            return url

        # 如果已经包含lain路径，直接返回
        if '/lain/' in url:
            return url

        # 将/mcp/search/agent替换为/lain/mcp/search/agent
        if url.endswith('/mcp/search/agent'):
            return url.replace('/mcp/search/agent', '/lain/mcp/search/agent')

        # 其他情况，在域名后添加/lain前缀
        if '://' in url:
            parts = url.split('/', 3)  # ['http:', '', 'domain:port', 'path']
            if len(parts) >= 4:
                domain_part = '/'.join(parts[:3])  # 'http://domain:port'
                path_part = parts[3]  # 'path'
                if not path_part.startswith('lain/'):
                    return f"{domain_part}/lain/{path_part}"

        return url

    async def _parse_error_response(self, status_code: int, response_text: str) -> str:
        """
        根据文档定义解析错误响应

        Args:
            status_code: HTTP状态码
            response_text: 响应文本

        Returns:
            格式化的错误消息
        """
        try:
            # 尝试解析错误响应的JSON格式
            if response_text:
                try:
                    error_data = json.loads(response_text)
                    if isinstance(error_data, dict):
                        # 检查是否有文档定义的错误格式字段
                        error_code = error_data.get("code", status_code)
                        error_message = error_data.get("message", "未知错误")
                        error_details = error_data.get("details", "")

                        formatted_msg = f"🚫 API错误 [{error_code}]: {error_message}"
                        if error_details:
                            formatted_msg += f" - {error_details}"
                        return formatted_msg
                except json.JSONDecodeError:
                    pass

            # 根据状态码提供标准错误消息
            if status_code == 400:
                return "🚫 400 请求参数错误：请检查请求负载格式是否正确"
            elif status_code == 401:
                return "🔒 401 未授权：灵(Ling)端点无需认证，如使用其他端点请配置鉴权信息"
            elif status_code == 403:
                return "🚫 403 访问被拒绝：您没有权限访问此资源"
            elif status_code == 404:
                return "🔍 404 端点未找到：请检查API端点路径是否正确"
            elif status_code == 429:
                return "⏰ 429 请求过于频繁：请稍后重试"
            elif status_code >= 500:
                return f"🔧 {status_code} 服务器内部错误：请稍后重试或联系管理员"
            else:
                return f"❌ HTTP错误 {status_code}：请求失败"

        except Exception:
            return f"❌ 解析错误响应失败，状态码: {status_code}"

    async def _call_search_api(self, query: str, max_retries: int = 3, userId: str = None) -> Optional[Dict[str, Any]]:
        """
        调用搜索API

        Args:
            query: 搜索查询
            max_retries: 最大重试次数
            userId: 用户ID（可选），用于区分不同用户的搜索请求

        Returns:
            API响应数据
        """
        # 基础头
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "Open-LLM-VTuber/1.0"
        }
        # 确保使用正确的灵(Ling)端点
        api_url = self._ensure_lain_endpoint(self.search_api_url)

        # 对于灵(Ling)端点，根据文档说明跳过认证
        if self._is_lain_endpoint(api_url):
            logger.info("🔓 检测到灵(Ling)端点，根据文档要求跳过认证处理")
        else:
            # 合并用户配置的自定义头（仅对非灵(Ling)端点）
            custom_headers = self._load_search_api_headers_from_config()
            if custom_headers:
                headers.update(custom_headers)
                logger.info(f"🔐 已加载自定义请求头: {list(custom_headers.keys())}")

        # 按照文档要求构建精确的请求负载
        payload = {
            "requirement": query
        }
        if userId:
            payload["userId"] = userId

        last_status: Optional[int] = None
        for attempt in range(max_retries):
            try:
                logger.info(f"调用搜索API (尝试 {attempt + 1}/{max_retries}): {api_url}")
                timeout = aiohttp.ClientTimeout(total=45)
                async with aiohttp.ClientSession(timeout=timeout) as session:
                    # 使用符合文档的标准负载
                    payload_to_send = payload
                    async with session.post(
                            api_url,
                            json=payload_to_send,
                            headers=headers
                    ) as response:
                        status_code = response.status
                        last_status = status_code
                        text_preview = await response.text()
                        if status_code == 200:
                            try:
                                data = json.loads(text_preview)
                            except Exception:
                                data = await response.json(content_type=None)
                            logger.info(f"✅ 搜索API调用成功，状态码: {status_code}")
                            return data
                        else:
                            logger.warning(f"搜索API返回错误状态码: {status_code}")
                            # 根据文档定义的错误格式处理不同状态码
                            error_message = await self._parse_error_response(status_code, text_preview)
                            logger.error(error_message)

                            # 记录响应内容片段帮助诊断
                            logger.debug(f"响应内容预览: {text_preview[:300]}")
                            if attempt < max_retries - 1:
                                await asyncio.sleep(2 ** attempt)  # 指数退避
            except Exception as e:
                logger.warning(f"搜索API调用失败 (尝试 {attempt + 1}): {e}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(2 ** attempt)

        # 重试结束仍失败，在DEV模式下尝试备用URL或返回内置示例
        dev_mode_enabled = self._is_dev_mode_enabled()
        logger.info(f"🔧 开发模式状态: {dev_mode_enabled}")
        if dev_mode_enabled:
            backup_url = self._get_backup_api_url()
            try:
                logger.info(f"DEV模式：尝试备用搜索API: {backup_url}")
                timeout = aiohttp.ClientTimeout(total=30)
                async with aiohttp.ClientSession(timeout=timeout) as session:
                    async with session.post(backup_url, json=payload, headers=headers) as resp:
                        if resp.status == 200:
                            try:
                                text = await resp.text()
                                data = json.loads(text)
                            except Exception:
                                data = await resp.json(content_type=None)
                            logger.info("✅ 备用搜索API调用成功")
                            return data
                        else:
                            logger.warning(f"备用搜索API返回状态码: {resp.status}")
            except Exception as be:
                logger.warning(f"备用搜索API调用失败: {be}")
            # 最终回退到内置示例
            logger.warning("DEV模式：使用内置示例响应作为最终回退")
            return self._build_stub_success_response()

        logger.error("所有搜索API调用尝试都失败了")
        return None

    async def _process_api_response(self, api_response: Dict[str, Any], requirement: str) -> Dict[str, Any]:
        """
        处理API响应
        
        Args:
            api_response: API响应数据
            requirement: 用户需求
            
        Returns:
            处理后的结果
        """
        try:
            # 检查响应格式
            if not isinstance(api_response, dict):
                return {
                    "success": False,
                    "message": "API响应格式不正确",
                    "tools_found": 0
                }

            # 提取工具数据（适配多种结构，包含示例的 data.results）
            tools_data = None
            tools_count = 0

            if "code" in api_response and api_response.get("code") == 200:
                data_obj = api_response.get("data")
                if isinstance(data_obj, dict):
                    # 优先 data.results
                    if isinstance(data_obj.get("results"), dict):
                        tools_data = data_obj["results"]
                    else:
                        tools_data = data_obj
            elif "mcpServers" in api_response:
                tools_data = api_response["mcpServers"]
            elif "tools" in api_response:
                tools_data = api_response["tools"]
            else:
                tools_data = api_response

            # 统计工具数量：对 dict 按条目数统计
            if isinstance(tools_data, dict):
                tools_count = len(tools_data)
            elif isinstance(tools_data, list):
                tools_count = len(tools_data)

            if tools_count > 0:
                return {
                    "success": True,
                    "message": f"找到 {tools_count} 个相关MCP工具",
                    "tools_found": tools_count,
                    "tools_preview": self._generate_tools_preview(tools_data),
                    "recommendation": f"找到了处理'{requirement}'的相关工具，已触发热更新，通常数秒内生效；如未生效再尝试重启"
                }
            else:
                return {
                    "success": False,
                    "message": "未找到相关的MCP工具",
                    "tools_found": 0,
                    "recommendation": "请尝试调整需求描述或使用现有工具"
                }

        except Exception as e:
            logger.error(f"处理API响应时出错: {e}")
            return {
                "success": False,
                "message": f"响应处理出错: {str(e)}",
                "tools_found": 0
            }

    def _generate_tools_preview(self, tools_data: Any) -> List[str]:
        """生成工具预览列表"""
        preview: List[str] = []
        try:
            if isinstance(tools_data, dict):
                for name, info in tools_data.items():
                    if isinstance(info, dict):
                        # 兼容示例结构中的 reason 字段
                        reason = info.get("reason") or info.get("description") or "无描述"
                        preview.append(f"• {name}: {reason}")
            elif isinstance(tools_data, list):
                for tool in tools_data:
                    if isinstance(tool, dict):
                        name = tool.get("name", "未知工具")
                        desc = tool.get("reason") or tool.get("description", "无描述")
                        preview.append(f"• {name}: {desc}")
        except Exception:
            preview = ["工具预览生成失败"]

        return preview[:5]  # 最多显示5个工具

    async def _schedule_tool_deletion(self, tool_name: str, expire_time_str: str):
        """
        为工具创建定时删除任务
        
        Args:
            tool_name: 工具名称
            expire_time_str: 过期时间字符串，格式为"%Y-%m-%d %H:%M:%S"
        """
        try:
            from datetime import datetime
            expire_dt = datetime.strptime(expire_time_str, "%Y-%m-%d %H:%M:%S")
            current_time = datetime.now()

            # 计算延迟时间（秒）
            delay_seconds = (expire_dt - current_time).total_seconds()

            if delay_seconds <= 0:
                logger.warning(f"工具 {tool_name} 的过期时间已过，不创建定时任务")
                return

            # 取消已存在的定时任务（如果有）
            if tool_name in self._deletion_tasks and not self._deletion_tasks[tool_name].done():
                self._deletion_tasks[tool_name].cancel()
                logger.info(f"已取消工具 {tool_name} 的现有定时删除任务")

            # 创建新的定时任务
            async def delete_tool_task():
                try:
                    await asyncio.sleep(delay_seconds)
                    await self._delete_tool_from_config(tool_name)
                except asyncio.CancelledError:
                    logger.info(f"工具 {tool_name} 的删除任务已被取消")
                except Exception as e:
                    logger.error(f"删除工具 {tool_name} 时出错: {e}")

            task = asyncio.create_task(delete_tool_task())
            self._deletion_tasks[tool_name] = task

            logger.info(
                f"⏱️ 已为工具 {tool_name} 创建定时删除任务，将在 {delay_seconds:.1f} 秒后（{expire_time_str}）自动删除")

        except Exception as e:
            logger.error(f"为工具 {tool_name} 创建定时删除任务时出错: {e}")

    async def _delete_tool_from_config(self, tool_name: str) -> bool:
        """
        从配置文件中删除指定的工具
        
        Args:
            tool_name: 要删除的工具名称
            
        Returns:
            是否成功删除
        """
        try:
            # 解析配置文件路径
            config_path = self._resolve_config_path()
            if not config_path or not os.path.exists(config_path):
                logger.error(f"配置文件不存在: {config_path}")
                return False

            # 读取配置文件
            with open(config_path, 'r', encoding='utf-8') as f:
                config_data = json.load(f)

            # 检查工具是否存在
            if "mcpServers" not in config_data or tool_name not in config_data["mcpServers"]:
                logger.warning(f"工具 {tool_name} 不存在于配置文件中")
                return False

            # 删除工具
            del config_data["mcpServers"][tool_name]

            # 保存配置文件
            with open(config_path, 'w', encoding='utf-8') as f:
                json.dump(config_data, f, ensure_ascii=False, indent=2)

            logger.info(f"🗑️ 工具 {tool_name} 已从配置文件中删除（定时任务触发）")
            return True

        except Exception as e:
            logger.error(f"从配置文件中删除工具 {tool_name} 时出错: {e}")
            return False

    async def _save_tools_to_config(self, api_response: Dict[str, Any]) -> bool:
        """
        将新工具保存到MCP配置文件
        
        Args:
            api_response: API响应
            
        Returns:
            是否成功保存
        """
        try:
            # 提取工具数据
            tools_data = self._extract_tools_from_response(api_response)
            if not tools_data:
                logger.warning("⚠️ 未找到有效工具数据，跳过保存")
                return False

            # 解析配置文件路径
            config_file = self._resolve_config_path()
            if not config_file:
                logger.error("❌ 无法解析配置文件路径")
                return False

            logger.info(f"🔧 将新工具保存到子目录配置文件: {config_file}")

            # 读取现有配置
            existing_config = {}
            try:
                if os.path.exists(config_file):
                    with open(config_file, 'r', encoding='utf-8') as f:
                        existing_config = json.load(f)
                        logger.info(f"📖 读取现有配置: {len(existing_config.get('mcpServers', {}))} 个工具")
            except Exception as e:
                logger.warning(f"读取配置文件失败: {e}")
                existing_config = {}

            # 确保配置文件有基本结构
            if 'mcpServers' not in existing_config:
                existing_config['mcpServers'] = {}

            # 记录工具变更
            added_tools = []
            updated_tools = []
            expired_tools = []

            # 更新工具配置
            for tool_name, tool_config in tools_data.items():
                # 检查是否只是有效期小幅度更新
                if tool_name in existing_config.get("mcpServers", {}):
                    existing_tool = existing_config["mcpServers"][tool_name]
                    existing_expire_time = existing_tool.get("expireTime")

                    if existing_expire_time and tool_config.get("expireTime"):
                        try:
                            from datetime import datetime

                            existing_dt = datetime.strptime(existing_expire_time, "%Y-%m-%d %H:%M:%S")
                            new_dt = datetime.strptime(tool_config["expireTime"], "%Y-%m-%d %H:%M:%S")

                            # 如果有效期变化不超过5分钟，不更新配置
                            time_diff = abs((new_dt - existing_dt).total_seconds())
                            if time_diff < 300:  # 5分钟
                                logger.info(f"🕒 工具 {tool_name} 有效期变化小于5分钟，跳过配置更新")
                                continue
                        except Exception as e:
                            logger.warning(f"比较工具有效期时出错: {e}")

                # 检查工具是否已存在
                if tool_name in existing_config['mcpServers']:
                    # 更新现有工具
                    existing_config['mcpServers'][tool_name].update(tool_config)
                    updated_tools.append(tool_name)
                    logger.info(f"🔄 更新工具: {tool_name}")
                else:
                    # 添加新工具
                    existing_config['mcpServers'][tool_name] = tool_config
                    added_tools.append(tool_name)
                    logger.info(f"添加新工具: {tool_name}")

            # 保存更新后的配置
            try:
                # 确保目录存在
                os.makedirs(os.path.dirname(os.path.abspath(config_file)), exist_ok=True)

                # 写入配置文件
                with open(config_file, 'w', encoding='utf-8') as f:
                    json.dump(existing_config, f, indent=2, ensure_ascii=False)

                logger.info(
                    f"✅ 配置文件更新完成: 添加 {len(added_tools)} 个新工具, 更新 {len(updated_tools)} 个工具, 清理 {len(expired_tools)} 个过期工具")

                # 为新工具或更新的工具创建定时删除任务
                for tool_name, tool_config in tools_data.items():
                    if tool_config.get("expireTime"):
                        # 异步创建定时任务
                        asyncio.create_task(self._schedule_tool_deletion(tool_name, tool_config["expireTime"]))

                return True
            except Exception as e:
                logger.error(f"保存配置文件失败: {e}")
                return False

        except Exception as e:
            logger.error(f"保存工具到配置文件失败: {e}")
            return False

    def _extract_tools_from_response(self, api_response: Dict[str, Any]) -> Dict[str, Any]:
        """从API响应中提取工具数据"""
        tools: Dict[str, Any] = {}

        try:
            # 读取现有配置，获取初始工具列表
            initial_tools = set()
            try:
                config_path = self._resolve_config_path()
                if config_path and os.path.exists(config_path):
                    with open(config_path, 'r', encoding='utf-8') as f:
                        existing_config = json.load(f)
                        initial_tools = set(existing_config.get("mcpServers", {}).keys())
                        logger.debug(f"已加载初始工具列表，共 {len(initial_tools)} 个工具")
            except Exception as e:
                logger.warning(f"读取初始工具列表失败: {e}")

            # 统一获取工具字典，兼容示例结构
            tools_data: Optional[Dict[str, Any]] = None
            if isinstance(api_response, dict):
                if api_response.get("code") == 200:
                    data_obj = api_response.get("data")
                    if isinstance(data_obj, dict) and isinstance(data_obj.get("results"), dict):
                        tools_data = data_obj["results"]
                    elif isinstance(data_obj, dict):
                        tools_data = data_obj
                elif isinstance(api_response.get("mcpServers"), dict):
                    tools_data = api_response["mcpServers"]
                elif isinstance(api_response.get("tools"), dict):
                    tools_data = api_response["tools"]
                else:
                    # 直接使用整个响应作为工具数据（兜底）
                    if all(isinstance(v, dict) for v in api_response.values()):
                        tools_data = api_response  # type: ignore

            if tools_data and isinstance(tools_data, dict):
                for name, config in tools_data.items():
                    if isinstance(config, dict):
                        # 目标API字段映射
                        server_url = config.get("url") or config.get("endpoint") or ""
                        if not server_url:
                            logger.warning(f"跳过无效工具 {name}: 缺少URL")
                            continue

                        # 检查工具是否过期
                        expire_time = config.get("expireTime")
                        if expire_time:
                            try:
                                from datetime import datetime
                                import re

                                # 尝试解析多种时间格式
                                expire_dt = None

                                # 1. 尝试ISO 8601格式 (2025-09-29T16:20:09.931643002)
                                try:
                                    # 移除微秒部分的多余位数，只保留6位
                                    iso_time = re.sub(r'\.(\d{6})\d*', r'.\1', expire_time)
                                    expire_dt = datetime.fromisoformat(iso_time.replace('T', ' '))
                                except:
                                    pass

                                # 2. 尝试标准格式 (2025-09-29 16:20:09)
                                if not expire_dt:
                                    try:
                                        expire_dt = datetime.strptime(expire_time, "%Y-%m-%d %H:%M:%S")
                                    except:
                                        pass

                                # 3. 尝试其他常见格式
                                if not expire_dt:
                                    try:
                                        expire_dt = datetime.strptime(expire_time, "%Y-%m-%dT%H:%M:%S")
                                    except:
                                        pass

                                if expire_dt:
                                    if datetime.now() > expire_dt:
                                        logger.warning(f"跳过过期工具 {name}: 过期时间 {expire_time}")
                                        continue
                                    else:
                                        logger.info(f"工具 {name} 有效期至: {expire_time}")
                                else:
                                    logger.warning(f"无法解析工具 {name} 的过期时间格式: {expire_time}")

                            except Exception as e:
                                logger.warning(f"解析工具 {name} 过期时间失败: {e}")

                        raw_type = config.get("type", "sse")
                        # 格式转换：streamable_http -> sse，并修改URL格式
                        if str(raw_type).lower() in ("streamablehttp", "streamable_http", "http", "rest"):
                            transport = "sse"  # 转换为sse格式
                            # URL末尾的/mcp替换为/sse
                            if server_url.endswith("/mcp"):
                                server_url = server_url[:-4] + "/sse"
                                logger.info(f"🔄 工具 {name}: 转换格式 {raw_type} -> sse，URL: /mcp -> /sse")
                        else:
                            transport = str(raw_type).lower()

                        # 提取工具描述信息
                        reason = config.get("reason", "")
                        description = config.get("description", "")
                        mcp_id = config.get("mcpId", "")

                        # 构建完整的描述信息
                        full_description = reason if reason else description
                        if mcp_id:
                            full_description = f"{full_description} (ID: {mcp_id})"
                        if not full_description:
                            full_description = f"{name} MCP工具"

                        tool_config = {
                            "type": transport,
                            "url": server_url,
                            "description": full_description,
                            "enabled": True
                        }

                        # 设置有效期：新工具15分钟，初始工具保持原有设置
                        from datetime import datetime, timedelta
                        if name not in initial_tools:
                            # 新工具设置15分钟有效期
                            new_expire_time = (datetime.now() + timedelta(minutes=15)).strftime("%Y-%m-%d %H:%M:%S")
                            tool_config["expireTime"] = new_expire_time
                            logger.info(f"🕒 新工具 {name} 设置15分钟有效期: {new_expire_time}")
                        elif expire_time:
                            # 初始工具保留原有有效期，但转换为标准格式
                            if expire_dt:
                                # 使用解析成功的datetime对象转换为标准格式
                                tool_config["expireTime"] = expire_dt.strftime("%Y-%m-%d %H:%M:%S")
                            else:
                                # 如果解析失败，尝试直接使用原值
                                tool_config["expireTime"] = expire_time

                        # 添加额外的元数据
                        if mcp_id:
                            tool_config["mcpId"] = mcp_id
                        if reason:
                            tool_config["reason"] = reason

                        tools[name] = tool_config
                        logger.info(f"提取到工具: {name} - {full_description}")
                        if tool_config.get("expireTime"):
                            logger.info(f"  - 有效期至: {tool_config['expireTime']}")
                        if mcp_id:
                            logger.info(f"  - MCP ID: {mcp_id}")
        except Exception as e:
            logger.error(f"提取工具数据时出错: {e}")

        logger.info(f"总共提取到 {len(tools)} 个有效工具")
        return tools

    def _resolve_config_path(self) -> Optional[str]:
        """解析配置文件路径"""
        if self.config_path and os.path.exists(self.config_path):
            return self.config_path

        # 使用统一的配置路径解析机制
        try:
            from .config_manager.mcp_config_resolver import get_mcp_config_path
            config_path = get_mcp_config_path()
            if config_path:
                self.config_path = config_path
                # logger.info(f"✅ MCPSearchTool: 使用统一路径解析找到配置文件: {config_path}")
                return config_path
            else:
                logger.warning("⚠️ MCPSearchTool: 统一路径解析失败，使用传统搜索方法")
        except ImportError:
            logger.warning("⚠️ MCPSearchTool: 无法导入统一路径解析器，使用传统搜索方法")

        # 如果统一解析失败，使用传统方法作为备选
        possible_paths = [
            "enhanced_mcp_config.json",
            "mcp_tools_config.json",
            os.path.join(os.getcwd(), "enhanced_mcp_config.json"),
            os.path.join(os.getcwd(), "mcp_tools_config.json"),
            os.path.join(os.path.dirname(__file__), "..", "..", "..", "enhanced_mcp_config.json"),
            os.path.join(os.path.dirname(__file__), "..", "..", "..", "mcp_tools_config.json"),
        ]

        for path in possible_paths:
            if os.path.exists(path):
                self.config_path = path
                # logger.info(f"✅ MCPSearchTool: 通过传统方法找到配置文件: {path}")
                return path

        # 如果都找不到，使用默认路径
        default_path = os.path.join(os.getcwd(), "enhanced_mcp_config.json")
        self.config_path = default_path
        logger.warning(f"⚠️ MCPSearchTool: 使用默认路径: {default_path}")
        return default_path

    def _build_stub_success_response(self) -> Dict[str, Any]:
        """构造一个与目标接口形状一致的成功响应（用于DEV联调）"""
        # 允许通过环境变量覆盖整体stub
        stub_env = os.getenv('MCP_SEARCH_STUB_JSON')
        if stub_env:
            try:
                return json.loads(stub_env)
            except Exception as e:
                logger.warning(f"解析 MCP_SEARCH_STUB_JSON 失败，使用内置默认: {e}")
        now_ms = int(datetime.now().timestamp() * 1000)
        # 计算过期时间（15分钟后）
        from datetime import timedelta
        expire_time = (datetime.now() + timedelta(minutes=15)).strftime("%Y-%m-%d %H:%M:%S")
        return {
            "code": 200,
            "message": "操作成功",
            "data": {
                "results": {
                    "time": {
                        "name": "time",
                        "mcpId": "mcp_213572494806769664",
                        "reason": "该服务器提供当前时间查询功能，满足用户需求。",
                        "type": "streamableHttp",
                        "url": "http://13.54.95.72:8080/call/9e54acf3de8e/mcp",
                        "expireTime": expire_time
                    },
                    "mcp-trends-hub": {
                        "name": "mcp-trends-hub",
                        "mcpId": "mcp_213572534828818432",
                        "reason": "主要针对趋势分析工具，不是时间查询，但有相关功能词命中。 | 提供全球新闻、科技趋势及分析的流行工具，可能在旅行灵感和规划方面间接提供帮助。",
                        "type": "streamableHttp",
                        "url": "http://13.54.95.72:8080/call/186c432015f9/mcp",
                        "expireTime": expire_time
                    },
                    "12306-mcp": {
                        "name": "12306-mcp",
                        "mcpId": "mcp_213572484618805248",
                        "reason": "尽管主要提供票务查询，但包含获取当前日期相关功能。 | 通过匹配北京与12306相关票务信息，直接符合用户查询需求。",
                        "type": "streamableHttp",
                        "url": "http://13.54.95.72:8080/call/73d3214ba529/mcp",
                        "expireTime": expire_time
                    }
                }
            },
            "timestamp": now_ms
        }

    def _calculate_similarity(self, text1: str, text2: str) -> float:
        """
        计算两个文本的相似度（简单实现）
        
        Args:
            text1: 第一个文本
            text2: 第二个文本
            
        Returns:
            相似度得分 (0-1)
        """
        # 简单的词集合重叠率计算
        try:
            # 分词并转为集合
            words1 = set(text1.lower().split())
            words2 = set(text2.lower().split())

            # 计算交集和并集
            intersection = len(words1.intersection(words2))
            union = len(words1.union(words2))

            if union == 0:
                return 0

            return intersection / union
        except Exception:
            return 0  # 出错时返回0相似度


# 全局实例变量
_global_mcp_search_tool = None


def get_or_create_mcp_search_tool() -> MCPSearchTool:
    """获取或创建MCP搜索工具实例"""
    global _global_mcp_search_tool
    if _global_mcp_search_tool is None:
        _global_mcp_search_tool = MCPSearchTool()
        logger.info("💡 创建新的全局 mcp_search_tool 实例")
    return _global_mcp_search_tool


# 导出函数供外部调用
async def search_mcp_tools(requirement: str, tool_type: str = None, user_id: str = None) -> Dict[str, Any]:
    """
    搜索MCP工具的外部接口

    Args:
        requirement: 用户需求描述
        tool_type: 工具类型（可选）
        user_id: 用户ID（可选），用于区分不同用户的搜索请求

    Returns:
        搜索结果
    """
    mcp_search_tool = get_or_create_mcp_search_tool()
    logger.info(f"📞 外部接口调用 search_mcp_tools: {requirement}")
    if user_id:
        logger.info(f"👤 外部调用用户ID: {user_id}")

    return await mcp_search_tool.search_mcp_tools(requirement, tool_type, user_id)


# 向后兼容的属性访问
class MCPSearchToolProxy:
    def __getattr__(self, name):
        return getattr(get_or_create_mcp_search_tool(), name)

    def __setattr__(self, name, value):
        setattr(get_or_create_mcp_search_tool(), name, value)


# 创建代理对象供向后兼容
mcp_search_tool = MCPSearchToolProxy()


def get_mcp_search_tool_schema() -> Dict[str, Any]:
    """获取MCP搜索工具的schema"""
    return mcp_search_tool.get_tool_schema()


if __name__ == "__main__":
    # 测试代码
    async def test_search():
        result = await search_mcp_tools("需要地图导航工具", "地图")


    asyncio.run(test_search())
