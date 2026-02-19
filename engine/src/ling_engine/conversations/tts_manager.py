import asyncio
import json
import re
import uuid
import asyncio
from datetime import datetime
from typing import List, Optional, Dict
from loguru import logger

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


class TTSTaskManager:
    """Manages TTS tasks and ensures ordered delivery to frontend while allowing parallel TTS generation"""

    def __init__(self, max_concurrent_tts: int = 5) -> None:
        self.task_list: List[asyncio.Task] = []
        self._lock = asyncio.Lock()
        # Queue to store ordered payloads
        self._payload_queue: asyncio.Queue[Dict] = asyncio.Queue()
        # Task to handle sending payloads in order
        self._sender_task: Optional[asyncio.Task] = None
        # Counter for maintaining order
        self._sequence_counter = 0
        self._next_sequence_to_send = 0
        # 标记是否已经被清理，用于避免在连接断开后继续处理
        self._is_cleared = False
        # 并发控制
        self._max_concurrent_tts = max_concurrent_tts
        self._tts_semaphore = asyncio.Semaphore(max_concurrent_tts)

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

    async def speak(
        self,
        tts_text: str,
        display_text: DisplayText,
        actions: Optional[Actions],
        live2d_model: Live2dModel,
        tts_engine: TTSInterface,
        websocket_send: WebSocketSend,
        enable_sentence_split: bool = True,
    ) -> None:
        """
        Queue a TTS task while maintaining order of delivery.

        Args:
            tts_text: Text to synthesize
            display_text: Text to display in UI
            actions: Live2D model actions
            live2d_model: Live2D model instance
            tts_engine: TTS engine instance
            websocket_send: WebSocket send function
            enable_sentence_split: Whether to split text into sentences for progressive display
        """
        if len(re.sub(r'[\s.,!?，。！？\'"』」）】\s]+', "", tts_text)) == 0:
            logger.debug("Empty TTS text, sending silent display payload")
            # Get current sequence number for silent payload
            current_sequence = self._sequence_counter
            self._sequence_counter += 1

            # Start sender task if not running
            if not self._sender_task or self._sender_task.done():
                self._sender_task = asyncio.create_task(
                    self._process_payload_queue(websocket_send)
                )

            await self._send_silent_payload(display_text, actions, current_sequence)
            return

        logger.debug(
            f"🏃Queuing TTS task for: '''{tts_text}''' (by {display_text.name})"
        )

        # Start sender task if not running
        if not self._sender_task or self._sender_task.done():
            self._sender_task = asyncio.create_task(
                self._process_payload_queue(websocket_send)
            )

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
                
                # Get current sequence number
                current_sequence = self._sequence_counter
                self._sequence_counter += 1
                
                # Create and queue the TTS task for this sentence
                task = asyncio.create_task(
                    self._process_tts(
                        tts_text=sentence,
                        display_text=sentence_display_text,
                        actions=sentence_actions,
                        live2d_model=live2d_model,
                        tts_engine=tts_engine,
                        sequence_number=current_sequence,
                    )
                )
                self.task_list.append(task)
        else:
            # 原有的整段处理逻辑
            # Get current sequence number
            current_sequence = self._sequence_counter
            self._sequence_counter += 1
            
            # Create and queue the TTS task
            task = asyncio.create_task(
                self._process_tts(
                    tts_text=tts_text,
                    display_text=display_text,
                    actions=actions,
                    live2d_model=live2d_model,
                    tts_engine=tts_engine,
                    sequence_number=current_sequence,
                )
            )
            self.task_list.append(task)

    async def _process_payload_queue(self, websocket_send: WebSocketSend) -> None:
        """
        Process and send payloads in correct order.
        Runs continuously until all payloads are processed.
        """
        buffered_payloads: Dict[int, Dict] = {}

        while True:
            # 检查是否已被清理，如果是则退出
            if self._is_cleared:
                logger.debug("TTS管理器已被清理，停止处理消息队列")
                return
                
            try:
                # Get payload from queue with timeout to allow cancellation
                try:
                    payload, sequence_number = await asyncio.wait_for(
                        self._payload_queue.get(), 
                        timeout=1.0  # 1 second timeout to check for cancellation
                    )
                    buffered_payloads[sequence_number] = payload

                    # Send payloads in order
                    while self._next_sequence_to_send in buffered_payloads:
                        next_payload = buffered_payloads.pop(self._next_sequence_to_send)
                        try:
                            await websocket_send(json.dumps(next_payload))
                        except Exception as e:
                            # 更全面的WebSocket连接异常处理
                            error_str = str(e)
                            error_type = str(type(e))
                            
                            # 检查是否为WebSocket连接相关的异常
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
                                logger.debug(f"WebSocket连接已关闭，停止发送TTS消息: {e}")
                                # 设置清理标记防止后续处理
                                self._is_cleared = True
                                # 清理所有剩余的payload
                                buffered_payloads.clear()
                                # 清空队列中的所有剩余项目
                                self._clear_queue()
                                return  # 优雅退出循环
                            else:
                                # 记录其他类型的异常但不中断处理
                                logger.error(f"发送WebSocket消息时出现未知错误: {e}，跳过此消息继续处理")
                                # 跳过这个消息，继续处理下一个
                        self._next_sequence_to_send += 1

                    self._payload_queue.task_done()

                except asyncio.TimeoutError:
                    # Timeout allows checking for cancellation
                    continue

            except asyncio.CancelledError:
                # Clean up any remaining payloads before exiting
                while not self._payload_queue.empty():
                    try:
                        self._payload_queue.get_nowait()
                        self._payload_queue.task_done()
                    except asyncio.QueueEmpty:
                        break
                break

    async def _send_silent_payload(
        self,
        display_text: DisplayText,
        actions: Optional[Actions],
        sequence_number: int,
    ) -> None:
        """Queue a silent audio payload"""
        audio_payload = prepare_audio_payload(
            audio_path=None,
            display_text=display_text,
            actions=actions,
        )
        await self._payload_queue.put((audio_payload, sequence_number))

    async def _process_tts(
        self,
        tts_text: str,
        display_text: DisplayText,
        actions: Optional[Actions],
        live2d_model: Live2dModel,
        tts_engine: TTSInterface,
        sequence_number: int,
    ) -> None:
        """Process TTS generation and queue the result for ordered delivery"""
        audio_file_path = None
        
        # 使用信号量控制并发TTS请求数量
        async with self._tts_semaphore:
            try:
                # 检查是否是第一个TTS任务，如果是则记录总响应时间
                if hasattr(self, '_conversation_start_time') and not hasattr(self, '_first_tts_logged'):
                    import time
                    total_response_time = time.time()
                    total_latency = (total_response_time - self._conversation_start_time) * 1000  # 转换为毫秒
                    logger.info(f"⏰ 总响应时间: {total_latency:.0f}ms (从用户发送到数字人开始讲话)")
                    print(f"[DEBUG] ⏰ 总响应时间: {total_latency:.0f}ms (从用户发送到数字人开始讲话)")
                    self._first_tts_logged = True
                
                # 估算TTS成本
                cost_info = None
                if hasattr(tts_engine, 'estimate_cost'):
                    try:
                        cost_info = tts_engine.estimate_cost(tts_text)
                        if cost_info and cost_info.total_cost > 0 and token_stats and TokenUsage:
                            # 记录TTS成本到全局统计
                            logger.info(f"📊 TTS成本估算: {cost_info.total_cost:.6f} {cost_info.currency} for {len(tts_text)} characters")
                            
                            # 添加到会话统计（现在TTS成本计算器直接返回USD）
                            token_stats.add_usage(
                                model="TTS",
                                usage=TokenUsage(prompt_tokens=len(tts_text), completion_tokens=0, total_tokens=len(tts_text)),
                                cost=cost_info.total_cost
                            )
                    except Exception as e:
                        logger.warning(f"估算TTS成本失败: {e}")
                
                audio_file_path = await self._generate_audio(tts_engine, tts_text)
                payload = prepare_audio_payload(
                    audio_path=audio_file_path,
                    display_text=display_text,
                    actions=actions,
                )
                # Queue the payload with its sequence number
                await self._payload_queue.put((payload, sequence_number))

            except Exception as e:
                logger.error(f"Error preparing audio payload: {e}")
                # Queue silent payload for error case
                payload = prepare_audio_payload(
                    audio_path=None,
                    display_text=display_text,
                    actions=actions,
                )
                await self._payload_queue.put((payload, sequence_number))

            finally:
                if audio_file_path:
                    tts_engine.remove_file(audio_file_path)
                    logger.debug("Audio cache file cleaned.")

    async def _generate_audio(self, tts_engine: TTSInterface, text: str) -> str:
        """Generate audio file from text"""
        logger.debug(f"🏃Generating audio for '''{text}'''...")
        return await tts_engine.async_generate_audio(
            text=text,
            file_name_no_ext=f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{str(uuid.uuid4())[:8]}",
        )

    def _clear_queue(self) -> None:
        """Helper method to clear the payload queue"""
        while not self._payload_queue.empty():
            try:
                self._payload_queue.get_nowait()
                self._payload_queue.task_done()
            except asyncio.QueueEmpty:
                break

    def clear(self) -> None:
        """Clear all pending tasks and reset state"""
        logger.debug("清理TTS管理器：取消所有任务并重置状态")
        
        # Cancel all TTS tasks
        for task in self.task_list:
            if task and not task.done():
                task.cancel()
        self.task_list.clear()
        
        # Cancel sender task
        if self._sender_task and not self._sender_task.done():
            self._sender_task.cancel()
            logger.debug("已取消TTS发送任务")
        
        # Clear queue
        self._clear_queue()
        
        # Reset counters
        self._sequence_counter = 0
        self._next_sequence_to_send = 0
        
        # Create a new queue to clear any pending items
        self._payload_queue = asyncio.Queue()
        
        logger.debug("TTS管理器清理完成")

    async def wait_for_all_tasks_complete(self, timeout: float = 10.0) -> bool:
        """
        等待所有TTS任务完成

        Args:
            timeout: 超时时间（秒）

        Returns:
            bool: True如果所有任务都完成，False如果超时
        """
        if not self.task_list:
            return True

        try:
            # 等待所有TTS任务完成，但设置超时避免卡死
            await asyncio.wait_for(
                asyncio.gather(*self.task_list, return_exceptions=True),
                timeout=timeout
            )

            # 等待发送任务也完成
            if self._sender_task and not self._sender_task.done():
                await asyncio.wait_for(self._sender_task, timeout=2.0)

            logger.debug("所有TTS任务已完成")
            return True

        except asyncio.TimeoutError:
            logger.warning(f"等待TTS任务完成超时 ({timeout}秒)")
            return False
        except Exception as e:
            logger.error(f"等待TTS任务完成时发生错误: {e}")
            return False
