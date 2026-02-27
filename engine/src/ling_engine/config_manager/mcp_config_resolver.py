"""
MCP配置文件路径解析器

该模块提供统一的MCP配置文件路径处理机制，确保所有MCP相关组件都使用一致的配置文件定位逻辑。
"""

import json
import os
import logging
import threading
from typing import Optional, List, Dict, Any
from pathlib import Path

logger = logging.getLogger(__name__)


class MCPConfigPathResolver:
    """MCP配置文件路径解析器 - 单例模式"""
    
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls):
        """单例模式实现"""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        """初始化路径解析器"""
        if hasattr(self, '_initialized') and self._initialized:
            return
            
        self._config_cache = {}
        self._path_cache = {}
        self._initialized = True
        logger.info("MCPConfigPathResolver 初始化完成")
    
    def resolve_config_path(self, config_filename: str = "enhanced_mcp_config.json") -> Optional[str]:
        """解析配置文件路径
        
        Args:
            config_filename: 配置文件名，默认为enhanced_mcp_config.json
            
        Returns:
            配置文件的绝对路径，如果找不到则返回None
        """
        # 检查缓存
        if config_filename in self._path_cache:
            cached_path = self._path_cache[config_filename]
            if os.path.exists(cached_path):
                logger.debug(f"使用缓存的配置文件路径: {cached_path}")
                return cached_path
            else:
                # 缓存的路径不存在，清除缓存
                logger.warning(f"缓存的配置文件路径不存在，清除缓存: {cached_path}")
                del self._path_cache[config_filename]
        
        logger.info(f"开始解析配置文件路径: {config_filename}")
        
        # 1. 检查环境变量
        env_path = os.getenv('MCP_CONFIG_PATH')
        if env_path:
            full_env_path = os.path.join(env_path, config_filename) if os.path.isdir(env_path) else env_path
            if os.path.exists(full_env_path):
                absolute_path = os.path.abspath(full_env_path)
                self._path_cache[config_filename] = absolute_path
                # logger.info(f"✅ 通过环境变量找到配置文件: {absolute_path}")
                return absolute_path
        
        # 2. 构建搜索路径列表
        search_paths = self._build_search_paths(config_filename)
        
        # 3. 逐一搜索路径
        for search_path in search_paths:
            if os.path.exists(search_path):
                absolute_path = os.path.abspath(search_path)
                self._path_cache[config_filename] = absolute_path
                logger.info(f"✅ 找到配置文件: {absolute_path}")
                return absolute_path
        
        # 4. 未找到配置文件
        logger.error(f"❌ 无法找到配置文件: {config_filename}")
        logger.error(f"❌ 搜索路径列表: {search_paths}")
        return None
    
    def _build_search_paths(self, config_filename: str) -> List[str]:
        """构建配置文件搜索路径列表
        
        Args:
            config_filename: 配置文件名
            
        Returns:
            搜索路径列表
        """
        search_paths = []
        
        # 当前工作目录
        current_dir = os.getcwd()
        search_paths.append(os.path.join(current_dir, config_filename))
        
        # 脚本所在目录
        script_dir = os.path.dirname(os.path.abspath(__file__))
        
        # 向上搜索项目根目录（最多5层）
        for i in range(6):
            parent_dir = script_dir
            for _ in range(i):
                parent_dir = os.path.dirname(parent_dir)
            search_paths.append(os.path.join(parent_dir, config_filename))
        
        # 常见的配置目录
        common_config_dirs = [
            "config",
            "configs", 
            ".",
            "ling-engine",
            "ling-engine/ling-engine"
        ]
        
        for base_path in [current_dir, script_dir]:
            for i in range(4):  # 向上4层
                parent_dir = base_path
                for _ in range(i):
                    parent_dir = os.path.dirname(parent_dir)
                
                for config_dir in common_config_dirs:
                    search_paths.append(os.path.join(parent_dir, config_dir, config_filename))
        
        # 去重并保持顺序
        unique_paths = []
        seen = set()
        for path in search_paths:
            normalized_path = os.path.normpath(path)
            if normalized_path not in seen:
                seen.add(normalized_path)
                unique_paths.append(normalized_path)
        
        return unique_paths
    
    def load_config(self, config_filename: str = "enhanced_mcp_config.json") -> Optional[Dict[str, Any]]:
        """加载并验证配置文件
        
        Args:
            config_filename: 配置文件名
            
        Returns:
            配置字典，如果加载失败则返回None
        """
        # 检查配置缓存
        cache_key = f"config_{config_filename}"
        if cache_key in self._config_cache:
            logger.debug(f"使用缓存的配置数据: {config_filename}")
            return self._config_cache[cache_key]
        
        # 解析配置文件路径
        config_path = self.resolve_config_path(config_filename)
        if not config_path:
            return None
        
        try:
            logger.info(f"加载配置文件: {config_path}")
            with open(config_path, 'r', encoding='utf-8') as f:
                config_data = json.load(f)
            
            # 验证配置文件格式
            if self._validate_config(config_data):
                self._config_cache[cache_key] = config_data
                logger.info(f"✅ 配置文件加载并验证成功: {config_path}")
                return config_data
            else:
                logger.error(f"❌ 配置文件格式验证失败: {config_path}")
                return None
                
        except json.JSONDecodeError as e:
            logger.error(f"❌ 配置文件JSON格式错误: {config_path}, 错误: {e}")
            return None
        except PermissionError:
            logger.error(f"❌ 没有权限读取配置文件: {config_path}")
            return None
        except Exception as e:
            logger.error(f"❌ 加载配置文件时发生未知错误: {config_path}, 错误: {e}")
            return None
    
    def _validate_config(self, config_data: Dict[str, Any]) -> bool:
        """验证配置文件格式
        
        Args:
            config_data: 配置数据
            
        Returns:
            验证是否通过
        """
        try:
            # 检查必要的顶级字段
            if not isinstance(config_data, dict):
                logger.error("配置文件根元素必须是字典对象")
                return False
            
            # 检查mcpServers字段
            if "mcpServers" not in config_data:
                logger.error("配置文件缺少mcpServers字段")
                return False
            
            mcp_servers = config_data["mcpServers"]
            if not isinstance(mcp_servers, dict):
                logger.error("mcpServers字段必须是字典对象")
                return False
            
            # 验证每个服务器配置
            for server_name, server_config in mcp_servers.items():
                if not isinstance(server_config, dict):
                    logger.error(f"服务器配置 {server_name} 必须是字典对象")
                    return False
                
                # 检查必要字段
                required_fields = ["url", "type"]
                for field in required_fields:
                    if field not in server_config:
                        logger.warning(f"服务器 {server_name} 缺少 {field} 字段")
                
                # 检查URL格式
                url = server_config.get("url", "")
                if url and not url.startswith("http"):
                    logger.warning(f"服务器 {server_name} 的URL格式可能不正确: {url}")
            
            logger.info(f"✅ 配置文件格式验证通过，包含 {len(mcp_servers)} 个服务器配置")
            return True
            
        except Exception as e:
            logger.error(f"❌ 配置文件验证过程中发生错误: {e}")
            return False
    
    def save_config(self, config_data: Dict[str, Any], config_filename: str = "enhanced_mcp_config.json") -> bool:
        """保存配置文件
        
        Args:
            config_data: 配置数据
            config_filename: 配置文件名
            
        Returns:
            保存是否成功
        """
        config_path = self.resolve_config_path(config_filename)
        if not config_path:
            logger.error(f"❌ 无法确定配置文件保存路径: {config_filename}")
            return False
        
        try:
            # 验证配置数据
            if not self._validate_config(config_data):
                logger.error("❌ 配置数据验证失败，不能保存")
                return False
            
            # 备份原配置文件
            backup_path = f"{config_path}.backup"
            if os.path.exists(config_path):
                import shutil
                shutil.copy2(config_path, backup_path)
                logger.info(f"原配置文件已备份到: {backup_path}")
            
            # 保存新配置
            with open(config_path, 'w', encoding='utf-8') as f:
                json.dump(config_data, f, indent=2, ensure_ascii=False)
            
            # 更新缓存
            cache_key = f"config_{config_filename}"
            self._config_cache[cache_key] = config_data
            
            logger.info(f"✅ 配置文件保存成功: {config_path}")
            return True
            
        except Exception as e:
            logger.error(f"❌ 保存配置文件失败: {config_path}, 错误: {e}")
            return False
    
    def clear_cache(self):
        """清除所有缓存"""
        self._config_cache.clear()
        self._path_cache.clear()
        logger.info("✅ 配置缓存已清除")
    
    def get_cache_info(self) -> Dict[str, Any]:
        """获取缓存信息"""
        return {
            "path_cache": dict(self._path_cache),
            "config_cache_keys": list(self._config_cache.keys()),
            "path_cache_size": len(self._path_cache),
            "config_cache_size": len(self._config_cache)
        }


# 创建全局实例
config_resolver = MCPConfigPathResolver()


def get_mcp_config_path(config_filename: str = "enhanced_mcp_config.json") -> Optional[str]:
    """获取MCP配置文件路径（便利函数）
    
    Args:
        config_filename: 配置文件名
        
    Returns:
        配置文件的绝对路径
    """
    return config_resolver.resolve_config_path(config_filename)


def load_mcp_config(config_filename: str = "enhanced_mcp_config.json") -> Optional[Dict[str, Any]]:
    """加载MCP配置文件（便利函数）
    
    Args:
        config_filename: 配置文件名
        
    Returns:
        配置数据字典
    """
    return config_resolver.load_config(config_filename)


def save_mcp_config(config_data: Dict[str, Any], config_filename: str = "enhanced_mcp_config.json") -> bool:
    """保存MCP配置文件（便利函数）
    
    Args:
        config_data: 配置数据
        config_filename: 配置文件名
        
    Returns:
        保存是否成功
    """
    return config_resolver.save_config(config_data, config_filename) 