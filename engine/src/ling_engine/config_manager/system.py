# config_manager/system.py
from pydantic import Field, model_validator
from typing import Dict, ClassVar, Literal
from .i18n import I18nMixin, Description
from .mcp import MCPToolsConfig


class SystemConfig(I18nMixin):
    """System configuration settings."""

    conf_version: str = Field(..., alias="conf_version")
    host: str = Field(..., alias="host")
    port: int = Field(..., alias="port")
    config_alts_dir: str = Field(..., alias="config_alts_dir")
    tool_prompts: Dict[str, str] = Field(..., alias="tool_prompts")
    mcp_tool_mode: Literal["native", "langchain", "enhanced"] = Field(default="langchain", alias="mcp_tool_mode")
    mcp_tools_config: MCPToolsConfig = Field(default_factory=MCPToolsConfig, alias="mcp_tools_config")
    group_conversation_prompt: str = Field(default="group_conversation_prompt", alias="group_conversation_prompt")

    DESCRIPTIONS: ClassVar[Dict[str, Description]] = {
        "conf_version": Description(en="Configuration version", zh="配置文件版本"),
        "host": Description(en="Server host address", zh="服务器主机地址"),
        "port": Description(en="Server port number", zh="服务器端口号"),
        "config_alts_dir": Description(
            en="Directory for alternative configurations", zh="备用配置目录"
        ),
        "tool_prompts": Description(
            en="Tool prompts to be inserted into persona prompt",
            zh="要插入到角色提示词中的工具提示词",
        ),
        "mcp_tool_mode": Description(
            en="MCP tool calling mode (native, langchain, or enhanced)",
            zh="MCP工具调用模式（原生、Langchain或增强型）"
        ),
        "mcp_tools_config": Description(
            en="MCP tools configuration",
            zh="MCP工具配置"
        ),
        "group_conversation_prompt": Description(
            en="Group conversation prompt",
            zh="群聊对话提示"
        ),
    }

    @model_validator(mode="after")
    def check_port(self):
        if self.port < 0 or self.port > 65535:
            raise ValueError("Port must be between 0 and 65535")
        return self
