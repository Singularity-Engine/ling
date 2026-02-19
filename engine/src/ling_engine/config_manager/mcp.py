# config_manager/mcp.py
from pydantic import Field
from typing import ClassVar, Dict
from .i18n import I18nMixin, Description


class MCPToolsConfig(I18nMixin):
    """MCP tools configuration settings."""
    
    config_file: str = Field(default="mcp_tools_config.json", alias="config_file")
    enabled: bool = Field(default=True, alias="enabled")
    
    DESCRIPTIONS: ClassVar[Dict[str, Description]] = {
        "config_file": Description(
            en="Path to MCP tools configuration file",
            zh="MCP工具配置文件路径"
        ),
        "enabled": Description(
            en="Whether MCP tools are enabled",
            zh="是否启用MCP工具"
        ),
    } 