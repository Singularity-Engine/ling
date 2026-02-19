import os
import sys
import atexit
import argparse
import os
from pathlib import Path
import tomli
import uvicorn
from loguru import logger
from upgrade import sync_user_config, select_language
from src.ling_engine.server import WebSocketServer
from src.ling_engine.config_manager import Config, read_yaml, validate_config

os.environ["HF_HOME"] = str(Path(__file__).parent / "models")
os.environ["MODELSCOPE_CACHE"] = str(Path(__file__).parent / "models")


def get_version() -> str:
    with open("pyproject.toml", "rb") as f:
        pyproject = tomli.load(f)
    return pyproject["project"]["version"]


def init_logger(console_log_level: str = "INFO") -> None:
    logger.remove()
    # Console output
    logger.add(
        sys.stderr,
        level=console_log_level,
        format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> | {message}",
        colorize=True,
    )

    # File output
    logger.add(
        "logs/debug_{time:YYYY-MM-DD}.log",
        rotation="10 MB",
        retention="30 days",
        level="DEBUG",
        format="{time:YYYY-MM-DD HH:mm:ss.SSS} | {level: <8} | {name}:{function}:{line} | {message} | {extra}",
        backtrace=True,
        diagnose=True,
    )


def parse_args():
    parser = argparse.ArgumentParser(description="Open-LLM-VTuber Server")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    parser.add_argument(
        "--hf_mirror", action="store_true", help="Use Hugging Face mirror"
    )
    parser.add_argument(
        "--config-dir",
        type=str,
        default=None,
        help="Directory that contains conf.yaml and characters/*.yaml; can also set via env OPEN_LLM_VTUBER_CONFIG_DIR",
    )
    parser.add_argument(
        "--config-file",
        type=str,
        default="conf.yaml",
        help="Config file name or absolute path; resolved against --config-dir or OPEN_LLM_VTUBER_CONFIG_DIR when relative",
    )
    parser.add_argument(
        "--mcp-enabled",
        type=str,
        choices=["true", "false"],
        default=None,
        help="Enable or disable MCP tools globally, overrides config file setting",
    )
    return parser.parse_args()


def init_config():
    # If user config does not exist, copy from template based on system language
    sync_user_config(logger=logger, lang=select_language())


@logger.catch
def run(console_log_level: str):
    init_logger(console_log_level)
    logger.info(f"Open-LLM-VTuber, version v{get_version()}")
    init_config()

    atexit.register(WebSocketServer.clean_cache)

    # Load configurations from yaml file（支持集中化配置目录）
    from src.ling_engine.config_manager.utils import resolve_config_path
    from src.ling_engine.service_context import ServiceContext

    args_local = args  # use parsed args from __main__
    if args_local.config_dir:
        os.environ["OPEN_LLM_VTUBER_CONFIG_DIR"] = args_local.config_dir
        logger.info(f"Using config dir: {args_local.config_dir}")

    # 设置全局MCP开关状态
    if args_local.mcp_enabled is not None:
        mcp_enabled = args_local.mcp_enabled.lower() == "true"
        ServiceContext.set_global_mcp_enabled(mcp_enabled)
        logger.info(f"Setting global MCP enabled state from command line: {mcp_enabled}")

    config_file_path = resolve_config_path(args_local.config_file)
    logger.info(f"Loading config file: {config_file_path}")
    config: Config = validate_config(read_yaml(config_file_path))
    server_config = config.system_config

    # Initialize and run the WebSocket server
    server = WebSocketServer(config=config)
    uvicorn.run(
        app=server.app,
        host=server_config.host,
        port=server_config.port,
        log_level=console_log_level.lower(),
    )


if __name__ == "__main__":
    args = parse_args()
    console_log_level = "DEBUG" if args.verbose else "INFO"
    if args.verbose:
        logger.info("Running in verbose mode")
    else:
        logger.info(
            "Running in standard mode. For detailed debug logs, use: uv run run_server.py --verbose"
        )
    if args.hf_mirror:
        os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"
    run(console_log_level=console_log_level)
