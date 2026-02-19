from pydantic import BaseModel, Field
from typing import Dict, Optional

class MCPToolsConfig(BaseModel):
    """MCP tools configuration"""
    config_file: str = Field(default="enhanced_mcp_config.json", description="MCP tools configuration file path")
    enabled: bool = Field(default=True, description="Whether MCP tools are enabled")

class DeepLXConfig(BaseModel):
    """DeepL X configuration"""
    deeplx_target_lang: str = Field(default="JA", description="Target language for translation")
    deeplx_api_endpoint: str = Field(default="http://localhost:1188/v2/translate", description="DeepL X API endpoint")

class TranslatorConfig(BaseModel):
    """Translator configuration"""
    translate_audio: bool = Field(default=False, description="Whether to translate audio")
    translate_provider: str = Field(default="deeplx", description="Translation provider")
    deeplx: Optional[DeepLXConfig] = Field(default_factory=DeepLXConfig, description="DeepL X configuration")
    tencent: Optional[Dict] = Field(default_factory=dict, description="Tencent configuration")

class PostgresConfig(BaseModel):
    """PostgreSQL configuration"""
    host: str = Field(default="localhost", description="Database host")
    port: int = Field(default=5432, description="Database port")
    user: str = Field(default="postgres", description="Database user")
    password: str = Field(default="", description="Database password")
    database: str = Field(default="vtuber_chat_db", description="Database name")
    min_conn: int = Field(default=1, description="Minimum connections")
    max_conn: int = Field(default=10, description="Maximum connections")
    datacenter_id: int = Field(default=1, description="Datacenter ID for Snowflake")
    worker_id: int = Field(default=1, description="Worker ID for Snowflake")

class RedisConfig(BaseModel):
    """Redis configuration"""
    host: str = Field(default="localhost", description="Redis host")
    port: int = Field(default=6379, description="Redis port")
    password: str = Field(default="", description="Redis password")
    db: int = Field(default=0, description="Redis database number")
    namespace: str = Field(default="vtuber", description="Key namespace prefix")
    socket_timeout: int = Field(default=5, description="Connection timeout")
    decode_responses: bool = Field(default=True, description="Decode responses")

class DatabaseConfig(BaseModel):
    """Database configuration"""
    postgres: PostgresConfig = Field(default_factory=PostgresConfig, description="PostgreSQL configuration")
    redis: RedisConfig = Field(default_factory=RedisConfig, description="Redis configuration")

class TTSPreprocessorConfig(BaseModel):
    """TTS preprocessor configuration"""
    remove_special_char: bool = Field(default=True, description="Remove special characters")
    ignore_brackets: bool = Field(default=True, description="Ignore text in brackets")
    ignore_parentheses: bool = Field(default=True, description="Ignore text in parentheses")
    ignore_asterisks: bool = Field(default=True, description="Ignore text in asterisks")
    ignore_angle_brackets: bool = Field(default=True, description="Ignore text in angle brackets")
    translator_config: Optional[TranslatorConfig] = Field(default_factory=TranslatorConfig, description="Translator configuration")

class SystemConfig(BaseModel):
    """System configuration"""
    conf_version: str = Field(default="v1.1.0-alpha.1", description="Configuration version")
    host: str = Field(default="localhost", description="Server host")
    port: int = Field(default=12393, description="Server port")
    config_alts_dir: str = Field(default="characters", description="Directory for alternative configurations")
    mcp_tool_mode: str = Field(default="langchain", description="MCP tool mode")
    mcp_tools_config: MCPToolsConfig = Field(default_factory=MCPToolsConfig, description="MCP tools configuration")
    tool_prompts: Dict[str, str] = Field(default_factory=dict, description="Tool prompts mapping")
    group_conversation_prompt: str = Field(default="group_conversation_prompt", description="Group conversation prompt")

    class Config:
        extra = "allow"

class CharacterConfig(BaseModel):
    """Character configuration"""
    conf_name: str = Field(..., description="Configuration name")
    conf_uid: str = Field(..., description="Configuration UID")
    live2d_model_name: str = Field(..., description="Live2D model name")
    character_name: str = Field(..., description="Character name")
    avatar: Optional[str] = Field(None, description="Avatar image path")
    human_name: str = Field(default="Human", description="Human name")
    persona_prompt: str = Field(..., description="Persona prompt")
    agent_config: Dict = Field(default_factory=dict, description="Agent configuration")
    asr_config: Dict = Field(default_factory=dict, description="ASR configuration")
    tts_config: Dict = Field(default_factory=dict, description="TTS configuration")
    vad_config: Dict = Field(default_factory=dict, description="VAD configuration")
    tts_preprocessor_config: TTSPreprocessorConfig = Field(default_factory=TTSPreprocessorConfig, description="TTS preprocessor configuration")

    class Config:
        extra = "allow"

class Config(BaseModel):
    """Root configuration"""
    system_config: SystemConfig
    character_config: CharacterConfig
    database_config: Optional[DatabaseConfig] = Field(default_factory=DatabaseConfig, description="Database configuration")

    class Config:
        extra = "allow"

# Export all configuration classes
__all__ = [
    'Config',
    'SystemConfig',
    'CharacterConfig',
    'DatabaseConfig',
    'PostgresConfig',
    'RedisConfig',
    'MCPToolsConfig',
    'TTSPreprocessorConfig',
    'TranslatorConfig',
    'DeepLXConfig',
]

def read_yaml(file_path: str) -> Dict:
    """Read YAML configuration file with environment variable expansion"""
    import yaml
    import os
    import re

    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # 扩展环境变量 ${VAR:-default}
    def expand_env_vars(match):
        var_expr = match.group(1)
        if ':-' in var_expr:
            var_name, default_value = var_expr.split(':-', 1)
            return os.getenv(var_name, default_value)
        else:
            return os.getenv(var_expr, '')

    # 替换 ${VAR:-default} 格式的环境变量
    content = re.sub(r'\$\{([^}]+)\}', expand_env_vars, content)

    return yaml.safe_load(content)

def validate_config(config_data: Dict) -> Config:
    """Validate configuration data"""
    return Config(**config_data)

def get_database_config(config_file_path: str = "conf.yaml") -> DatabaseConfig:
    """Get database configuration from YAML file"""
    import os
    try:
        config_data = read_yaml(config_file_path)
        if 'database_config' in config_data:
            return DatabaseConfig(**config_data['database_config'])
        else:
            # Return default configuration if not found
            return DatabaseConfig()
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"Failed to load database config from {config_file_path}: {e}")
        return DatabaseConfig()