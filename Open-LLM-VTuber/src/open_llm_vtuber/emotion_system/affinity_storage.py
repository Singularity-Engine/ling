import os
import json
import re
import threading
import queue
import time
from datetime import datetime
from typing import List, Dict, Optional, Tuple
from loguru import logger

class AffinityStorage:
    """Handles persistent storage of affinity data"""
    
    def __init__(self, storage_path: str = "affinity_data"):
        """Initialize affinity storage
        
        Args:
            storage_path: Path to store affinity data files
        """
        self.storage_path = storage_path
        os.makedirs(storage_path, exist_ok=True)
        
    def _get_file_path(self, character_id: str, user_id: str) -> str:
        """Get the storage file path for a character-user pair
        
        Args:
            character_id: Character identifier
            user_id: User identifier
            
        Returns:
            str: Path to the storage file
        """
        safe_character_id = self._sanitize_id(character_id)
        safe_user_id = self._sanitize_id(user_id)
        return os.path.join(self.storage_path, f"{safe_character_id}_{safe_user_id}.json")
    
    def _sanitize_id(self, id_str: str) -> str:
        """Sanitize ID string for safe file name
        
        Args:
            id_str: ID string to sanitize
            
        Returns:
            str: Sanitized ID string
        """
        return re.sub(r'[^\w\-_]', '_', id_str)
    
    def get_affinity(self, character_id: str, user_id: str) -> int:
        """Get current affinity value
        
        Args:
            character_id: Character identifier
            user_id: User identifier
            
        Returns:
            int: Current affinity value (0-100), defaults to 50
        """
        file_path = self._get_file_path(character_id, user_id)
        if not os.path.exists(file_path):
            return 50  # Default affinity value
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return data.get("affinity", 50)  # Changed default from 100 to 50
        except Exception as e:
            logger.error(f"Failed to read affinity data: {e}")
            return 50  # Changed default from 100 to 50
    
    def save_affinity(self, character_id: str, user_id: str, affinity: int) -> bool:
        """Save affinity value
        
        Args:
            character_id: Character identifier
            user_id: User identifier
            affinity: Affinity value to save (0-100)
            
        Returns:
            bool: Whether save was successful
        """
        # Validate affinity value
        affinity = max(0, min(100, affinity))
        
        file_path = self._get_file_path(character_id, user_id)
        
        # Read existing data or create new data
        data = {}
        if os.path.exists(file_path):
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
            except Exception as e:
                logger.error(f"Failed to read existing affinity data: {e}")
        
        # Update data
        data["character_id"] = character_id
        data["user_id"] = user_id
        data["affinity"] = affinity
        data["last_updated"] = datetime.now().isoformat()
        
        # Ensure history exists
        if "affinity_history" not in data:
            data["affinity_history"] = []
        
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            return True
        except Exception as e:
            logger.error(f"Failed to save affinity data: {e}")
            return False
    
    def get_affinity_history(self, character_id: str, user_id: str) -> List[Dict]:
        """Get affinity history
        
        Args:
            character_id: Character identifier
            user_id: User identifier
            
        Returns:
            List[Dict]: List of historical affinity records
        """
        file_path = self._get_file_path(character_id, user_id)
        if not os.path.exists(file_path):
            return []
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return data.get("affinity_history", [])
        except Exception as e:
            logger.error(f"Failed to read affinity history: {e}")
            return []
    
    def add_affinity_history_entry(
        self, 
        character_id: str,
        user_id: str,
        change: int,
        reason: str
    ) -> bool:
        """Add an entry to affinity history (JSON backend)."""
        file_path = self._get_file_path(character_id, user_id)
        data: Dict = {}
        if os.path.exists(file_path):
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
            except Exception as e:
                logger.error(f"Failed to read affinity data for history update: {e}")
                return False
        else:
            # Initialize minimal structure if file doesn't exist
            data = {
                "character_id": character_id,
                "user_id": user_id,
                "affinity": 50,
                "last_updated": datetime.now().isoformat(),
                "affinity_history": []
            }

        current_value = int(data.get("affinity", 50))
        entry = {
            "timestamp": datetime.now().isoformat(),
            "value": current_value,
            "change": int(change),
            "reason": reason,
        }

        if "affinity_history" not in data or not isinstance(data.get("affinity_history"), list):
            data["affinity_history"] = []
        data["affinity_history"].append(entry)

        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            return True
        except Exception as e:
            logger.error(f"Failed to save affinity history: {e}")
            return False

    def apply_change(self, character_id: str, user_id: str, delta: int, reason: str) -> int:
        """Default apply_change for file storage: compute, save, and add history.
        Returns the new affinity value.
        """
        current = self.get_affinity(character_id, user_id)
        new_val = max(0, min(100, int(current) + int(delta)))
        self.save_affinity(character_id, user_id, new_val)
        self.add_affinity_history_entry(character_id, user_id, int(delta), reason)
        return new_val


class PgRedisAffinityStorage:
    """Affinity storage backed by PostgreSQL with Redis cache.

    This class provides the same interface as AffinityStorage,
    so it can be used by EmotionManager without changes.
    """

    def __init__(self) -> None:
        try:
            # 延迟导入以避免在打包或工具环境下的路径问题
            from ..database.pgsql import (
                get_db_manager,
                get_redis_manager,
                AffinityManager,
            )
        except Exception as e:
            raise RuntimeError(f"无法导入数据库层: {e}")

        db = get_db_manager()
        redis_mgr = get_redis_manager()
        self._mgr = AffinityManager(db, redis_mgr)
        self._db = db

        # 异步持久化队列与后台线程（有界队列 + 满了丢弃最旧项）
        try:
            maxsize = int(os.getenv("AFFINITY_QUEUE_MAXSIZE", "1000"))
        except Exception:
            maxsize = 1000
        # 队列仅存放 key（character_id,user_id），任务体存于 _pending_jobs 合并聚合
        self._job_queue: "queue.Queue[Tuple[str, str]]" = queue.Queue(maxsize=maxsize)
        self._pending_jobs: Dict[Tuple[str, str], Tuple[str, tuple]] = {}
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._worker = threading.Thread(target=self._background_worker, name="AffinityPersistWorker", daemon=True)
        self._worker.start()

    def _enqueue_job(self, job_type: str, args: tuple) -> None:
        """按 (character_id,user_id) 合并：
        - delta: 聚合同键 delta，保留最新 reason
        - upsert: 覆盖同键任何待处理任务
        - 队列仅入 key；若 key 已在队列中，仅更新聚合内容不重复入队
        - 队列满时，移除队首 key 和其聚合任务，再入新 key
        """
        key: Tuple[str, str]
        if job_type == "delta":
            character_id, user_id, delta, reason = args
            key = (str(character_id), str(user_id))
            with self._lock:
                if key in self._pending_jobs:
                    exist_type, exist_args = self._pending_jobs[key]
                    if exist_type == "delta":
                        # 聚合 delta，保留最新 reason
                        _, _, old_delta, _ = exist_args
                        new_delta = int(old_delta) + int(delta)
                        self._pending_jobs[key] = ("delta", (character_id, user_id, new_delta, reason))
                    else:
                        # 覆盖为最新 delta
                        self._pending_jobs[key] = ("delta", (character_id, user_id, int(delta), reason))
                    # 不重复入队
                    return
                # 新键：若队列满则丢弃队首键的聚合任务
                if self._job_queue.full():
                    try:
                        old_key = self._job_queue.get_nowait()
                        with self._lock:
                            self._pending_jobs.pop(old_key, None)
                        self._job_queue.task_done()
                    except Exception:
                        pass
                # 记录聚合任务并入队 key
                self._pending_jobs[key] = ("delta", (character_id, user_id, int(delta), reason))
                try:
                    self._job_queue.put_nowait(key)
                except Exception as e:
                    logger.error(f"enqueue key failed: {e}")
            return
        elif job_type == "upsert":
            character_id, user_id, value = args
            key = (str(character_id), str(user_id))
            with self._lock:
                if key in self._pending_jobs:
                    # 最新 upsert 覆盖
                    self._pending_jobs[key] = ("upsert", (character_id, user_id, int(value)))
                    return
                if self._job_queue.full():
                    try:
                        old_key = self._job_queue.get_nowait()
                        with self._lock:
                            self._pending_jobs.pop(old_key, None)
                        self._job_queue.task_done()
                    except Exception:
                        pass
                self._pending_jobs[key] = ("upsert", (character_id, user_id, int(value)))
                try:
                    self._job_queue.put_nowait(key)
                except Exception as e:
                    logger.error(f"enqueue key failed: {e}")
            return
        else:
            logger.warning(f"Unknown job type on enqueue: {job_type}")

    def _background_worker(self) -> None:
        backoff_base = 0.2
        # 获取后台线程专用的数据库连接
        conn = self._db.get_connection()
        if not conn:
            logger.error("后台线程无法获取数据库连接")
            return

        try:
            while not self._stop_event.is_set():
                try:
                    # 使用较短的超时时间以便及时响应停止信号
                    key = self._job_queue.get(timeout=0.5)
                except queue.Empty:
                    continue

                try:
                    # 取出并移除该 key 的聚合任务
                    with self._lock:
                        job = self._pending_jobs.pop(key, None)
                    if not job:
                        continue

                    job_type, args = job
                    if job_type == "delta":
                        character_id, user_id, delta, reason = args
                        self._mgr.apply_change(character_id, user_id, int(delta), reason, conn=conn)
                    elif job_type == "upsert":
                        character_id, user_id, value = args
                        self._mgr.upsert_affinity(character_id, user_id, int(value), conn=conn)
                    else:
                        logger.warning(f"Unknown affinity job type: {job_type}")
                except Exception as e:
                    # 简单重试：放回队列尾部并短暂退避
                    logger.error(f"Affinity persist job failed: {e}. Will retry shortly.")
                    try:
                        # 将失败任务重新合并入队
                        if job_type == "delta":
                            character_id, user_id, delta, reason = args
                            self._enqueue_job("delta", (character_id, user_id, int(delta), reason))
                        elif job_type == "upsert":
                            character_id, user_id, value = args
                            self._enqueue_job("upsert", (character_id, user_id, int(value)))
                    except Exception:
                        pass
                    time.sleep(backoff_base)
                finally:
                    try:
                        self._job_queue.task_done()
                    except Exception:
                        pass
        finally:
            # 确保连接被归还到连接池
            self._db.return_connection(conn)

    def stop(self) -> None:
        """优雅停止后台线程"""
        if self._stop_event.is_set():
            return

        logger.info("正在停止亲密度持久化线程...")
        self._stop_event.set()

        # 等待当前任务完成
        if self._worker.is_alive():
            self._job_queue.join()
            self._worker.join(timeout=5.0)

        # 确保所有待处理任务都被持久化
        if self._pending_jobs:
            logger.warning(f"仍有 {len(self._pending_jobs)} 个亲密度更新任务未完成")

        logger.info("亲密度持久化线程已停止")

    def __del__(self):
        """确保线程在对象销毁时被正确停止"""
        self.stop()

    def get_affinity(self, character_id: str, user_id: str) -> int:
        try:
            return int(self._mgr.get_affinity(character_id, user_id, default=50))
        except Exception:
            return 50

    def save_affinity(self, character_id: str, user_id: str, affinity: int) -> bool:
        # 先写缓存，再异步持久化PG
        try:
            val = int(affinity)
            self._mgr.cache.set_affinity(character_id, user_id, val)
            self._enqueue_job("upsert", (character_id, user_id, val))
            return True
        except Exception as e:
            logger.error(f"save_affinity enqueue failed: {e}")
            return False

    def get_affinity_history(self, character_id: str, user_id: str) -> List[Dict]:
        try:
            conn = self._db.get_connection()
            if not conn:
                return []
            cur = conn.cursor()
            cur.execute(
                """
                SELECT ah.timestamp, ah.value, ah.change_amount, ah.reason
                FROM affinity_history ah
                JOIN character_affinity ca ON ca.id = ah.character_affinity_id
                WHERE ca.character_name = %s AND ca.user_id = %s AND ah.is_deleted = FALSE
                ORDER BY ah.timestamp DESC
                LIMIT 200
                """,
                (character_id, user_id),
            )
            rows = cur.fetchall() or []
            cur.close()
            self._db.return_connection(conn)
            # RealDictCursor → dict already; 若非字典则简化为字段映射
            result: List[Dict] = []
            for r in rows:
                if isinstance(r, dict):
                    result.append(r)
                else:
                    # 顺序: timestamp, value, change_amount, reason
                    result.append(
                        {
                            "timestamp": r[0],
                            "value": r[1],
                            "change": r[2],
                            "reason": r[3],
                        }
                    )
            return result
        except Exception:
            try:
                self._db.return_connection(conn)  # type: ignore[name-defined]
            except Exception:
                pass
            return []

    def add_affinity_history_entry(self, character_id: str, user_id: str, change: int, reason: str) -> bool:
        # 仅用于兼容接口；异步模型下由 apply_change 统一处理
        try:
            self.apply_change(character_id, user_id, int(change), reason)
            return True
        except Exception:
            return False

    def apply_change(self, character_id: str, user_id: str, delta: int, reason: str) -> int:
        # 读取当前（优先缓存，miss回源），计算新值，先更新缓存，再入队异步写PG
        try:
            current = int(self._mgr.get_affinity(character_id, user_id, default=50))
            new_val = max(0, min(100, current + int(delta)))
            # 刷新缓存
            self._mgr.cache.set_affinity(character_id, user_id, new_val)
            # 入队异步持久化（带历史）
            self._enqueue_job("delta", (character_id, user_id, int(delta), reason))
            return new_val
        except Exception as e:
            logger.error(f"apply_change failed: {e}")
            return self.get_affinity(character_id, user_id)