#!/usr/bin/env python3
"""
BFF通信鉴权配置检查工具

该工具帮助用户检查和生成BFF通信鉴权所需的配置
"""

import os
import sys
import secrets
import base64
from pathlib import Path
from typing import Dict, List, Tuple
from loguru import logger

# 加载.env文件
try:
    from dotenv import load_dotenv
    load_dotenv()
    logger.debug("✅ .env文件加载成功")
except ImportError:
    logger.warning("⚠️ python-dotenv未安装，无法自动加载.env文件")
except Exception as e:
    logger.warning(f"⚠️ 加载.env文件失败: {str(e)}")

class AuthConfigChecker:
    """认证配置检查器"""

    def __init__(self):
        """初始化配置检查器"""
        self.required_configs = {
            # 基础配置
            "BFF_INTEGRATION_ENABLED": {
                "description": "是否启用BFF集成功能",
                "default": "true",
                "required": True,
                "type": "boolean"
            },

            # JWT配置
            "JWT_SECRET_KEY": {
                "description": "JWT签名密钥（生产环境必须设置强密钥）",
                "default": None,
                "required": True,
                "type": "secret",
                "min_length": 32
            },
            "JWT_ALGORITHM": {
                "description": "JWT签名算法",
                "default": "RS256",
                "required": False,
                "type": "string"
            },
            "JWT_EXPIRATION_HOURS": {
                "description": "JWT令牌过期时间（小时）",
                "default": "24",
                "required": False,
                "type": "integer"
            },

            # Clerk配置
            "CLERK_ISSUER": {
                "description": "Clerk认证服务发行者URL",
                "default": None,
                "required": True,
                "type": "url"
            },
            "CLERK_JWKS_URL": {
                "description": "Clerk JWKS端点URL",
                "default": None,
                "required": True,
                "type": "url"
            },
            "CLERK_WEBHOOK_SECRET": {
                "description": "Clerk Webhook密钥",
                "default": None,
                "required": True,
                "type": "secret"
            },

            # 数据库配置
            "DB_HOST": {
                "description": "数据库主机地址",
                "default": "localhost",
                "required": True,
                "type": "string"
            },
            "DB_PORT": {
                "description": "数据库端口",
                "default": "5432",
                "required": False,
                "type": "integer"
            },
            "DB_NAME": {
                "description": "数据库名称",
                "default": "mcp_streaming_call",
                "required": True,
                "type": "string"
            },
            "DB_USER": {
                "description": "数据库用户名",
                "default": "postgres",
                "required": True,
                "type": "string"
            },
            "DB_PASSWORD": {
                "description": "数据库密码",
                "default": None,
                "required": True,
                "type": "secret"
            },
        }

        self.optional_configs = {
            # 增强JWT配置
            "JWT_REFRESH_EXPIRATION_DAYS": {
                "description": "JWT刷新令牌过期时间（天）",
                "default": "7",
                "type": "integer"
            },
            "JWT_ALLOW_REFRESH": {
                "description": "是否允许刷新令牌",
                "default": "true",
                "type": "boolean"
            },
            "JWT_ISSUER": {
                "description": "JWT发行者标识",
                "default": "ling-python",
                "type": "string"
            },
            "JWT_AUDIENCE": {
                "description": "JWT受众标识",
                "default": "ling-api",
                "type": "string"
            },

            # API密钥配置
            "API_SECRET_KEY": {
                "description": "API密钥（用于服务间通信）",
                "default": None,
                "type": "secret"
            },
            "API_KEY_HEADER_NAME": {
                "description": "API密钥请求头名称",
                "default": "X-API-Key",
                "type": "string"
            },

            # 请求签名配置
            "REQUEST_SIGNATURE_SECRET": {
                "description": "请求签名密钥",
                "default": None,
                "type": "secret"
            },
            "REQUEST_SIGNATURE_HEADER": {
                "description": "请求签名头名称",
                "default": "X-Request-Signature",
                "type": "string"
            },

            # 安全配置
            "RATE_LIMIT_REQUESTS_PER_MINUTE": {
                "description": "每分钟请求限制",
                "default": "60",
                "type": "integer"
            },
            "SESSION_TIMEOUT_MINUTES": {
                "description": "会话超时时间（分钟）",
                "default": "30",
                "type": "integer"
            },

            # CORS配置
            "ALLOWED_ORIGINS": {
                "description": "允许的跨域源",
                "default": "http://localhost:3000",
                "type": "string"
            },

            # 外部服务配置
            "NODE_BFF_BASE_URL": {
                "description": "Node端BFF网关基础URL",
                "default": "http://localhost:3000",
                "type": "url"
            },
            "JAVA_MCP_BASE_URL": {
                "description": "Java端MCP服务基础URL",
                "default": "http://localhost:8080",
                "type": "url"
            },
        }

    def check_current_config(self) -> Tuple[Dict[str, str], List[str], List[str]]:
        """检查当前配置"""
        logger.info("🔍 检查当前环境变量配置...")

        current_config = {}
        missing_required = []
        warnings = []

        # 检查必需配置
        for key, config in self.required_configs.items():
            value = os.getenv(key)
            current_config[key] = value

            if not value and config["required"]:
                missing_required.append(key)
            elif value and config.get("min_length"):
                if len(value) < config["min_length"]:
                    warnings.append(f"{key} 长度过短，建议至少 {config['min_length']} 字符")

        # 检查可选配置
        for key, config in self.optional_configs.items():
            value = os.getenv(key)
            current_config[key] = value

        return current_config, missing_required, warnings

    def generate_secrets(self) -> Dict[str, str]:
        """生成安全密钥"""
        logger.info("🔐 生成安全密钥...")

        secrets_dict = {}

        # 生成JWT密钥
        secrets_dict["JWT_SECRET_KEY"] = secrets.token_urlsafe(48)

        # 生成API密钥
        secrets_dict["API_SECRET_KEY"] = secrets.token_urlsafe(32)

        # 生成请求签名密钥
        secrets_dict["REQUEST_SIGNATURE_SECRET"] = secrets.token_urlsafe(32)

        # 生成数据加密密钥
        secrets_dict["DATA_ENCRYPTION_KEY"] = secrets.token_urlsafe(32)

        # 生成webhook密钥（如果需要）
        secrets_dict["NODE_BFF_WEBHOOK_SECRET"] = secrets.token_urlsafe(32)
        secrets_dict["JAVA_MCP_WEBHOOK_SECRET"] = secrets.token_urlsafe(32)

        return secrets_dict

    def create_env_template(self, include_secrets: bool = True) -> str:
        """创建.env模板"""
        logger.info("📝 创建.env配置模板...")

        template_lines = [
            "# ================================",
            "# BFF通信鉴权配置",
            "# ================================",
            "",
        ]

        # 生成密钥
        generated_secrets = self.generate_secrets() if include_secrets else {}

        # 添加必需配置
        template_lines.extend([
            "# 基础BFF集成配置",
            "BFF_INTEGRATION_ENABLED=true",
            "",
            "# JWT鉴权配置",
        ])

        for key, config in self.required_configs.items():
            if key.startswith("JWT_"):
                if key == "JWT_SECRET_KEY" and include_secrets:
                    template_lines.append(f"{key}={generated_secrets.get(key, 'your-jwt-secret-key')}")
                else:
                    default_value = config.get("default", "")
                    template_lines.append(f"{key}={default_value}")
                template_lines.append(f"# {config['description']}")
                template_lines.append("")

        # 添加Clerk配置
        template_lines.extend([
            "# Clerk认证配置",
        ])

        for key, config in self.required_configs.items():
            if key.startswith("CLERK_"):
                if key == "CLERK_WEBHOOK_SECRET":
                    template_lines.append(f"{key}=whsec_your_clerk_webhook_secret_here")
                else:
                    template_lines.append(f"{key}=")
                template_lines.append(f"# {config['description']}")
                template_lines.append("")

        # 添加数据库配置
        template_lines.extend([
            "# 数据库配置",
        ])

        for key, config in self.required_configs.items():
            if key.startswith("DB_"):
                default_value = config.get("default", "")
                template_lines.append(f"{key}={default_value}")
                template_lines.append(f"# {config['description']}")
                template_lines.append("")

        # 添加可选配置
        template_lines.extend([
            "# ================================",
            "# 可选的增强配置",
            "# ================================",
            "",
        ])

        current_section = ""
        for key, config in self.optional_configs.items():
            # 确定配置段
            if key.startswith("JWT_") and current_section != "JWT":
                template_lines.extend(["# 增强JWT配置"])
                current_section = "JWT"
            elif key.startswith("API_") and current_section != "API":
                template_lines.extend(["# API密钥配置"])
                current_section = "API"
            elif key.startswith("REQUEST_") and current_section != "REQUEST":
                template_lines.extend(["# 请求签名配置"])
                current_section = "REQUEST"
            elif key.startswith("RATE_") and current_section != "SECURITY":
                template_lines.extend(["# 安全配置"])
                current_section = "SECURITY"
            elif key.startswith("ALLOWED_") and current_section != "CORS":
                template_lines.extend(["# CORS配置"])
                current_section = "CORS"
            elif (key.startswith("NODE_") or key.startswith("JAVA_")) and current_section != "EXTERNAL":
                template_lines.extend(["# 外部服务配置"])
                current_section = "EXTERNAL"

            # 添加配置项
            if config["type"] == "secret" and include_secrets and key in generated_secrets:
                template_lines.append(f"# {key}={generated_secrets[key]}")
            else:
                default_value = config.get("default", "")
                template_lines.append(f"# {key}={default_value}")
            template_lines.append(f"# {config['description']}")
            template_lines.append("")

        return "\n".join(template_lines)

    def print_config_status(self):
        """打印配置状态"""
        current_config, missing_required, warnings = self.check_current_config()

        logger.info("📊 当前配置状态:")
        logger.info("=" * 50)

        # 显示必需配置状态
        logger.info("🔴 必需配置:")
        for key, config in self.required_configs.items():
            value = current_config.get(key)
            if value:
                if config["type"] == "secret":
                    display_value = f"{value[:8]}..." if len(value) > 8 else "***"
                else:
                    display_value = value
                logger.info(f"  ✅ {key}: {display_value}")
            else:
                logger.info(f"  ❌ {key}: 未设置")

        # 显示可选配置状态
        logger.info("")
        logger.info("🟡 可选配置:")
        for key, config in self.optional_configs.items():
            value = current_config.get(key)
            if value:
                if config["type"] == "secret":
                    display_value = f"{value[:8]}..." if len(value) > 8 else "***"
                else:
                    display_value = value
                logger.info(f"  ✅ {key}: {display_value}")
            else:
                logger.info(f"  ⚪ {key}: 未设置（使用默认值）")

        # 显示缺失的必需配置
        if missing_required:
            logger.info("")
            logger.error("❌ 缺失的必需配置:")
            for key in missing_required:
                config = self.required_configs[key]
                logger.error(f"  - {key}: {config['description']}")

        # 显示警告
        if warnings:
            logger.info("")
            logger.warning("⚠️ 配置警告:")
            for warning in warnings:
                logger.warning(f"  - {warning}")

        # 显示总结
        logger.info("")
        total_required = len(self.required_configs)
        configured_required = total_required - len(missing_required)

        if missing_required:
            logger.error(f"🎯 配置完成度: {configured_required}/{total_required} ({configured_required/total_required*100:.1f}%)")
            logger.error("❌ 配置不完整，请设置缺失的必需配置")
        else:
            logger.info(f"🎯 配置完成度: {configured_required}/{total_required} (100%)")
            logger.info("✅ 所有必需配置都已设置")

    def save_env_template(self, filename: str = ".env.auth.template", include_secrets: bool = True):
        """保存.env模板到文件"""
        template_content = self.create_env_template(include_secrets)

        with open(filename, 'w', encoding='utf-8') as f:
            f.write(template_content)

        logger.info(f"📁 .env模板已保存到: {filename}")

        if include_secrets:
            logger.warning("⚠️ 模板包含生成的密钥，请妥善保管")

        logger.info("💡 使用方法:")
        logger.info(f"  1. 复制模板: cp {filename} .env")
        logger.info("  2. 编辑.env文件，设置您的实际配置值")
        logger.info("  3. 重新运行此工具检查配置")

def main():
    """主函数"""
    logger.info("🔐 BFF通信鉴权配置检查工具")
    logger.info("=" * 50)

    checker = AuthConfigChecker()

    # 检查当前配置
    checker.print_config_status()

    # 询问是否生成模板
    logger.info("")
    logger.info("🛠️ 可用操作:")
    logger.info("  1. 生成.env配置模板（包含生成的密钥）")
    logger.info("  2. 生成.env配置模板（不包含密钥）")
    logger.info("  3. 仅显示配置状态")

    try:
        choice = input("\n请选择操作 (1/2/3，默认3): ").strip()

        if choice == "1":
            checker.save_env_template(".env.auth.template", include_secrets=True)
        elif choice == "2":
            checker.save_env_template(".env.auth.template", include_secrets=False)
        else:
            logger.info("✅ 配置检查完成")
    except KeyboardInterrupt:
        logger.info("\n👋 用户取消操作")
    except Exception as e:
        logger.error(f"❌ 操作失败: {str(e)}")

if __name__ == "__main__":
    # 设置日志
    logger.remove()
    logger.add(
        sys.stdout,
        level="INFO",
        format="<green>{time:HH:mm:ss}</green> | <level>{level: <8}</level> | {message}",
        colorize=True
    )

    main()
