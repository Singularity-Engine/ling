# config_manager/utils.py
import yaml
from pathlib import Path
from typing import Union, Dict, Any, TypeVar
from pydantic import BaseModel, ValidationError
import os
import re
import chardet
from loguru import logger

from .main import Config

T = TypeVar("T", bound=BaseModel)


def get_config_dir() -> str:
    """
    获取配置目录。

    优先级：
    1. 环境变量 LING_ENGINE_CONFIG_DIR
    2. 当前工作目录
    """
    env_dir = os.getenv("LING_ENGINE_CONFIG_DIR")
    if env_dir and os.path.isdir(env_dir):
        return os.path.abspath(env_dir)

    # 零命令行：自动探测根目录下的 config/ 作为集中化配置目录
    cwd = os.getcwd()
    default_config_dir = os.path.join(cwd, "config")
    default_conf = os.path.join(default_config_dir, "conf.yaml")
    if os.path.isdir(default_config_dir) and os.path.exists(default_conf):
        return os.path.abspath(default_config_dir)

    return cwd


def resolve_config_path(relative_or_abs_path: str) -> str:
    """
    解析配置文件路径：
    - 若传入绝对路径，直接返回
    - 若为相对路径，则基于配置目录进行拼接
    """
    if os.path.isabs(relative_or_abs_path):
        return relative_or_abs_path
    base_dir = get_config_dir()
    return os.path.abspath(os.path.join(base_dir, relative_or_abs_path))


def read_yaml(config_path: str) -> Dict[str, Any]:
    """
    Read the specified YAML configuration file with environment variable substitution
    and guess encoding. Return the configuration data as a dictionary.

    Args:
        config_path: Path to the YAML configuration file.

    Returns:
        Configuration data as a dictionary.

    Raises:
        FileNotFoundError: If the configuration file is not found.
        IOError: If the configuration file cannot be read.
    """

    # 支持在集中化配置目录中查找
    config_path = resolve_config_path(config_path)

    if not os.path.exists(config_path):
        raise FileNotFoundError(f"Configuration file not found: {config_path}")

    content = load_text_file_with_guess_encoding(config_path)
    if not content:
        raise IOError(f"Failed to read configuration file: {config_path}")

    # Replace environment variables with support for default values
    # Pattern supports ${VAR}, ${VAR:default_value} and ${VAR:-default_value} formats
    pattern = re.compile(r"\$\{(\w+)(?:(:-?)([^}]*))?\}")

    def replacer(match):
        env_var = match.group(1)
        separator = match.group(2) if match.group(2) is not None else ""
        default_value = match.group(3) if match.group(3) is not None else ""

        # If no separator found, return original match if env var not set
        if not separator:
            return os.getenv(env_var, match.group(0))
        else:
            # Both : and :- separators are supported for default values
            return os.getenv(env_var, default_value)

    content = pattern.sub(replacer, content)

    try:
        return yaml.safe_load(content)
    except yaml.YAMLError as e:
        logger.critical(f"Error parsing YAML file: {e}")
        raise e


def validate_config(config_data: dict) -> Config:
    """
    Validate configuration data against the Config model.

    Args:
        config_data: Configuration data to validate.

    Returns:
        Validated Config object.

    Raises:
        ValidationError: If the configuration fails validation.
    """
    try:
        return Config(**config_data)
    except ValidationError as e:
        logger.critical(f"Error validating configuration: {e}")
        logger.error("Configuration data:")
        logger.error(config_data)
        raise e


def load_text_file_with_guess_encoding(file_path: str) -> str | None:
    """
    Load a text file with guessed encoding.

    Parameters:
    - file_path (str): The path to the text file.

    Returns:
    - str: The content of the text file or None if an error occurred.
    """
    encodings = ["utf-8", "utf-8-sig", "gbk", "gb2312", "ascii", "cp936"]

    for encoding in encodings:
        try:
            with open(file_path, "r", encoding=encoding) as file:
                return file.read()
        except UnicodeDecodeError:
            continue
    # If common encodings fail, try chardet to guess the encoding
    try:
        with open(file_path, "rb") as file:
            raw_data = file.read()
        detected = chardet.detect(raw_data)
        if detected["encoding"]:
            return raw_data.decode(detected["encoding"])
    except Exception as e:
        logger.error(f"Error detecting encoding for config file {file_path}: {e}")
    return None


def save_config(config: BaseModel, config_path: Union[str, Path]):
    """
    Saves a Pydantic model to a YAML configuration file.

    Args:
        config: The Pydantic model to save.
        config_path: Path to the YAML configuration file.
    """
    config_file = Path(config_path)
    config_data = config.model_dump(
        by_alias=True, exclude_unset=True, exclude_none=True
    )

    try:
        with open(config_file, "w", encoding="utf-8") as f:
            yaml.dump(config_data, f, allow_unicode=True)
    except yaml.YAMLError as e:
        raise yaml.YAMLError(f"Error writing YAML file: {e}")


def scan_config_alts_directory(config_alts_dir: str) -> list[dict]:
    """
    Scan the config_alts directory and return a list of config information.
    Each config info contains the filename and its display name from the config.

    Parameters:
    - config_alts_dir (str): The path to the config_alts directory.

    Returns:
    - list[dict]: A list of dicts containing config info:
        - filename: The actual config file name
        - name: Display name from config, falls back to filename if not specified
    """
    config_files = []

    # Add default config first（从集中化配置目录读取）
    default_config = read_yaml("conf.yaml")
    config_files.append(
        {
            "filename": "conf.yaml",
            "name": default_config.get("character_config", {}).get(
                "conf_name", "conf.yaml"
            )
            if default_config
            else "conf.yaml",
        }
    )

    # Scan other configs（在集中化配置目录内的备用配置目录下扫描）
    alt_dir_abs = resolve_config_path(config_alts_dir)
    for root, _, files in os.walk(alt_dir_abs):
        for file in files:
            if file.endswith(".yaml"):
                # root 已是绝对路径，转相对配置目录路径以复用 read_yaml 的目录解析
                abs_path = os.path.join(root, file)
                config: dict = read_yaml(abs_path)
                config_files.append(
                    {
                        # 对外仅暴露文件名，避免泄露绝对路径
                        "filename": file,
                        "name": config.get("character_config", {}).get(
                            "conf_name", file
                        )
                        if config
                        else file,
                    }
                )
    logger.debug(f"Found config files: {config_files}")
    return config_files


def scan_bg_directory() -> list[str]:
    bg_files = []
    bg_dir = "backgrounds"
    for root, _, files in os.walk(bg_dir):
        for file in files:
            if file.endswith((".jpg", ".jpeg", ".png", ".gif")):
                bg_files.append(file)
    return bg_files


def get_database_config() -> dict:
    """
    获取数据库配置信息。

    Returns:
        dict: 包含数据库配置的字典
    """
    try:
        config_data = read_yaml("conf.yaml")
        return config_data.get("database_config", {})
    except Exception as e:
        logger.error(f"Failed to load database config: {e}")
        # 返回默认配置
        return {
            "postgres": {
                "host": os.environ.get('POSTGRES_HOST', 'localhost'),
                "port": int(os.environ.get('POSTGRES_PORT', 5432)),
                "user": os.environ.get('POSTGRES_USER', 'postgres'),
                "password": os.environ.get('POSTGRES_PASSWORD', ''),
                "database": os.environ.get('POSTGRES_DB', 'vtuber_chat_db'),
                "min_conn": int(os.environ.get('POSTGRES_MIN_CONN', 1)),
                "max_conn": int(os.environ.get('POSTGRES_MAX_CONN', 10)),
                "datacenter_id": int(os.environ.get('POSTGRES_DATACENTER_ID', 1)),
                "worker_id": int(os.environ.get('POSTGRES_WORKER_ID', 1))
            },
            "redis": {
                "host": os.environ.get('REDIS_HOST', 'localhost'),
                "port": int(os.environ.get('REDIS_PORT', 6379)),
                "password": os.environ.get('REDIS_PASSWORD', ''),
                "db": int(os.environ.get('REDIS_DB', 0))
            }
        }
