"""launchd/cron 调用入口

用法:
    python -m ling_engine.soul.consolidation.run_consolidation
    python -m ling_engine.soul.consolidation.run_consolidation --dry-run
"""

import argparse
import asyncio
import fcntl
import os
import signal
import sys
from pathlib import Path

from loguru import logger

# 全局超时: 防止 MongoDB 阻塞导致进程挂死 (10 分钟)
GLOBAL_TIMEOUT_SECONDS = 600

# PYTHONPATH 防御 — launchd 不一定设了正确的 PYTHONPATH
_src_dir = str(Path(__file__).resolve().parents[3])  # engine/src
if _src_dir not in sys.path:
    sys.path.insert(0, _src_dir)


def _load_env():
    """加载 .env 文件获取 MONGO_URL 等凭证 (launchd 不加载 shell profile)"""
    env_path = Path.home() / ".openclaw" / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


LOCK_FILE = Path.home() / ".openclaw" / "soul-consolidator.lock"

def _notify_telegram(text: str):
    """发送 Telegram 通知 — 整理完成/失败时调用"""
    token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    chat_id = os.getenv("TELEGRAM_CHAT_ID", "").strip()

    if not token or not chat_id:
        logger.warning(
            "[Consolidator] Telegram not configured, skip notification "
            "(set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID)"
        )
        return
    try:
        import urllib.request
        import json
        url = f"https://api.telegram.org/bot{token}/sendMessage"
        data = json.dumps({"chat_id": chat_id, "text": text}).encode()
        req = urllib.request.Request(
            url, data=data,
            headers={"Content-Type": "application/json"},
        )
        urllib.request.urlopen(req, timeout=5)
    except Exception as e:
        logger.warning(f"[Consolidator] Telegram notify failed: {e}")


async def main(dry_run: bool = False):
    """主入口: 初始化索引 → 执行整理 → Telegram 通知"""
    from ling_engine.soul.storage.soul_collections import ensure_indexes
    await ensure_indexes()

    from ling_engine.soul.consolidation.nightly_consolidator import NightlyConsolidator

    try:
        results = await NightlyConsolidator(dry_run=dry_run).run()
    except Exception as e:
        _notify_telegram(f"🔴 灵魂整理失败: {e}")
        raise

    # stdout 输出摘要 (方便日志监控)
    lines = []
    for name, r in results.get("tasks", {}).items():
        status = r.get("status", "unknown")
        elapsed = r.get("elapsed_ms", 0)
        logger.info(f"[Consolidator] {name}: {status} ({elapsed}ms)")
        line = f"{name}: {status} ({elapsed}ms)"
        print(line)
        lines.append(line)

    total_ms = results.get("total_elapsed_ms", 0)
    print(f"Total: {total_ms}ms (dry_run={dry_run})")

    # Telegram 摘要通知
    has_error = any(
        r.get("status") == "error" for r in results.get("tasks", {}).values()
    )
    emoji = "🟡" if has_error else "🟢"
    dry_tag = " [DRY-RUN]" if dry_run else ""
    summary = "\n".join(lines)
    _notify_telegram(
        f"{emoji} 灵魂整理完成{dry_tag} ({total_ms}ms)\n{summary}"
    )


if __name__ == "__main__":
    _load_env()

    parser = argparse.ArgumentParser(description="Soul memory consolidation")
    parser.add_argument("--dry-run", action="store_true", help="Dry run without writes")
    args = parser.parse_args()

    # fcntl.flock 文件锁防止并发
    LOCK_FILE.parent.mkdir(parents=True, exist_ok=True)
    lock_fd = open(LOCK_FILE, "w")
    try:
        fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        print("Another consolidation process is running, exiting.")
        sys.exit(0)

    # signal.alarm 全局超时保护
    def _timeout_handler(signum, frame):
        logger.error(f"[Consolidator] Global timeout ({GLOBAL_TIMEOUT_SECONDS}s), forcing exit")
        print(f"ERROR: Global timeout ({GLOBAL_TIMEOUT_SECONDS}s), forcing exit")
        sys.exit(1)

    signal.signal(signal.SIGALRM, _timeout_handler)
    signal.alarm(GLOBAL_TIMEOUT_SECONDS)

    try:
        asyncio.run(main(dry_run=args.dry_run))
    finally:
        signal.alarm(0)  # 取消超时
        fcntl.flock(lock_fd, fcntl.LOCK_UN)
        lock_fd.close()
