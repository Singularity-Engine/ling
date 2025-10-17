# config_manager/main.py
from pydantic import BaseModel, Field
from typing import Dict, ClassVar, Optional
from dataclasses import dataclass, field

from .system import SystemConfig
from .character import CharacterConfig
from .i18n import I18nMixin, Description


@dataclass
class BFFIntegrationConfig:
    """BFF集成配置"""
    enabled: bool = False
    jwt_config: dict = field(default_factory=lambda: {
        'secret_key': 'your-jwt-secret-key',
        'algorithm': 'RS256',
        'expiration_hours': 24
    })
    clerk_config: dict = field(default_factory=lambda: {
        'issuer': '',
        'jwks_url': '',
        'webhook_secret': ''
    })
    cors_config: dict = field(default_factory=lambda: {
        'allowed_origins': ['http://localhost:3000'],
        'allowed_methods': ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        'allowed_headers': ['*'],
        'allow_credentials': True
    })
    api_config: dict = field(default_factory=lambda: {
        'prefix': '/api/bff',
        'auth_prefix': '/api/auth'
    })


class Config(I18nMixin, BaseModel):
    """
    Main configuration for the application.
    """

    system_config: SystemConfig = Field(default=None, alias="system_config")
    character_config: CharacterConfig = Field(..., alias="character_config")
    bff_integration: Optional[BFFIntegrationConfig] = Field(default=None, alias="bff_integration")

    DESCRIPTIONS: ClassVar[Dict[str, Description]] = {
        "system_config": Description(
            en="System configuration settings", zh="系统配置设置"
        ),
        "character_config": Description(
            en="Character configuration settings", zh="角色配置设置"
        ),
        "bff_integration": Description(
            en="BFF integration configuration settings", zh="BFF集成配置设置"
        ),
    }
