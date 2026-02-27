import asyncio
import json
import re
import uuid
import hashlib
import base64
from datetime import datetime
from typing import List, Optional, Dict, Any, Callable
from loguru import logger
from enum import Enum
from pathlib import Path

from ..agent.output_types import DisplayText, Actions
from ..live2d_model import Live2dModel
from ..tts.tts_interface import TTSInterface
from ..utils.stream_audio import prepare_audio_payload
from .types import WebSocketSend

# Import WebSocket exception handling
try:
    from websockets.exceptions import ConnectionClosedError
except ImportError:
    # Fallback if websockets library is not available
    class ConnectionClosedError(Exception):
        pass

# 导入全局token统计
try:
    from ..utils.token_counter import token_stats, TokenUsage
except ImportError:
    token_stats = None
    TokenUsage = None
    logger.warning("Token统计不可用，TTS成本统计将无法使用")


class TTSPriority(Enum):
    """TTS任务优先级枚举"""
    LOW = 1        # 低优先级：打招呼语音
    NORMAL = 2     # 普通优先级：一般对话
    HIGH = 3       # 高优先级：重要对话
    URGENT = 4     # 紧急优先级：中断处理


class TTSTask:
    """TTS任务数据类"""
    def __init__(
        self,
        task_id: str,
        priority: TTSPriority,
        tts_text: str,
        display_text: DisplayText,
        actions: Optional[Actions],
        live2d_model: Live2dModel,
        tts_engine: TTSInterface,
        websocket_send: WebSocketSend,
        sequence_number: int,
        client_uid: str = None,
    ):
        self.task_id = task_id
        self.priority = priority
        self.tts_text = tts_text
        self.display_text = display_text
        self.actions = actions
        self.live2d_model = live2d_model
        self.tts_engine = tts_engine
        self.websocket_send = websocket_send
        self.sequence_number = sequence_number
        self.client_uid = client_uid
        self.created_time = datetime.now()
        self.asyncio_task: Optional[asyncio.Task] = None


class GlobalTTSManager:
    """全局TTS管理器，负责协调所有语音播放，防止冲突"""
    
    _instance = None
    _lock = asyncio.Lock()
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if not self._initialized:
            self._initialized = True
            # 【多用户并发支持】按客户端分别管理任务和队列
            # 每个客户端的正在播放的任务
            self._current_playing_tasks: Dict[str, Optional[TTSTask]] = {}
            # 每个客户端的任务队列（按优先级排序）
            self._task_queues: Dict[str, List[TTSTask]] = {}

            # 【修复序列化问题】按用户独立管理序列号和发送队列
            # 每个客户端的序列号计数器
            self._client_sequence_counters: Dict[str, int] = {}
            # 每个客户端的下一个要发送的序列号
            self._client_next_sequence: Dict[str, int] = {}
            # 每个客户端的消息队列
            self._client_payload_queues: Dict[str, asyncio.Queue] = {}
            # 每个客户端的发送任务
            self._client_sender_tasks: Dict[str, Optional[asyncio.Task]] = {}
            # 清理标记
            self._is_cleared = False
            # 任务字典（用于快速查找）
            self._tasks_by_id: Dict[str, TTSTask] = {}
            # WebSocket客户端管理
            self._client_websockets: Dict[str, WebSocketSend] = {}

            # 【移除并发限制】允许无限制的多用户并发TTS处理
            # 系统资源管理由操作系统和硬件自然限制

            # 【兼容性】保留旧的全局属性以确保向后兼容
            self._sender_task: Optional[asyncio.Task] = None
            self._task_queue: List[TTSTask] = []
            self._payload_queue: asyncio.Queue[Dict] = asyncio.Queue()
            self._sequence_counter = 0
            self._next_sequence_to_send = 0


    def _get_next_sequence_for_client(self, client_uid: str) -> int:
        """【修复序列化问题】为指定客户端获取下一个序列号"""
        if client_uid not in self._client_sequence_counters:
            self._client_sequence_counters[client_uid] = 0
            self._client_next_sequence[client_uid] = 0
            self._client_payload_queues[client_uid] = asyncio.Queue()
            self._client_sender_tasks[client_uid] = None

        current_sequence = self._client_sequence_counters[client_uid]
        self._client_sequence_counters[client_uid] += 1
        return current_sequence

    def _ensure_client_sender_task(self, client_uid: str):
        """【修复序列化问题】确保客户端有活跃的发送任务"""
        if client_uid not in self._client_sender_tasks:
            self._client_sender_tasks[client_uid] = None

        sender_task = self._client_sender_tasks[client_uid]
        if not sender_task or sender_task.done():
            self._client_sender_tasks[client_uid] = asyncio.create_task(
                self._process_payload_queue_for_client(client_uid)
            )

    async def _put_payload_for_client(self, client_uid: str, payload: Dict, sequence_number: int):
        """【修复序列化问题】将payload放入指定客户端的队列"""
        if not client_uid:
            client_uid = "default"

        # 确保客户端有队列和发送任务
        if client_uid not in self._client_payload_queues:
            self._client_payload_queues[client_uid] = asyncio.Queue()
            self._client_next_sequence[client_uid] = 0
            self._client_sender_tasks[client_uid] = None

        await self._client_payload_queues[client_uid].put((payload, sequence_number))
        self._ensure_client_sender_task(client_uid)

    
    async def speak(
        self,
        tts_text: str,
        display_text: DisplayText,
        actions: Optional[Actions],
        live2d_model: Live2dModel,
        tts_engine: TTSInterface,
        websocket_send: WebSocketSend,
        priority: TTSPriority = TTSPriority.NORMAL,
        client_uid: str = None,
        enable_sentence_split: bool = True,
    ) -> str:
        """
        请求语音播放

        Args:
            tts_text: 要合成的文本
            display_text: 显示文本
            actions: Live2D动作
            live2d_model: Live2D模型
            tts_engine: TTS引擎
            websocket_send: WebSocket发送函数
            priority: 任务优先级
            client_uid: 客户端ID
            enable_sentence_split: 是否启用句子分割进行逐句播放

        Returns:
            task_id: 任务ID
        """

        async with self._lock:
            # 生成任务ID
            task_id = f"tts_{uuid.uuid4().hex[:8]}"
            
            # 如果是空文本，发送静音payload
            if len(re.sub(r'[\s.,!?，。！？\'"』」）】\s]+', "", tts_text)) == 0:
                logger.debug("Empty TTS text, sending silent display payload")
                current_sequence = self._sequence_counter
                self._sequence_counter += 1

                # 【多用户并发支持】发送静音payload到该客户端
                await self._send_silent_payload(display_text, actions, current_sequence, task_id)
                return task_id

            # 如果启用句子分割，则逐句处理
            if enable_sentence_split:
                sentences = self._split_into_sentences(tts_text)
                logger.debug(f"📝 分割为 {len(sentences)} 个句子进行逐句处理: {[s[:50]+'...' if len(s) > 50 else s for s in sentences]}")

                for i, sentence in enumerate(sentences):
                    # 为每个句子创建独立的DisplayText
                    sentence_display_text = DisplayText(
                        name=display_text.name,
                        text=sentence,
                        is_partial=True,
                        sentence_index=i,
                        total_sentences=len(sentences)
                    )

                    # 只在第一句添加actions，避免重复动作
                    sentence_actions = actions if i == 0 else None

                    # 【修复序列化问题】为该客户端获取独立的序列号
                    current_sequence = self._get_next_sequence_for_client(client_uid)

                    # 创建TTS任务
                    task = TTSTask(
                        task_id=f"{task_id}_s{i}",
                        priority=priority,
                        tts_text=sentence,
                        display_text=sentence_display_text,
                        actions=sentence_actions,
                        live2d_model=live2d_model,
                        tts_engine=tts_engine,
                        websocket_send=websocket_send,
                        sequence_number=current_sequence,
                        client_uid=client_uid,
                    )

                    # 注册WebSocket
                    if client_uid:
                        self._client_websockets[client_uid] = websocket_send

                    # 检查是否需要中断当前播放
                    await self._handle_task_priority(task)
            else:
                # 原有的整段处理逻辑
                # 【修复序列化问题】为该客户端获取独立的序列号
                current_sequence = self._get_next_sequence_for_client(client_uid)

                # 创建TTS任务
                task = TTSTask(
                    task_id=task_id,
                    priority=priority,
                    tts_text=tts_text,
                    display_text=display_text,
                    actions=actions,
                    live2d_model=live2d_model,
                    tts_engine=tts_engine,
                    websocket_send=websocket_send,
                    sequence_number=current_sequence,
                    client_uid=client_uid,
                )

                # 注册WebSocket
                if client_uid:
                    self._client_websockets[client_uid] = websocket_send

                # 检查是否需要中断当前播放
                await self._handle_task_priority(task)

            return task_id
    
    async def _handle_task_priority(self, new_task: TTSTask):
        """【多用户并发支持】处理任务优先级，支持多用户并发TTS"""
        client_uid = new_task.client_uid or "default"

        # 为新客户端初始化队列
        if client_uid not in self._task_queues:
            self._task_queues[client_uid] = []
            self._current_playing_tasks[client_uid] = None

        # 检查该客户端当前是否有任务在播放
        current_task = self._current_playing_tasks.get(client_uid)

        if current_task:
            current_priority = current_task.priority
            new_priority = new_task.priority

            # 只有同一用户的高优先级任务才能中断当前任务
            should_interrupt = new_priority.value > current_priority.value

            if should_interrupt:
                logger.info(f"🛑 用户 {client_uid} 的高优先级任务({new_priority.name})中断当前任务({current_priority.name})")
                await self._interrupt_client_task(client_uid)

                # 将新任务插入该客户端队列头部
                self._task_queues[client_uid].insert(0, new_task)
                self._tasks_by_id[new_task.task_id] = new_task
            else:
                # 按优先级插入该客户端的队列
                self._insert_task_by_priority_for_client(client_uid, new_task)
        else:
            # 该客户端没有当前播放任务，直接插入队列
            self._insert_task_by_priority_for_client(client_uid, new_task)

            # 如果该客户端队列中只有这一个任务，立即开始播放
            if len(self._task_queues[client_uid]) == 1:
                await self._start_next_task_for_client(client_uid)
    
    def _insert_task_by_priority_for_client(self, client_uid: str, task: TTSTask):
        """【多用户并发支持】按优先级插入任务到指定客户端的队列"""
        client_queue = self._task_queues[client_uid]
        inserted = False

        for i, queued_task in enumerate(client_queue):
            if task.priority.value > queued_task.priority.value:
                client_queue.insert(i, task)
                inserted = True
                break

        if not inserted:
            client_queue.append(task)

        self._tasks_by_id[task.task_id] = task
        logger.debug(f"🎯 任务已加入用户 {client_uid} 的队列，队列长度: {len(client_queue)}")

    def _insert_task_by_priority(self, task: TTSTask):
        """【已废弃】按优先级插入任务到全局队列 - 保留以确保兼容性"""
        # 重定向到按客户端的方法
        client_uid = task.client_uid or "default"
        if client_uid not in self._task_queues:
            self._task_queues[client_uid] = []
            self._current_playing_tasks[client_uid] = None
        self._insert_task_by_priority_for_client(client_uid, task)
    
    async def _interrupt_client_task(self, client_uid: str):
        """【多用户并发支持】中断指定客户端的当前播放任务"""
        current_task = self._current_playing_tasks.get(client_uid)
        if not current_task:
            return

        logger.info(f"🛑 中断用户 {client_uid} 的当前TTS任务: {current_task.task_id}")

        # 取消任务
        if current_task.asyncio_task:
            current_task.asyncio_task.cancel()

        # 发送中断信号到前端
        try:
            interrupt_payload = {
                "type": "audio-interrupt",
                "task_id": current_task.task_id,
                "message": "Audio playback interrupted by higher priority task"
            }
            await current_task.websocket_send(json.dumps(interrupt_payload))
        except Exception as e:
            logger.warning(f"发送中断信号失败: {e}")

        # 清理当前任务
        self._tasks_by_id.pop(current_task.task_id, None)
        self._current_playing_tasks[client_uid] = None

    async def _interrupt_current_task(self):
        """【已废弃】中断当前播放的任务 - 保留以确保兼容性"""
        # 中断所有客户端的当前任务（这是一个危险操作，通常不应该使用）
        for client_uid in list(self._current_playing_tasks.keys()):
            await self._interrupt_client_task(client_uid)

    async def _start_next_task_for_client(self, client_uid: str):
        """【多用户并发支持】为指定客户端开始下一个任务"""
        client_queue = self._task_queues.get(client_uid, [])
        if not client_queue:
            return

        # 获取该客户端队列中的第一个任务
        next_task = client_queue.pop(0)
        self._current_playing_tasks[client_uid] = next_task

        logger.info(f"🚀 用户 {client_uid} 开始新的TTS任务: {next_task.task_id}")

        # 【移除并发限制】直接创建异步任务处理TTS，支持无限制并发
        next_task.asyncio_task = asyncio.create_task(
            self._process_tts_task_with_cleanup(next_task, client_uid)
        )

    async def _start_next_task(self):
        """【已废弃】开始下一个任务 - 保留以确保兼容性"""
        # 尝试为所有有队列的客户端启动任务
        for client_uid in list(self._task_queues.keys()):
            if (self._current_playing_tasks.get(client_uid) is None and
                self._task_queues[client_uid]):
                await self._start_next_task_for_client(client_uid)
    
    async def _process_tts_task_with_cleanup(self, task: TTSTask, client_uid: str):
        """【多用户并发支持】处理TTS任务，支持无限制并发"""
        try:
            await self._process_tts_task(task)
        finally:
            # 任务完成后，检查该客户端是否还有其他任务
            self._current_playing_tasks[client_uid] = None
            await self._start_next_task_for_client(client_uid)

    async def _process_tts_task(self, task: TTSTask):
        """处理TTS任务"""
        audio_file_path = None
        try:
            
            # 估算TTS成本
            cost_info = None
            if hasattr(task.tts_engine, 'estimate_cost'):
                try:
                    cost_info = task.tts_engine.estimate_cost(task.tts_text)
                    if cost_info and cost_info.total_cost > 0 and token_stats and TokenUsage:
                        logger.info(f"📊 TTS成本估算: {cost_info.total_cost:.6f} {cost_info.currency} for {len(task.tts_text)} characters")
                        
                        token_stats.add_usage(
                            model="TTS",
                            usage=TokenUsage(prompt_tokens=len(task.tts_text), completion_tokens=0, total_tokens=len(task.tts_text)),
                            cost=cost_info.total_cost
                        )
                except Exception as e:
                    logger.warning(f"估算TTS成本失败: {e}")
            
            # 生成音频
            audio_file_path = await self._generate_audio(task.tts_engine, task.tts_text)

            # 验证音频文件完整性
            if audio_file_path and not await self._verify_audio_file(audio_file_path):
                logger.error(f"❌ 生成的音频文件损坏或无效: {audio_file_path}")
                raise ValueError(f"Generated audio file is corrupted: {audio_file_path}")

            # 准备音频payload
            payload = prepare_audio_payload(
                audio_path=audio_file_path,
                display_text=task.display_text,
                actions=task.actions,
                tts_engine_class=task.tts_engine.__class__.__name__ if task.tts_engine else None,
            )

            # 添加任务信息到payload（不包含音频文件路径，因为我们使用简单删除机制）
            payload["task_id"] = task.task_id
            payload["priority"] = task.priority.name


            # 将payload加入发送队列
            # 【修复序列化问题】发送到该客户端的独立队列
            await self._put_payload_for_client(task.client_uid, payload, task.sequence_number)
            
        except asyncio.CancelledError:
            logger.info(f"TTS任务被取消: {task.task_id}")
            raise
        except Exception as e:
            logger.error(f"❌ TTS任务失败: {task.task_id}, 错误: {e}")
            # 发送静音payload作为错误处理
            payload = prepare_audio_payload(
                audio_path=None,
                display_text=task.display_text,
                actions=task.actions,
                tts_engine_class=task.tts_engine.__class__.__name__ if task.tts_engine else None,
            )
            payload["task_id"] = task.task_id
            payload["error"] = str(e)
            # 【修复序列化问题】发送到该客户端的独立队列
            await self._put_payload_for_client(task.client_uid, payload, task.sequence_number)
        finally:
            # 恢复简单的TTS音频文件删除机制：任务完成后立即删除音频文件
            if audio_file_path:
                try:
                    import os
                    if os.path.exists(audio_file_path):
                        # 在删除前检查文件状态，用于诊断
                        try:
                            file_size = os.path.getsize(audio_file_path)
                            if file_size == 0:
                                logger.warning(f"⚠️ TTS音频文件为空: {audio_file_path}")
                            elif file_size < 1024:  # 小于1KB可能是损坏的文件
                                logger.warning(f"⚠️ TTS音频文件异常小 ({file_size} 字节): {audio_file_path}")
                            else:
                                logger.debug(f"🔍 TTS音频文件大小: {file_size} 字节")
                        except Exception as size_error:
                            logger.warning(f"⚠️ 无法获取文件大小: {audio_file_path}, 错误: {size_error}")

                        os.remove(audio_file_path)
                    else:
                        logger.warning(f"⚠️ TTS音频文件不存在，无法删除: {audio_file_path}")
                except Exception as e:
                    logger.warning(f"⚠️ 删除TTS音频文件失败: {audio_file_path}, 错误: {e}")

            # 【多用户并发支持】任务完成后的清理逻辑已经移到_process_tts_task_with_semaphore中处理
            # 这里保留旧的清理逻辑以确保兼容性，但优先使用新的多用户逻辑
            async with self._lock:
                # 清理任务信息（但不清理current_playing_task，由新的多用户逻辑处理）
                pass  # 任务信息将在payload发送完成后在_process_payload_queue中清理
    
    async def _generate_audio(self, tts_engine: TTSInterface, text: str) -> str:
        """生成音频文件"""
        return await tts_engine.async_generate_audio(
            text=text,
            file_name_no_ext=f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{str(uuid.uuid4())[:8]}",
        )

    async def _verify_audio_file(self, audio_file_path: str) -> bool:
        """验证音频文件完整性"""
        try:
            import os

            if not audio_file_path or not os.path.exists(audio_file_path):
                logger.warning(f"⚠️ 音频文件不存在: {audio_file_path}")
                return False

            # 检查文件大小
            file_size = os.path.getsize(audio_file_path)
            if file_size == 0:
                logger.warning(f"⚠️ 音频文件为空: {audio_file_path}")
                return False

            if file_size < 100:  # 小于100字节几乎肯定是损坏的
                logger.warning(f"⚠️ 音频文件过小 ({file_size} 字节): {audio_file_path}")
                return False

            # 尝试使用pydub快速验证文件格式
            try:
                from pydub import AudioSegment
                # 只读取前一秒来验证格式，避免完全加载大文件
                audio = AudioSegment.from_file(audio_file_path)

                # 检查音频基本属性
                if len(audio) == 0:
                    logger.warning(f"⚠️ 音频文件持续时间为0: {audio_file_path}")
                    return False

                if audio.frame_rate == 0:
                    logger.warning(f"⚠️ 音频文件采样率为0: {audio_file_path}")
                    return False

                logger.debug(f"✅ 音频文件验证通过: {audio_file_path} (大小: {file_size}字节, 时长: {len(audio)}ms)")
                return True

            except Exception as audio_error:
                logger.error(f"❌ 音频文件格式验证失败: {audio_file_path}, 错误: {audio_error}")
                return False

        except Exception as e:
            logger.error(f"❌ 验证音频文件时出错: {audio_file_path}, 错误: {e}")
            return False
    
    async def _ensure_sender_task_running(self):
        """【已废弃】确保发送任务正在运行 - 保留以确保兼容性"""
        # 新的多用户机制中，每个客户端有独立的发送任务
        # 这个方法现在什么都不做，避免启动全局发送任务
        logger.debug("⚠️ _ensure_sender_task_running() 已废弃，使用多用户独立发送任务")

    async def _process_payload_queue(self):
        """【已废弃】处理payload发送队列 - 保留以确保兼容性"""
        # 新的多用户机制中，每个客户端有独立的payload队列处理
        # 这个方法现在什么都不做
        logger.debug("⚠️ _process_payload_queue() 已废弃，使用多用户独立payload队列")
    
    async def _process_payload_queue_for_client(self, client_uid: str):
        """【修复序列化问题】为指定客户端处理payload发送队列"""
        buffered_payloads: Dict[int, Dict] = {}
        client_queue = self._client_payload_queues.get(client_uid)

        if not client_queue:
            logger.warning(f"客户端 {client_uid} 的payload队列不存在")
            return

        logger.debug(f"🚀 启动客户端 {client_uid} 的payload发送任务")

        while True:
            if self._is_cleared:
                logger.debug(f"全局TTS管理器已被清理，停止客户端 {client_uid} 的消息队列处理")
                return

            try:
                try:
                    payload, sequence_number = await asyncio.wait_for(
                        client_queue.get(),
                        timeout=1.0
                    )
                    buffered_payloads[sequence_number] = payload

                    # 按该客户端的序号发送payloads
                    next_sequence = self._client_next_sequence.get(client_uid, 0)
                    while next_sequence in buffered_payloads:
                        next_payload = buffered_payloads.pop(next_sequence)
                        
                        # 【修复序列化问题】获取该客户端的WebSocket发送函数
                        websocket_send = self._client_websockets.get(client_uid)
                        task_id = next_payload.get("task_id")

                        if websocket_send:
                            try:
                                await websocket_send(json.dumps(next_payload))
                                logger.debug(f"✅ TTS消息已发送给客户端 {client_uid}, 任务: {task_id}")

                                # 发送成功后清理对应的任务信息
                                if task_id:
                                    self._tasks_by_id.pop(task_id, None)
                            except Exception as e:
                                error_str = str(e)
                                error_type = str(type(e))
                                
                                is_websocket_error = any([
                                    "websocket.send" in error_str,
                                    "websocket.close" in error_str,
                                    "response already completed" in error_str,
                                    "ConnectionClosed" in error_type,
                                    "WebSocketDisconnect" in error_type,
                                    "Connection" in error_str,
                                    "ASGI message" in error_str and "after sending" in error_str,
                                    "RuntimeError" in error_type and ("websocket" in error_str.lower() or "connection" in error_str.lower())
                                ])
                                
                                if is_websocket_error:
                                    logger.debug(f"WebSocket连接已关闭，跳过当前TTS消息: {e}")
                                    # 不要设置 _is_cleared = True，因为这是全局管理器
                                    # 只清理当前失效的任务，不影响其他客户端
                                    if task_id:
                                        self._tasks_by_id.pop(task_id, None)
                                    # 继续处理其他任务，不要 return
                                else:
                                    logger.error(f"客户端 {client_uid} 发送WebSocket消息时出现未知错误: {e}")

                                # 发送失败也要清理任务信息
                                if task_id:
                                    self._tasks_by_id.pop(task_id, None)
                        else:
                            logger.warning(f"客户端 {client_uid} 的WebSocket不可用，跳过消息发送")
                            if task_id:
                                self._tasks_by_id.pop(task_id, None)

                        # 更新该客户端的下一个序列号
                        self._client_next_sequence[client_uid] = next_sequence + 1
                        next_sequence += 1

                    client_queue.task_done()

                except asyncio.TimeoutError:
                    continue

            except asyncio.CancelledError:
                # 清理该客户端剩余的payloads
                while not client_queue.empty():
                    try:
                        client_queue.get_nowait()
                        client_queue.task_done()
                    except asyncio.QueueEmpty:
                        break
                break

        logger.debug(f"🛑 客户端 {client_uid} 的payload发送任务已结束")
    
    async def _send_silent_payload(
        self,
        display_text: DisplayText,
        actions: Optional[Actions],
        sequence_number: int,
        task_id: str = None,
    ):
        """发送静音payload"""
        audio_payload = prepare_audio_payload(
            audio_path=None,
            display_text=display_text,
            actions=actions,
            tts_engine_class=None,
        )
        # 添加 task_id 到 payload
        if task_id:
            audio_payload["task_id"] = task_id
        # 【修复序列化问题】发送到指定客户端的独立队列
        client_uid = task_id.split('_')[0] if task_id else "default"  # 从task_id解析client_uid
        await self._put_payload_for_client(client_uid, audio_payload, sequence_number)
    
    def _clear_queue(self):
        """清理payload队列"""
        while not self._payload_queue.empty():
            try:
                self._payload_queue.get_nowait()
                self._payload_queue.task_done()
            except asyncio.QueueEmpty:
                break
    
    async def cancel_task(self, task_id: str) -> bool:
        """【多用户并发支持】取消指定的TTS任务"""
        async with self._lock:
            # 从任务字典中找到任务，确定所属客户端
            if task_id not in self._tasks_by_id:
                return False

            task = self._tasks_by_id[task_id]
            client_uid = task.client_uid or "default"

            # 检查是否是当前播放的任务
            current_task = self._current_playing_tasks.get(client_uid)
            if current_task and current_task.task_id == task_id:
                await self._interrupt_client_task(client_uid)
                return True

            # 检查是否在该客户端的队列中
            client_queue = self._task_queues.get(client_uid, [])
            for i, queued_task in enumerate(client_queue):
                if queued_task.task_id == task_id:
                    client_queue.pop(i)
                    self._tasks_by_id.pop(task_id, None)
                    logger.debug(f"❌ 取消用户 {client_uid} 队列中的TTS任务: {task_id}")
                    return True

            return False
    
    async def cancel_all_tasks_for_client(self, client_uid: str):
        """【多用户并发支持】取消指定客户端的所有TTS任务"""
        async with self._lock:
            logger.info(f"🛑 取消用户 {client_uid} 的所有TTS任务")

            # 取消该客户端的当前播放任务
            await self._interrupt_client_task(client_uid)

            # 取消该客户端队列中的所有任务
            client_queue = self._task_queues.get(client_uid, [])
            for task in client_queue:
                if task.asyncio_task and not task.asyncio_task.done():
                    task.asyncio_task.cancel()
                # 从全局任务字典中移除
                self._tasks_by_id.pop(task.task_id, None)

            # 清理该客户端的状态
            if client_uid in self._task_queues:
                self._task_queues[client_uid].clear()
            if client_uid in self._current_playing_tasks:
                self._current_playing_tasks[client_uid] = None

    async def cancel_all_tasks(self):
        """【已废弃】取消所有TTS任务 - 保留以确保兼容性，但建议使用cancel_all_tasks_for_client"""
        # 这个方法现在什么都不做，避免影响其他用户
        logger.warning("⚠️ cancel_all_tasks() 已废弃，请使用 cancel_all_tasks_for_client(client_uid)")
        pass
    
    def get_status(self) -> Dict[str, Any]:
        """【多用户并发支持】获取管理器状态"""
        # 统计所有客户端的状态
        total_active_tasks = len([t for t in self._current_playing_tasks.values() if t is not None])
        total_queued_tasks = sum(len(queue) for queue in self._task_queues.values())

        clients_status = {}
        for client_uid in self._task_queues.keys():
            current_task = self._current_playing_tasks.get(client_uid)
            queue = self._task_queues.get(client_uid, [])

            clients_status[client_uid] = {
                "current_playing_task": current_task.task_id if current_task else None,
                "queue_length": len(queue),
                "queue_tasks": [
                    {
                        "task_id": task.task_id,
                        "priority": task.priority.name,
                        "text_preview": task.tts_text[:50] + "..." if len(task.tts_text) > 50 else task.tts_text,
                        "created_time": task.created_time.isoformat()
                    }
                    for task in queue
                ]
            }

        return {
            "total_active_tasks": total_active_tasks,
            "total_queued_tasks": total_queued_tasks,
            "total_clients": len(self._task_queues),
            "clients_status": clients_status,
            "is_cleared": self._is_cleared,
        }
    

    def _split_into_sentences(self, text: str) -> List[str]:
        """
        将文本按停顿符号分割，包括逗号、句号、问号、顿号等

        Args:
            text: 要分割的文本

        Returns:
            句子片段列表
        """
        # 中英文停顿符号：逗号、句号、问号、感叹号、分号、冒号、顿号等
        pause_marks = r'[，。！？；：、,.!?;:]'

        # 使用正则表达式分割
        parts = re.split(pause_marks, text)

        # 找到所有停顿符号
        marks = re.findall(pause_marks, text)

        result = []
        for i, part in enumerate(parts):
            part = part.strip()
            if part:  # 跳过空片段
                # 如果有对应的标点符号，添加回去
                if i < len(marks):
                    part += marks[i]
                result.append(part)

        # 如果没有找到停顿符号，返回原文本
        if not result and text.strip():
            result.append(text.strip())

        return result

    # 添加已删除文件跟踪，防止重复删除
    _deleted_files = set()

    async def cleanup_audio_file(self, audio_file_path: str, tts_engine_class: str = None):
        """
        音频播放完成后清理音频文件

        Args:
            audio_file_path: 音频文件路径
            tts_engine_class: TTS引擎类名（用于选择正确的删除方法）
        """
        logger.info(f"🗑️ [音频文件追踪] 收到删除请求: {audio_file_path}")
        logger.debug(f"🗑️ [音频文件追踪] TTS引擎类: {tts_engine_class}")

        # 检查文件是否已经被删除过
        if audio_file_path in self._deleted_files:
            logger.debug(f"🗑️ [音频文件追踪] 文件已被删除过，跳过重复删除: {audio_file_path}")
            return

        # 添加调试信息来跟踪MCP工具状态
        try:
            from ..service_context import ServiceContext
            global_mcp_enabled = getattr(ServiceContext, '_global_mcp_enabled', None)
            logger.debug(f"🗑️ [音频文件追踪] 全局MCP启用状态: {global_mcp_enabled}")
        except Exception as e:
            logger.debug(f"🗑️ [音频文件追踪] 无法获取MCP状态: {e}")

        try:
            import os
            if not audio_file_path:
                logger.warning(f"⚠️ [音频文件追踪] 音频文件路径为空，跳过删除")
                return

            if os.path.exists(audio_file_path):
                file_size = os.path.getsize(audio_file_path)
                os.remove(audio_file_path)
                # 记录已删除的文件
                self._deleted_files.add(audio_file_path)
                logger.info(f"✅ [音频文件追踪] 音频文件已成功删除: {audio_file_path} (大小: {file_size} 字节)")

                # 定期清理已删除文件集合，防止内存泄漏（保留最近100个记录）
                if len(self._deleted_files) > 100:
                    deleted_list = list(self._deleted_files)
                    self._deleted_files = set(deleted_list[-50:])  # 保留最近50个
            else:
                # 即使文件不存在，也记录到已删除集合中，防止重复尝试
                self._deleted_files.add(audio_file_path)
                logger.warning(f"⚠️ [音频文件追踪] 音频文件不存在，可能已被删除: {audio_file_path}")
        except Exception as e:
            logger.error(f"❌ [音频文件追踪] 删除音频文件失败 {audio_file_path}: {e}")
            # 如果删除失败，记录更多调试信息
            try:
                import os
                if os.path.exists(audio_file_path):
                    file_stats = os.stat(audio_file_path)
                    logger.error(f"❌ [音频文件追踪] 文件状态 - 大小: {file_stats.st_size}, 修改时间: {file_stats.st_mtime}")
            except Exception as stat_error:
                logger.error(f"❌ [音频文件追踪] 无法获取文件状态: {stat_error}")

    async def wait_for_all_tasks_complete(self, timeout: float = 10.0) -> bool:
        """
        【多用户并发支持】等待所有TTS任务完成

        Args:
            timeout: 超时时间（秒）

        Returns:
            bool: True如果所有任务都完成，False如果超时
        """
        start_time = asyncio.get_event_loop().time()

        try:
            # 首次检查 - 使用锁
            async with self._lock:
                # 统计所有客户端的任务
                total_active_tasks = len([t for t in self._current_playing_tasks.values() if t is not None])
                total_queued_tasks = sum(len(queue) for queue in self._task_queues.values())
                total_tasks = total_active_tasks + total_queued_tasks

                logger.info(f"🎯 等待TTS任务完成 - 活跃任务: {total_active_tasks}, 队列任务: {total_queued_tasks}, 总计: {total_tasks}")

                # 如果没有任务，直接返回
                if total_tasks == 0:
                    logger.info("✅ 没有TTS任务需要等待")
                    return True

            # 简化等待逻辑 - 避免在循环中反复获取锁
            while True:
                # 检查超时
                elapsed_time = asyncio.get_event_loop().time() - start_time
                if elapsed_time >= timeout:
                    logger.warning(f"⏰ TTS任务等待超时 ({timeout}秒)")
                    return False

                # 获取当前状态快照 - 快速获取锁后立即释放
                try:
                    await asyncio.wait_for(self._lock.acquire(), timeout=0.1)
                    try:
                        # 【多用户并发支持】统计所有客户端的任务
                        total_active_tasks = len([t for t in self._current_playing_tasks.values() if t is not None])
                        total_queued_tasks = sum(len(queue) for queue in self._task_queues.values())
                        total_tasks = total_active_tasks + total_queued_tasks

                        logger.debug(f"🔍 任务状态检查 - 活跃: {total_active_tasks}, 队列: {total_queued_tasks}, 总计: {total_tasks}")

                        # 如果没有任务了，说明全部完成
                        if total_tasks == 0:
                            logger.info("✅ 所有TTS任务已完成")
                            return True
                    finally:
                        self._lock.release()
                except asyncio.TimeoutError:
                    # 如果无法获取锁，等待一小段时间后重试
                    logger.debug("获取TTS管理器锁超时，继续等待...")
                    await asyncio.sleep(0.1)
                    continue

                # 等待一小段时间后重新检查
                await asyncio.sleep(0.2)

        except Exception as e:
            logger.error(f"等待TTS任务完成时发生错误: {e}")
            return False

    def clear(self):
        """清理管理器状态"""
        # 创建清理任务
        async def async_clear():
            await self.cancel_all_tasks()

            # 取消发送任务
            if self._sender_task and not self._sender_task.done():
                self._sender_task.cancel()

            # 清理队列
            self._clear_queue()

            # 重置计数器
            self._sequence_counter = 0
            self._next_sequence_to_send = 0

            # 创建新队列
            self._payload_queue = asyncio.Queue()

            # 清理客户端WebSocket
            self._client_websockets.clear()

            self._is_cleared = False

        # 如果有事件循环则异步执行，否则创建新的
        try:
            loop = asyncio.get_running_loop()
            asyncio.create_task(async_clear())
        except RuntimeError:
            # 没有运行中的事件循环
            asyncio.run(async_clear())


# 创建全局单例实例
global_tts_manager = GlobalTTSManager()