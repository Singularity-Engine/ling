"""
MCP工具调用编排器

该模块实现智能工具选择、参数提取和工具链编排功能，
提供基于LLM的自动工具调用能力。
"""

import asyncio
import json
import logging
import re
import time
from typing import Dict, List, Any, Optional, Tuple, Union
from dataclasses import dataclass

# 配置日志
logger = logging.getLogger(__name__)

@dataclass
class ToolMatch:
    """工具匹配结果"""
    tool_name: str
    confidence: float
    parameters: Dict[str, Any]
    reason: str
    tool_info: Dict[str, Any]

@dataclass
class OrchestrationResult:
    """编排执行结果"""
    success: bool
    results: List[Any] = None
    errors: List[str] = None
    execution_time: float = 0.0
    tools_used: List[str] = None

class MCPToolOrchestrator:
    """MCP工具调用编排器"""
    
    def __init__(self, enhanced_manager):
        """初始化编排器
        
        Args:
            enhanced_manager: 增强型MCP管理器实例
        """
        self.enhanced_manager = enhanced_manager
        
        # 工具选择权重配置
        self.tool_weights = {
            "search": 10,      # 搜索类工具优先级最高
            "weather": 5,      # 天气工具中等优先级
            "map": 5,          # 地图工具中等优先级
            "other": 1         # 其他工具最低优先级
        }
        
        # 参数提取模式
        self.param_patterns = {
            "city": [
                r"(?:在|到|从|去)([^，,。.！!？?]*?(?:市|县|区|省|州))",
                r"([^，,。.！!？?]*?(?:市|县|区|省|州))",
                r"([^，,。.！!？?]*?)(?:的天气|天气)",
                r"([^，,。.！!？?]*?)(?:明天|今天|后天)"
            ],
            "location": [
                r"(?:在|到|从|去)([^，,。.！!？?]*)",
                r"([^，,。.！!？?]*?)(?:附近|周边|附近的|周边的)",
                r"位置[:：]([^，,。.！!？?]*)"
            ],
            "query": [
                r"(?:搜索|查找|查询|search)[:：]?(.+)",
                r"(.+?)(?:怎么样|如何|是什么)"
            ],
            "keywords": [
                r"(?:搜索|查找|找)([^，,。.！!？?]*?)(?:的|在)",
                r"([^，,。.！!？?]*?)(?:在哪里|在哪|地址)"
            ]
        }
        
        # 关键词分类
        self.keyword_categories = {
            "search": ["搜索", "查询", "查找", "search", "find", "lookup", "百度", "谷歌", "必应"],
            "weather": ["天气", "气温", "温度", "下雨", "晴天", "阴天", "weather", "temperature"],
            "map": ["地图", "导航", "路线", "地址", "位置", "map", "navigation", "route", "address", "location", "去", "到", "从"]
        }
    
    async def find_best_tools(self, requirement: str, max_tools: int = 3) -> List[ToolMatch]:
        """智能查找最适合的工具
        
        Args:
            requirement: 用户需求
            max_tools: 最大返回工具数量
            
        Returns:
            匹配的工具列表，按置信度排序
        """
        logger.info(f"🔍 开始智能工具匹配: {requirement}")
        
        available_tools = self.enhanced_manager.get_available_tools()
        if not available_tools:
            logger.warning("⚠️ 没有可用工具")
            return []
        
        matches = []
        
        for tool_info in available_tools:
            try:
                # 计算工具匹配度
                match = await self._calculate_tool_match(requirement, tool_info)
                if match and match.confidence > 0.05:  # 最低置信度阈值
                    matches.append(match)
                    logger.info(f"  工具匹配: {match.tool_name} (置信度: {match.confidence:.2f})")
                    
            except Exception as e:
                logger.error(f"❌ 工具匹配计算失败: {tool_info.get('function', {}).get('name', 'unknown')}: {e}")
        
        # 按置信度排序
        matches.sort(key=lambda x: x.confidence, reverse=True)
        
        # 返回前N个最佳匹配
        best_matches = matches[:max_tools]
        logger.info(f"✅ 找到 {len(best_matches)} 个匹配工具")
        
        return best_matches
    
    async def _calculate_tool_match(self, requirement: str, tool_info: Dict[str, Any]) -> Optional[ToolMatch]:
        """计算单个工具的匹配度
        
        Args:
            requirement: 用户需求
            tool_info: 工具信息
            
        Returns:
            工具匹配结果
        """
        try:
            function_info = tool_info.get("function", {})
            tool_name = function_info.get("name", "")
            tool_description = function_info.get("description", "")
            
            # 基础置信度计算
            confidence = 0.0
            match_reasons = []
            
            # 1. 工具名称匹配
            name_score = self._calculate_name_match(requirement, tool_name)
            confidence += name_score * 0.4
            if name_score > 0:
                match_reasons.append(f"名称匹配({name_score:.2f})")
            
            # 2. 工具描述匹配
            desc_score = self._calculate_description_match(requirement, tool_description)
            confidence += desc_score * 0.3
            if desc_score > 0:
                match_reasons.append(f"描述匹配({desc_score:.2f})")
            
            # 3. 关键词类别匹配
            category_score = self._calculate_category_match(requirement, tool_name, tool_description)
            confidence += category_score * 0.3
            if category_score > 0:
                match_reasons.append(f"类别匹配({category_score:.2f})")
            
            # 提取参数
            parameters = await self._extract_parameters(requirement, function_info)
            
            # 如果无法提取必要参数，降低置信度
            if not parameters:
                confidence *= 0.7
                match_reasons.append("参数提取困难")
            
            return ToolMatch(
                tool_name=tool_name,
                confidence=confidence,
                parameters=parameters,
                reason="; ".join(match_reasons),
                tool_info=tool_info
            )
            
        except Exception as e:
            logger.error(f"❌ 计算工具匹配度失败: {e}")
            return None
    
    def _calculate_name_match(self, requirement: str, tool_name: str) -> float:
        """计算工具名称匹配度"""
        if not tool_name:
            return 0.0
        
        tool_name_lower = tool_name.lower()
        requirement_lower = requirement.lower()
        
        # 直接包含
        if tool_name_lower in requirement_lower or requirement_lower in tool_name_lower:
            return 1.0
        
        # 分词匹配（支持多种分隔符）
        tool_words = tool_name_lower.replace(".", "_").replace("-", "_").split("_")
        score = 0.0
        
        for word in tool_words:
            if word in requirement_lower:
                score += 0.3
        
        # 特殊关键词匹配 - 提高搜索工具的匹配度
        search_keywords = ["search", "bing", "搜索", "查询", "find"]
        weather_keywords = ["weather", "天气", "气温"]
        map_keywords = ["map", "地图", "导航", "位置"]
        
        # 检查是否是搜索相关需求
        if any(keyword in requirement_lower for keyword in ["搜索", "查询", "search", "find", "帮我", "查找"]):
            if any(keyword in tool_name_lower for keyword in search_keywords):
                score = max(score, 0.8)  # 提高搜索工具匹配度
        
        # 检查是否是天气相关需求
        if any(keyword in requirement_lower for keyword in weather_keywords):
            if any(keyword in tool_name_lower for keyword in weather_keywords):
                score = max(score, 0.8)
        
        # 检查是否是地图相关需求
        if any(keyword in requirement_lower for keyword in map_keywords):
            if any(keyword in tool_name_lower for keyword in map_keywords):
                score = max(score, 0.8)
        
        return min(score, 1.0)
    
    def _calculate_description_match(self, requirement: str, description: str) -> float:
        """计算工具描述匹配度"""
        if not description:
            return 0.0
        
        description_lower = description.lower()
        requirement_lower = requirement.lower()
        
        # 关键词匹配
        score = 0.0
        
        # 检查需求中的关键词是否在描述中
        requirement_words = requirement_lower.split()
        description_words = description_lower.split()
        
        common_words = set(requirement_words) & set(description_words)
        if common_words:
            score = len(common_words) / max(len(requirement_words), len(description_words))
        
        return min(score, 1.0)
    
    def _calculate_category_match(self, requirement: str, tool_name: str, description: str) -> float:
        """计算工具类别匹配度"""
        requirement_lower = requirement.lower()
        tool_text = (tool_name + " " + description).lower()
        
        best_score = 0.0
        
        for category, keywords in self.keyword_categories.items():
            # 检查需求中是否包含该类别的关键词
            req_category_score = 0.0
            for keyword in keywords:
                if keyword in requirement_lower:
                    req_category_score += 1
            
            # 检查工具中是否包含该类别的关键词
            tool_category_score = 0.0
            for keyword in keywords:
                if keyword in tool_text:
                    tool_category_score += 1
            
            # 计算类别匹配得分
            if req_category_score > 0 and tool_category_score > 0:
                category_score = min(req_category_score, tool_category_score) / max(req_category_score, tool_category_score)
                category_score *= self.tool_weights.get(category, 1) / 10  # 归一化权重
                best_score = max(best_score, category_score)
        
        return min(best_score, 1.0)
    
    async def _extract_parameters(self, requirement: str, function_info: Dict[str, Any]) -> Dict[str, Any]:
        """智能提取工具参数
        
        Args:
            requirement: 用户需求
            function_info: 工具函数信息
            
        Returns:
            提取的参数字典
        """
        parameters = {}
        
        # 获取工具参数模式
        tool_parameters = function_info.get("parameters", {})
        if not tool_parameters:
            # 如果没有参数定义，使用通用参数
            return {"query": requirement}
        
        # 获取参数属性
        properties = tool_parameters.get("properties", {})
        required_params = tool_parameters.get("required", [])
        
        logger.info(f"  提取参数，工具需要: {list(properties.keys())}")
        
        # 逐个提取参数
        for param_name, param_info in properties.items():
            param_value = self._extract_single_parameter(requirement, param_name, param_info)
            if param_value:
                parameters[param_name] = param_value
                logger.info(f"    {param_name}: {param_value}")
        
        # 检查必需参数
        missing_required = [p for p in required_params if p not in parameters]
        if missing_required:
            logger.warning(f"  缺少必需参数: {missing_required}")
            # 尝试用通用方法填充
            for param in missing_required:
                if param in ["query", "q", "text", "input"]:
                    parameters[param] = requirement
                elif param in ["city", "location"]:
                    city = self._extract_city_from_text(requirement)
                    if city:
                        parameters[param] = city
        
        # 如果还是没有参数，使用默认参数
        if not parameters:
            if "query" in properties:
                parameters["query"] = requirement
            elif properties:
                # 使用第一个参数作为默认
                first_param = list(properties.keys())[0]
                parameters[first_param] = requirement
        
        return parameters
    
    def _extract_single_parameter(self, requirement: str, param_name: str, param_info: Dict[str, Any]) -> Optional[str]:
        """提取单个参数
        
        Args:
            requirement: 用户需求
            param_name: 参数名称
            param_info: 参数信息
            
        Returns:
            提取的参数值
        """
        # 根据参数名称使用不同的提取模式
        if param_name in self.param_patterns:
            patterns = self.param_patterns[param_name]
            for pattern in patterns:
                match = re.search(pattern, requirement, re.IGNORECASE)
                if match:
                    value = match.group(1).strip()
                    if value:
                        return value
        
        # 通用参数提取
        param_desc = param_info.get("description", "").lower()
        
        if "city" in param_name.lower() or "城市" in param_desc:
            return self._extract_city_from_text(requirement)
        elif "location" in param_name.lower() or "位置" in param_desc:
            return self._extract_location_from_text(requirement)
        elif "query" in param_name.lower() or "搜索" in param_desc:
            return requirement
        elif "keyword" in param_name.lower() or "关键词" in param_desc:
            return self._extract_keywords_from_text(requirement)
        
        return None
    
    def _extract_city_from_text(self, text: str) -> Optional[str]:
        """从文本中提取城市名称"""
        city_patterns = [
            r"(?:在|到|从|去)([^，,。.！!？?]*?(?:市|县|区|省|州))",
            r"([^，,。.！!？?]*?(?:市|县|区|省|州))",
            r"([^，,。.！!？?]*?)(?:的天气|天气)",
            r"([北京|上海|广州|深圳|成都|杭州|西安|重庆|天津|南京|武汉|长沙|青岛|大连|厦门|苏州|宁波|东莞|无锡|佛山|烟台|泉州|嘉兴|金华|徐州|南通|常州|昆明|贵阳|南昌|太原|石家庄|哈尔滨|长春|沈阳|大庆|包头|海口|三亚|银川|兰州|西宁|乌鲁木齐|拉萨]+)"
        ]
        
        for pattern in city_patterns:
            match = re.search(pattern, text)
            if match:
                city = match.group(1).strip()
                if city and len(city) <= 10:  # 合理的城市名长度
                    return city
        
        return None
    
    def _extract_location_from_text(self, text: str) -> Optional[str]:
        """从文本中提取位置信息"""
        location_patterns = [
            r"(?:在|到|从|去)([^，,。.！!？?]+)",
            r"([^，,。.！!？?]+)(?:附近|周边)",
            r"位置[:：]([^，,。.！!？?]+)"
        ]
        
        for pattern in location_patterns:
            match = re.search(pattern, text)
            if match:
                location = match.group(1).strip()
                if location and len(location) <= 20:
                    return location
        
        return None
    
    def _extract_keywords_from_text(self, text: str) -> Optional[str]:
        """从文本中提取关键词"""
        # 移除常见的查询词
        stop_words = ["搜索", "查找", "查询", "帮我", "我想", "请", "的", "了", "吗", "呢", "吧"]
        
        cleaned_text = text
        for word in stop_words:
            cleaned_text = cleaned_text.replace(word, "")
        
        cleaned_text = cleaned_text.strip()
        
        if cleaned_text:
            return cleaned_text
        
        return text
    
    async def execute_orchestration(self, requirement: str, parallel: bool = False) -> OrchestrationResult:
        """执行工具编排
        
        Args:
            requirement: 用户需求
            parallel: 是否并行执行多个工具
            
        Returns:
            编排执行结果
        """
        start_time = time.time()
        
        try:
            logger.info(f"🎯 开始工具编排: {requirement}")
            
            # 查找最佳工具
            best_tools = await self.find_best_tools(requirement)
            
            if not best_tools:
                return OrchestrationResult(
                    success=False,
                    errors=["未找到匹配的工具"],
                    execution_time=time.time() - start_time
                )
            
            # 执行工具调用
            if parallel and len(best_tools) > 1:
                # 并行执行
                results = await self._execute_tools_parallel(best_tools)
            else:
                # 串行执行（优先执行最佳匹配工具）
                results = await self._execute_tools_sequential(best_tools)
            
            execution_time = time.time() - start_time
            
            # 分析结果
            successful_results = [r for r in results if r.success]
            failed_results = [r for r in results if not r.success]
            
            if successful_results:
                logger.info(f"✅ 工具编排成功，{len(successful_results)}/{len(results)} 个工具执行成功")
                return OrchestrationResult(
                    success=True,
                    results=[r.result for r in successful_results],
                    errors=[r.error for r in failed_results if r.error],
                    execution_time=execution_time,
                    tools_used=[r.tool_name for r in successful_results]
                )
            else:
                logger.error(f"❌ 所有工具执行失败")
                return OrchestrationResult(
                    success=False,
                    errors=[r.error for r in failed_results],
                    execution_time=execution_time,
                    tools_used=[]
                )
                
        except Exception as e:
            error_msg = f"工具编排执行失败: {str(e)}"
            logger.error(f"❌ {error_msg}")
            
            return OrchestrationResult(
                success=False,
                errors=[error_msg],
                execution_time=time.time() - start_time,
                tools_used=[]
            )
    
    async def _execute_tools_parallel(self, tool_matches: List[ToolMatch]) -> List[Any]:
        """并行执行工具"""
        logger.info(f"🔄 并行执行 {len(tool_matches)} 个工具")
        
        tasks = []
        for match in tool_matches:
            task = self.enhanced_manager.call_tool(match.tool_name, match.parameters)
            tasks.append(task)
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        return results
    
    async def _execute_tools_sequential(self, tool_matches: List[ToolMatch]) -> List[Any]:
        """串行执行工具"""
        logger.info(f"🔄 串行执行 {len(tool_matches)} 个工具")
        
        results = []
        for match in tool_matches:
            try:
                result = await self.enhanced_manager.call_tool(match.tool_name, match.parameters)
                results.append(result)
                
                # 如果第一个工具成功，可以选择跳过其他工具
                if result.success:
                    logger.info(f"✅ 第一个工具执行成功，跳过其他工具")
                    break
                    
            except Exception as e:
                logger.error(f"❌ 工具执行失败 {match.tool_name}: {e}")
                results.append(None)
        
        return results 