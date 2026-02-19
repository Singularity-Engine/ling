"""
数据库定价服务 - 从数据库获取模型价格信息，并使用Redis缓存
复用项目现有的数据库和Redis基础设施
"""

import json
import logging
from typing import Dict, Optional, Any, List
from ..database.pgsql.database_manager import get_db_manager, get_redis_manager

logger = logging.getLogger(__name__)


class DatabasePricingService:
    """数据库定价服务 - 复用现有数据库和Redis基础设施"""
    
    def __init__(self):
        self.cache_timeout = 86400  # 24小时缓存，因为价格数据很少变化
        self._redis_manager = None
        self._db_manager = None
        self._model_cache_miss = set()  # 记录缓存未命中的模型，避免重复查询
    
    @property
    def redis_manager(self):
        """获取Redis管理器"""
        if self._redis_manager is None:
            try:
                self._redis_manager = get_redis_manager()
                logger.info("成功初始化Redis管理器")
            except Exception as e:
                logger.error(f"获取Redis管理器失败: {e}")
                self._redis_manager = None
        return self._redis_manager
    
    @property
    def db_manager(self):
        """获取数据库管理器"""
        if self._db_manager is None:
            try:
                self._db_manager = get_db_manager()
                logger.info("成功初始化数据库管理器")
            except Exception as e:
                logger.error(f"获取数据库管理器失败: {e}")
                self._db_manager = None
        return self._db_manager

    def get_model_pricing(self, model_name: str) -> Optional[Dict[str, Any]]:
        """
        获取模型定价信息，优先从Redis缓存读取
        
        Args:
            model_name: 模型名称
            
        Returns:
            定价信息字典，包含input/output价格和单位
        """
        logger.debug(f"尝试获取模型定价: {model_name}")
        
        # 检查是否已知该模型在数据库中不存在（但允许重试机制）
        if model_name in self._model_cache_miss:
            logger.debug(f"模型 {model_name} 之前查询未找到，但仍尝试缓存查询")
        
        # 首先尝试从Redis缓存获取
        cached_data = self._get_from_cache(model_name)
        if cached_data:
            logger.info(f"从缓存获取模型定价成功: {model_name}, input={cached_data.get('input', 'N/A')}, output={cached_data.get('output', 'N/A')}")
            # 如果从缓存获取成功，从未命中集合中移除
            if model_name in self._model_cache_miss:
                self._model_cache_miss.remove(model_name)
            return cached_data
        
        # 如果已知不存在且不在缓存中，跳过数据库查询
        if model_name in self._model_cache_miss:
            logger.debug(f"模型 {model_name} 已知不存在于数据库中，跳过数据库查询")
            return None
        
        # 缓存中没有，从数据库获取
        logger.info(f"缓存中未找到 {model_name}，尝试从数据库获取")
        db_data = self._get_from_database(model_name)
        if db_data:
            # 存入缓存
            self._set_to_cache(model_name, db_data)
            logger.info(f"从数据库获取模型定价成功并已缓存: {model_name}")
            return db_data
        
        # 只有在数据库查询确实失败时才记录为未命中
        self._model_cache_miss.add(model_name)
        logger.warning(f"数据库中未找到模型定价: {model_name}")
        return None
    
    def _get_from_cache(self, model_name: str) -> Optional[Dict[str, Any]]:
        """从Redis缓存获取数据"""
        if not self.redis_manager:
            logger.debug("Redis管理器不可用，跳过缓存查询")
            return None
            
        try:
            cache_key = f"model_pricing:{model_name}"
            logger.debug(f"尝试从缓存获取: {cache_key}")
            cached_data = self.redis_manager.get_json(cache_key)
            if cached_data:
                logger.debug(f"缓存命中: {model_name}")
                return cached_data
            else:
                logger.debug(f"缓存未命中: {model_name}")
        except Exception as e:
            logger.error(f"从缓存获取数据失败: {e}")
        
        return None

    def _set_to_cache(self, model_name: str, data: Dict[str, Any]) -> None:
        """将数据存入Redis缓存"""
        if not self.redis_manager:
            logger.warning(f"Redis管理器不可用，无法缓存模型定价: {model_name}")
            return
            
        try:
            cache_key = f"model_pricing:{model_name}"
            logger.debug(f"尝试写入缓存: {cache_key}, 数据: {data}")
            
            # 验证数据格式
            if not isinstance(data, dict) or not data:
                logger.error(f"无效的缓存数据格式: {data}")
                return
                
            self.redis_manager.set_json(cache_key, data, ex=self.cache_timeout)
            logger.info(f"✅ 模型定价已成功缓存: {model_name}, input={data.get('input', 'N/A')}, output={data.get('output', 'N/A')}, unit={data.get('unit', 'N/A')}")
            
            # 验证缓存是否写入成功
            cached_data = self.redis_manager.get_json(cache_key)
            if cached_data:
                logger.debug(f"✅ 缓存写入验证成功: {model_name}")
            else:
                logger.error(f"❌ 缓存写入验证失败: {model_name}")
            
            # 同时更新所有模型缓存
            self._update_all_models_cache(model_name, data)
        except Exception as e:
            logger.error(f"❌ 缓存数据失败 - 模型: {model_name}, 错误: {e}")
            logger.error(f"Redis管理器状态: {self.redis_manager is not None}")
            if self.redis_manager:
                logger.error(f"Redis客户端状态: {hasattr(self.redis_manager, '_client') and self.redis_manager._client is not None}")
            # 打印异常堆栈以便调试
            import traceback
            logger.error(f"异常堆栈: {traceback.format_exc()}")
    
    def _update_all_models_cache(self, model_name: str, data: Dict[str, Any]) -> None:
        """更新所有模型缓存 - 改进版本，增强错误处理和原子性"""
        if not self.redis_manager:
            logger.debug("Redis管理器不可用，跳过所有模型缓存更新")
            return
            
        try:
            all_cache_key = "model_pricing:all"
            logger.debug(f"尝试更新所有模型缓存，添加模型: {model_name}")
            
            # 获取现有的所有模型缓存，如果不存在则创建空字典
            all_models = self.redis_manager.get_json(all_cache_key) or {}
            logger.debug(f"当前所有模型缓存包含 {len(all_models)} 个模型")
            
            # 添加或更新当前模型
            all_models[model_name] = data
            
            # 原子性更新所有模型缓存
            self.redis_manager.set_json(all_cache_key, all_models, ex=self.cache_timeout)
            logger.info(f"所有模型缓存已更新，当前包含 {len(all_models)} 个模型，最新添加: {model_name}")
            
        except Exception as e:
            logger.error(f"更新所有模型缓存失败 - 模型: {model_name}, 错误: {e}")
            # 即使所有模型缓存更新失败，单个模型缓存仍然有效

    def _get_from_database(self, model_name: str) -> Optional[Dict[str, Any]]:
        """从数据库获取定价信息"""
        if not self.db_manager:
            logger.debug("数据库管理器不可用，跳过数据库查询")
            return None
            
        conn = None
        try:
            conn = self.db_manager.get_connection()
            if not conn:
                logger.error("无法获取数据库连接")
                return None
                
            cursor = conn.cursor()
            logger.debug(f"执行数据库查询: {model_name}")
            cursor.execute("""
                SELECT name, type, pricing, capabilities
                FROM model_pricing 
                WHERE name = %s AND deleted = FALSE
            """, (model_name,))
            
            result = cursor.fetchone()
            if result:
                pricing_data = dict(result['pricing'])
                model_type = result['type']
                logger.debug(f"DEBUG - Raw database result: name={result['name']}, type={model_type}, pricing={pricing_data}")
                
                # 根据模型类型转换为相应的格式
                if model_type == 'TTS':
                    # TTS模型使用字符和分钟计费
                    pricing_info = {
                        'base': pricing_data.get('base', 0.0),
                        'character': pricing_data.get('character', 0.0),
                        'minute': pricing_data.get('minute', 0.0),
                        'unit': pricing_data.get('unit', '元/千字符'),
                        'model_name': result['name'],
                        'capabilities': result['capabilities'],
                        'model_type': model_type
                    }
                    logger.debug(f"TTS模型定价信息: {pricing_info}")
                else:
                    # LLM和其他模型使用token计费
                    pricing_info = {
                        'input': pricing_data.get('input_token', pricing_data.get('input', 0.0)),
                        'output': pricing_data.get('output_token', pricing_data.get('output', 0.0)),
                        'unit': pricing_data.get('unit', '元/千token'),
                        'model_name': result['name'],
                        'capabilities': result['capabilities'],
                        'model_type': model_type
                    }
                    logger.debug(f"LLM模型定价信息: {pricing_info}")
                
                if model_type == 'TTS':
                    logger.info(f"✅ 从数据库获取TTS模型定价成功: {model_name}, 价格: base={pricing_info['base']}, character={pricing_info['character']}, minute={pricing_info['minute']}, unit={pricing_info['unit']}")
                else:
                    logger.info(f"✅ 从数据库获取模型定价成功: {model_name}, 价格: input={pricing_info['input']}, output={pricing_info['output']}, unit={pricing_info['unit']}")
                
                # 确保数据被缓存，即使之前缓存失败
                logger.debug(f"正在缓存数据库查询结果: {model_name}")
                self._set_to_cache(model_name, pricing_info)
                return pricing_info
            else:
                logger.warning(f"数据库中未找到模型: {model_name}")
            
        except Exception as e:
            logger.error(f"数据库查询失败: {e}")
            import traceback
            logger.error(f"异常堆栈: {traceback.format_exc()}")
        finally:
            if conn:
                self.db_manager.return_connection(conn)
        
        return None
    
    def get_all_model_pricing(self) -> Dict[str, Dict[str, Any]]:
        """获取所有模型的定价信息"""
        cache_key = "model_pricing:all"
        
        # 首先尝试从缓存获取
        if self.redis_manager:
            try:
                logger.debug("尝试从缓存获取所有模型定价")
                cached_data = self.redis_manager.get_json(cache_key)
                if cached_data:
                    logger.info(f"从缓存获取所有模型定价成功，共{len(cached_data)}个模型")
                    return cached_data
            except Exception as e:
                logger.error(f"从缓存获取所有定价失败: {e}")
        
        # 从数据库获取所有定价
        if not self.db_manager:
            logger.warning("数据库管理器不可用，无法获取所有模型定价")
            return {}
            
        conn = None
        try:
            conn = self.db_manager.get_connection()
            if not conn:
                logger.error("无法获取数据库连接")
                return {}
                
            cursor = conn.cursor()
            logger.debug("执行数据库查询: 获取所有模型")
            cursor.execute("""
                SELECT name, pricing, capabilities
                FROM model_pricing 
                WHERE deleted = FALSE
            """)
            
            results = cursor.fetchall()
            all_pricing = {}
            
            for result in results:
                pricing_data = dict(result['pricing'])
                model_name = result['name']
                
                all_pricing[model_name] = {
                    'input': pricing_data.get('input_token', pricing_data.get('input', 0.0)),
                    'output': pricing_data.get('output_token', pricing_data.get('output', 0.0)),
                    'unit': pricing_data.get('unit', '元/千token'),
                    'capabilities': result['capabilities']
                }
            
            # 存入缓存 - 增强错误处理
            if self.redis_manager:
                try:
                    logger.debug(f"尝试缓存所有模型定价，共{len(all_pricing)}个模型")
                    self.redis_manager.set_json(cache_key, all_pricing, ex=self.cache_timeout)
                    logger.info("所有模型定价已缓存")
                except Exception as e:
                    logger.error(f"缓存所有定价失败: {e}")
                    # 即使缓存失败，也要确保返回数据
                    logger.error(f"Redis管理器状态: {self.redis_manager is not None}")
                    if self.redis_manager:
                        logger.error(f"Redis客户端状态: {self.redis_manager._client is not None}")
            else:
                logger.warning("Redis管理器不可用，无法缓存所有模型定价")
            
            logger.info(f"从数据库获取所有模型定价成功，共{len(all_pricing)}个模型")
            # 清空未命中缓存，因为我们刚刚刷新了所有模型
            self._model_cache_miss.clear()
            return all_pricing
            
        except Exception as e:
            logger.error(f"获取所有定价失败: {e}")
            return {}
        finally:
            if conn:
                self.db_manager.return_connection(conn)

    def clear_cache(self, model_name: str = None) -> None:
        """
        清除缓存
        
        Args:
            model_name: 如果提供，只清除该模型的缓存；否则清除所有缓存
        """
        if not self.redis_manager:
            logger.debug("Redis管理器不可用，无法清除缓存")
            return
            
        try:
            if model_name:
                cache_key = f"model_pricing:{model_name}"
                self.redis_manager.delete(cache_key)
                logger.info(f"已清除模型缓存: {model_name}")
                
                # 同时更新所有模型缓存
                all_cache_key = "model_pricing:all"
                all_models = self.redis_manager.get_json(all_cache_key) or {}
                if model_name in all_models:
                    del all_models[model_name]
                    self.redis_manager.set_json(all_cache_key, all_models, ex=self.cache_timeout)
                    logger.debug(f"已从所有模型缓存中移除: {model_name}")
                    
                # 从未命中缓存中移除，允许重新查询
                if model_name in self._model_cache_miss:
                    self._model_cache_miss.remove(model_name)
                    logger.debug(f"已从未命中集合中移除: {model_name}")
            else:
                # 清除所有模型缓存
                all_cache_key = "model_pricing:all"
                self.redis_manager.delete(all_cache_key)
                
                # 清除单个模型缓存
                for model in list(self._model_cache_miss):
                    cache_key = f"model_pricing:{model}"
                    self.redis_manager.delete(cache_key)
                
                # 清空未命中缓存
                self._model_cache_miss.clear()
                
                logger.info("已清除所有模型缓存和未命中记录")
        except Exception as e:
            logger.error(f"清除缓存失败: {e}")
    
    def reset_cache_miss_records(self) -> None:
        """重置缓存未命中记录，允许重新查询所有模型"""
        self._model_cache_miss.clear()
        logger.info("已重置缓存未命中记录，所有模型将重新尝试查询")
    
    def refresh_model_pricing(self, model_name: str) -> Optional[Dict[str, Any]]:
        """
        强制刷新模型定价信息
        
        Args:
            model_name: 模型名称
            
        Returns:
            定价信息字典，包含input/output价格和单位
        """
        logger.info(f"强制刷新模型定价: {model_name}")
        
        # 清除缓存
        self.clear_cache(model_name)
        
        # 从数据库获取
        db_data = self._get_from_database(model_name)
        if db_data:
            # 存入缓存
            self._set_to_cache(model_name, db_data)
            return db_data
        
        return None
    
    def preload_models(self, model_names: List[str] = None) -> Dict[str, bool]:
        """
        预加载模型定价到缓存
        
        Args:
            model_names: 要预加载的模型名称列表，如果为None则预加载所有模型
            
        Returns:
            预加载结果字典，键为模型名称，值为是否成功
        """
        logger.info(f"开始预加载模型定价{'（所有模型）' if model_names is None else f'（{len(model_names)}个模型）'}")
        
        results = {}
        
        if model_names is None:
            # 预加载所有模型
            all_pricing = self.get_all_model_pricing()
            for model_name in all_pricing:
                results[model_name] = True
            return results
        
        # 预加载指定模型
        for model_name in model_names:
            pricing = self.refresh_model_pricing(model_name)
            results[model_name] = pricing is not None
            
        logger.info(f"模型定价预加载完成，成功: {sum(results.values())}/{len(results)}")
        return results


# 全局定价服务实例
pricing_service = DatabasePricingService()


# 预加载常用模型（可以在应用启动时调用）
def preload_common_models():
    """预加载常用模型定价到缓存"""
    common_models = [
        "gpt-4o", 
        "gpt-4o-mini", 
        "gpt-3.5-turbo", 
        "claude-3.5-sonnet",
        "claude-3-opus",
        "claude-3-sonnet",
        "claude-3-haiku",
        "deepseek-chat",
        "Doubao-1.5-lite-32k"
    ]
    return pricing_service.preload_models(common_models)