"""
安全配置管理器

管理所有与安全相关的配置和验证
"""

import os
import secrets
import hashlib
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from loguru import logger

@dataclass
class SecurityConfig:
    """安全配置类"""

    # JWT配置
    jwt_secret_key: str = ""
    jwt_algorithm: str = "RS256"
    jwt_expiration_hours: int = 24
    jwt_refresh_expiration_days: int = 7
    jwt_allow_refresh: bool = True
    jwt_issuer: str = "ling-python"
    jwt_audience: str = "ling-api"

    # Clerk配置
    clerk_issuer: str = ""
    clerk_jwks_url: str = ""
    clerk_webhook_secret: str = ""
    clerk_jwt_template_python: str = "python-api"
    clerk_jwt_template_java: str = "java-mcp"

    # API密钥配置
    api_secret_key: str = ""
    api_key_header_name: str = "X-API-Key"

    # 请求签名配置
    request_signature_secret: str = ""
    request_signature_header: str = "X-Request-Signature"
    request_signature_algorithm: str = "HMAC-SHA256"

    # 会话配置
    session_timeout_minutes: int = 30
    session_cleanup_interval_minutes: int = 60
    max_concurrent_sessions_per_user: int = 5

    # 安全头配置
    security_headers_enabled: bool = True
    csrf_protection_enabled: bool = True
    rate_limiting_enabled: bool = True

    # 速率限制配置
    rate_limit_requests_per_minute: int = 60
    rate_limit_burst_size: int = 10

    # CORS配置
    allowed_origins: List[str] = field(default_factory=lambda: ["http://localhost:3000"])
    allowed_methods: List[str] = field(default_factory=lambda: ["GET", "POST", "PUT", "DELETE", "OPTIONS"])
    allowed_headers: List[str] = field(default_factory=lambda: ["*"])
    allow_credentials: bool = True

    # 信任的代理配置
    trusted_proxies: List[str] = field(default_factory=lambda: ["127.0.0.1", "::1"])
    proxy_headers_enabled: bool = True

    # 加密配置
    data_encryption_key: str = ""
    data_encryption_algorithm: str = "AES-256-GCM"
    password_hash_algorithm: str = "bcrypt"
    password_hash_rounds: int = 12

    # 审计日志配置
    audit_log_enabled: bool = True
    audit_log_level: str = "INFO"
    audit_log_file: str = "logs/audit.log"
    security_log_enabled: bool = True
    security_log_failed_attempts: bool = True
    security_log_suspicious_activity: bool = True

    # 外部服务配置
    node_bff_base_url: str = "http://localhost:3000"
    node_bff_api_key: str = ""
    node_bff_webhook_secret: str = ""
    java_mcp_base_url: str = "http://localhost:8080"
    java_mcp_api_key: str = ""
    java_mcp_webhook_secret: str = ""

    # 开发和调试配置
    debug_auth: bool = False
    skip_auth_in_dev: bool = False
    log_auth_details: bool = False
    test_mode: bool = False

class SecurityConfigManager:
    """安全配置管理器"""

    def __init__(self):
        """初始化安全配置管理器"""
        self.config = self._load_from_env()
        self._validate_config()

    def _load_from_env(self) -> SecurityConfig:
        """从环境变量加载配置"""
        logger.info("从环境变量加载安全配置...")

        # 解析CORS origins
        origins_str = os.getenv('ALLOWED_ORIGINS', 'http://localhost:3000')
        allowed_origins = [origin.strip() for origin in origins_str.split(',')]

        # 解析CORS methods
        methods_str = os.getenv('ALLOWED_METHODS', 'GET,POST,PUT,DELETE,OPTIONS')
        allowed_methods = [method.strip() for method in methods_str.split(',')]

        # 解析CORS headers
        headers_str = os.getenv('ALLOWED_HEADERS', '*')
        allowed_headers = [header.strip() for header in headers_str.split(',')]

        # 解析信任的代理
        proxies_str = os.getenv('TRUSTED_PROXIES', '127.0.0.1,::1')
        trusted_proxies = [proxy.strip() for proxy in proxies_str.split(',')]

        config = SecurityConfig(
            # JWT配置
            jwt_secret_key=os.getenv('JWT_SECRET_KEY', ''),
            jwt_algorithm=os.getenv('JWT_ALGORITHM', 'RS256'),
            jwt_expiration_hours=int(os.getenv('JWT_EXPIRATION_HOURS', '24')),
            jwt_refresh_expiration_days=int(os.getenv('JWT_REFRESH_EXPIRATION_DAYS', '7')),
            jwt_allow_refresh=os.getenv('JWT_ALLOW_REFRESH', 'true').lower() == 'true',
            jwt_issuer=os.getenv('JWT_ISSUER', 'ling-python'),
            jwt_audience=os.getenv('JWT_AUDIENCE', 'ling-api'),

            # Clerk配置
            clerk_issuer=os.getenv('CLERK_ISSUER', ''),
            clerk_jwks_url=os.getenv('CLERK_JWKS_URL', ''),
            clerk_webhook_secret=os.getenv('CLERK_WEBHOOK_SECRET', ''),
            clerk_jwt_template_python=os.getenv('CLERK_JWT_TEMPLATE_PYTHON', 'python-api'),
            clerk_jwt_template_java=os.getenv('CLERK_JWT_TEMPLATE_JAVA', 'java-mcp'),

            # API密钥配置
            api_secret_key=os.getenv('API_SECRET_KEY', ''),
            api_key_header_name=os.getenv('API_KEY_HEADER_NAME', 'X-API-Key'),

            # 请求签名配置
            request_signature_secret=os.getenv('REQUEST_SIGNATURE_SECRET', ''),
            request_signature_header=os.getenv('REQUEST_SIGNATURE_HEADER', 'X-Request-Signature'),
            request_signature_algorithm=os.getenv('REQUEST_SIGNATURE_ALGORITHM', 'HMAC-SHA256'),

            # 会话配置
            session_timeout_minutes=int(os.getenv('SESSION_TIMEOUT_MINUTES', '30')),
            session_cleanup_interval_minutes=int(os.getenv('SESSION_CLEANUP_INTERVAL_MINUTES', '60')),
            max_concurrent_sessions_per_user=int(os.getenv('MAX_CONCURRENT_SESSIONS_PER_USER', '5')),

            # 安全头配置
            security_headers_enabled=os.getenv('SECURITY_HEADERS_ENABLED', 'true').lower() == 'true',
            csrf_protection_enabled=os.getenv('CSRF_PROTECTION_ENABLED', 'true').lower() == 'true',
            rate_limiting_enabled=os.getenv('RATE_LIMITING_ENABLED', 'true').lower() == 'true',

            # 速率限制配置
            rate_limit_requests_per_minute=int(os.getenv('RATE_LIMIT_REQUESTS_PER_MINUTE', '60')),
            rate_limit_burst_size=int(os.getenv('RATE_LIMIT_BURST_SIZE', '10')),

            # CORS配置
            allowed_origins=allowed_origins,
            allowed_methods=allowed_methods,
            allowed_headers=allowed_headers,
            allow_credentials=os.getenv('ALLOW_CREDENTIALS', 'true').lower() == 'true',

            # 信任的代理配置
            trusted_proxies=trusted_proxies,
            proxy_headers_enabled=os.getenv('PROXY_HEADERS_ENABLED', 'true').lower() == 'true',

            # 加密配置
            data_encryption_key=os.getenv('DATA_ENCRYPTION_KEY', ''),
            data_encryption_algorithm=os.getenv('DATA_ENCRYPTION_ALGORITHM', 'AES-256-GCM'),
            password_hash_algorithm=os.getenv('PASSWORD_HASH_ALGORITHM', 'bcrypt'),
            password_hash_rounds=int(os.getenv('PASSWORD_HASH_ROUNDS', '12')),

            # 审计日志配置
            audit_log_enabled=os.getenv('AUDIT_LOG_ENABLED', 'true').lower() == 'true',
            audit_log_level=os.getenv('AUDIT_LOG_LEVEL', 'INFO'),
            audit_log_file=os.getenv('AUDIT_LOG_FILE', 'logs/audit.log'),
            security_log_enabled=os.getenv('SECURITY_LOG_ENABLED', 'true').lower() == 'true',
            security_log_failed_attempts=os.getenv('SECURITY_LOG_FAILED_ATTEMPTS', 'true').lower() == 'true',
            security_log_suspicious_activity=os.getenv('SECURITY_LOG_SUSPICIOUS_ACTIVITY', 'true').lower() == 'true',

            # 外部服务配置
            node_bff_base_url=os.getenv('NODE_BFF_BASE_URL', 'http://localhost:3000'),
            node_bff_api_key=os.getenv('NODE_BFF_API_KEY', ''),
            node_bff_webhook_secret=os.getenv('NODE_BFF_WEBHOOK_SECRET', ''),
            java_mcp_base_url=os.getenv('JAVA_MCP_BASE_URL', 'http://localhost:8080'),
            java_mcp_api_key=os.getenv('JAVA_MCP_API_KEY', ''),
            java_mcp_webhook_secret=os.getenv('JAVA_MCP_WEBHOOK_SECRET', ''),

            # 开发和调试配置
            debug_auth=os.getenv('DEBUG_AUTH', 'false').lower() == 'true',
            skip_auth_in_dev=os.getenv('SKIP_AUTH_IN_DEV', 'false').lower() == 'true',
            log_auth_details=os.getenv('LOG_AUTH_DETAILS', 'false').lower() == 'true',
            test_mode=os.getenv('TEST_MODE', 'false').lower() == 'true',
        )

        logger.info("安全配置加载完成")
        return config

    def _validate_config(self):
        """验证配置"""
        logger.info("验证安全配置...")

        warnings = []
        errors = []

        # 验证JWT密钥
        if not self.config.jwt_secret_key:
            errors.append("JWT_SECRET_KEY 未设置")
        elif len(self.config.jwt_secret_key) < 32:
            warnings.append("JWT_SECRET_KEY 长度过短，建议至少32字符")

        # 验证Clerk配置
        if not self.config.clerk_webhook_secret:
            warnings.append("CLERK_WEBHOOK_SECRET 未设置，webhook认证将被跳过")

        # 验证API密钥
        if not self.config.api_secret_key:
            warnings.append("API_SECRET_KEY 未设置，API密钥认证将不可用")

        # 验证请求签名密钥
        if not self.config.request_signature_secret:
            warnings.append("REQUEST_SIGNATURE_SECRET 未设置，请求签名验证将不可用")

        # 验证加密密钥
        if self.config.data_encryption_key and len(self.config.data_encryption_key) != 32:
            warnings.append("DATA_ENCRYPTION_KEY 长度应为32字符")

        # 验证CORS配置
        if "*" in self.config.allowed_origins and self.config.allow_credentials:
            warnings.append("CORS配置：允许所有源且启用凭据可能存在安全风险")

        # 记录警告和错误
        for warning in warnings:
            logger.warning(f"⚠️ 配置警告: {warning}")

        for error in errors:
            logger.error(f"❌ 配置错误: {error}")

        if errors:
            raise ValueError(f"安全配置验证失败: {errors}")

        logger.info("✅ 安全配置验证通过")

    def generate_secret_key(self, length: int = 32) -> str:
        """生成安全的密钥"""
        return secrets.token_urlsafe(length)

    def get_cors_config(self) -> Dict[str, Any]:
        """获取CORS配置"""
        return {
            "allow_origins": self.config.allowed_origins,
            "allow_methods": self.config.allowed_methods,
            "allow_headers": self.config.allowed_headers,
            "allow_credentials": self.config.allow_credentials
        }

    def get_jwt_config(self) -> Dict[str, Any]:
        """获取JWT配置"""
        return {
            "secret_key": self.config.jwt_secret_key,
            "algorithm": self.config.jwt_algorithm,
            "expiration_hours": self.config.jwt_expiration_hours,
            "refresh_expiration_days": self.config.jwt_refresh_expiration_days,
            "allow_refresh": self.config.jwt_allow_refresh,
            "issuer": self.config.jwt_issuer,
            "audience": self.config.jwt_audience
        }

    def get_clerk_config(self) -> Dict[str, Any]:
        """获取Clerk配置"""
        return {
            "issuer": self.config.clerk_issuer,
            "jwks_url": self.config.clerk_jwks_url,
            "webhook_secret": self.config.clerk_webhook_secret,
            "jwt_template_python": self.config.clerk_jwt_template_python,
            "jwt_template_java": self.config.clerk_jwt_template_java
        }

    def get_rate_limit_config(self) -> Dict[str, Any]:
        """获取速率限制配置"""
        return {
            "enabled": self.config.rate_limiting_enabled,
            "requests_per_minute": self.config.rate_limit_requests_per_minute,
            "burst_size": self.config.rate_limit_burst_size
        }

    def is_development_mode(self) -> bool:
        """检查是否为开发模式"""
        return self.config.debug_auth or self.config.test_mode

    def should_skip_auth(self) -> bool:
        """检查是否应该跳过认证（仅开发模式）"""
        return self.config.skip_auth_in_dev and self.is_development_mode()

    def get_security_headers(self) -> Dict[str, str]:
        """获取安全头"""
        if not self.config.security_headers_enabled:
            return {}

        return {
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "X-XSS-Protection": "1; mode=block",
            "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
            "Referrer-Policy": "strict-origin-when-cross-origin",
            "Content-Security-Policy": "default-src 'self'"
        }

    def hash_password(self, password: str) -> str:
        """哈希密码"""
        if self.config.password_hash_algorithm == "bcrypt":
            import bcrypt
            salt = bcrypt.gensalt(rounds=self.config.password_hash_rounds)
            return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')
        else:
            # 简单的SHA256哈希（不推荐用于生产环境）
            return hashlib.sha256(password.encode('utf-8')).hexdigest()

    def verify_password(self, password: str, hashed: str) -> bool:
        """验证密码"""
        if self.config.password_hash_algorithm == "bcrypt":
            import bcrypt
            return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))
        else:
            # 简单的SHA256验证
            return hashlib.sha256(password.encode('utf-8')).hexdigest() == hashed

    def get_config_summary(self) -> Dict[str, Any]:
        """获取配置摘要（用于调试）"""
        return {
            "jwt_algorithm": self.config.jwt_algorithm,
            "jwt_expiration_hours": self.config.jwt_expiration_hours,
            "jwt_allow_refresh": self.config.jwt_allow_refresh,
            "clerk_configured": bool(self.config.clerk_webhook_secret),
            "api_key_configured": bool(self.config.api_secret_key),
            "signature_configured": bool(self.config.request_signature_secret),
            "cors_origins_count": len(self.config.allowed_origins),
            "rate_limiting_enabled": self.config.rate_limiting_enabled,
            "security_headers_enabled": self.config.security_headers_enabled,
            "audit_log_enabled": self.config.audit_log_enabled,
            "development_mode": self.is_development_mode()
        }

# 全局安全配置管理器实例
security_config_manager = SecurityConfigManager()
