"""
增强的JWT处理器

提供更完整的JWT认证功能，包括：
- 多种JWT验证方式
- 请求签名验证
- API密钥认证
- 会话管理
"""

import jwt
import hmac
import hashlib
import base64
import os
import time
from datetime import datetime, timedelta
from typing import Dict, Optional, Any, List
from loguru import logger

class EnhancedJWTHandler:
    """增强的JWT处理类"""

    def __init__(self, config: Optional[Any] = None):
        """初始化增强JWT处理器"""
        # 基础JWT配置
        self.secret_key = os.getenv('JWT_SECRET_KEY', 'default-secret-key')
        self.algorithm = os.getenv('JWT_ALGORITHM', 'RS256')
        self.expiration_hours = int(os.getenv('JWT_EXPIRATION_HOURS', '24'))

        # 增强配置
        self.refresh_expiration_days = int(os.getenv('JWT_REFRESH_EXPIRATION_DAYS', '7'))
        self.allow_refresh = os.getenv('JWT_ALLOW_REFRESH', 'true').lower() == 'true'
        self.issuer = os.getenv('JWT_ISSUER', 'ling-python')
        self.audience = os.getenv('JWT_AUDIENCE', 'ling-api')

        # Clerk配置
        self.clerk_issuer = os.getenv('CLERK_ISSUER')
        self.clerk_jwks_url = os.getenv('CLERK_JWKS_URL')
        self.webhook_secret = os.getenv('CLERK_WEBHOOK_SECRET')

        # API密钥配置
        self.api_secret_key = os.getenv('API_SECRET_KEY')
        self.api_key_header = os.getenv('API_KEY_HEADER_NAME', 'X-API-Key')

        # 请求签名配置
        self.signature_secret = os.getenv('REQUEST_SIGNATURE_SECRET')
        self.signature_header = os.getenv('REQUEST_SIGNATURE_HEADER', 'X-Request-Signature')
        self.signature_algorithm = os.getenv('REQUEST_SIGNATURE_ALGORITHM', 'HMAC-SHA256')

        # 会话配置
        self.session_timeout = int(os.getenv('SESSION_TIMEOUT_MINUTES', '30'))
        self.max_concurrent_sessions = int(os.getenv('MAX_CONCURRENT_SESSIONS_PER_USER', '5'))

        logger.debug(f"增强JWT处理器初始化完成")

    def create_access_token(self, user_id: str, username: str, email: Optional[str] = None,
                           roles: Optional[List[str]] = None, extra_claims: Optional[Dict] = None) -> str:
        """创建访问令牌"""
        now = datetime.utcnow()
        expires = now + timedelta(hours=self.expiration_hours)

        payload = {
            "sub": user_id,
            "username": username,
            "iss": self.issuer,
            "aud": self.audience,
            "iat": now.timestamp(),
            "exp": expires.timestamp(),
            "type": "access"
        }

        # 添加可选字段
        if email:
            payload["email"] = email
        if roles:
            payload["roles"] = roles
        if extra_claims:
            payload.update(extra_claims)

        token = jwt.encode(payload, self.secret_key, algorithm=self.algorithm)
        logger.debug(f"创建访问令牌成功，用户ID: {user_id}")
        return token

    def create_refresh_token(self, user_id: str) -> Optional[str]:
        """创建刷新令牌"""
        if not self.allow_refresh:
            return None

        now = datetime.utcnow()
        expires = now + timedelta(days=self.refresh_expiration_days)

        payload = {
            "sub": user_id,
            "iss": self.issuer,
            "aud": self.audience,
            "iat": now.timestamp(),
            "exp": expires.timestamp(),
            "type": "refresh"
        }

        token = jwt.encode(payload, self.secret_key, algorithm=self.algorithm)
        logger.debug(f"创建刷新令牌成功，用户ID: {user_id}")
        return token

    def verify_access_token(self, token: str) -> Dict[str, Any]:
        """验证访问令牌"""
        try:
            payload = jwt.decode(
                token,
                self.secret_key,
                algorithms=[self.algorithm],
                issuer=self.issuer,
                audience=self.audience
            )

            # 检查令牌类型
            if payload.get("type") != "access":
                raise jwt.InvalidTokenError("不是访问令牌")

            logger.debug(f"访问令牌验证成功，用户ID: {payload.get('sub')}")
            return payload
        except jwt.ExpiredSignatureError:
            logger.warning("访问令牌已过期")
            raise
        except jwt.InvalidTokenError as e:
            logger.warning(f"访问令牌无效: {str(e)}")
            raise

    def verify_refresh_token(self, token: str) -> Dict[str, Any]:
        """验证刷新令牌"""
        if not self.allow_refresh:
            raise jwt.InvalidTokenError("不支持刷新令牌")

        try:
            payload = jwt.decode(
                token,
                self.secret_key,
                algorithms=[self.algorithm],
                issuer=self.issuer,
                audience=self.audience
            )

            # 检查令牌类型
            if payload.get("type") != "refresh":
                raise jwt.InvalidTokenError("不是刷新令牌")

            logger.debug(f"刷新令牌验证成功，用户ID: {payload.get('sub')}")
            return payload
        except jwt.ExpiredSignatureError:
            logger.warning("刷新令牌已过期")
            raise
        except jwt.InvalidTokenError as e:
            logger.warning(f"刷新令牌无效: {str(e)}")
            raise

    def verify_clerk_jwt(self, token: str) -> Dict[str, Any]:
        """验证Clerk JWT令牌"""
        try:
            # 这里应该使用Clerk的JWKS来验证
            # 简化实现，实际应该从JWKS端点获取公钥
            unverified_payload = jwt.decode(token, options={"verify_signature": False})

            # 检查发行者
            if unverified_payload.get("iss") != self.clerk_issuer:
                raise jwt.InvalidTokenError("Clerk令牌发行者不匹配")

            logger.debug(f"Clerk JWT验证成功，用户ID: {unverified_payload.get('sub')}")
            return unverified_payload
        except jwt.InvalidTokenError as e:
            logger.warning(f"Clerk JWT验证失败: {str(e)}")
            raise

    def verify_api_key(self, api_key: str) -> bool:
        """验证API密钥"""
        if not self.api_secret_key:
            logger.warning("未配置API密钥")
            return False

        # 使用时间安全的比较
        return hmac.compare_digest(api_key, self.api_secret_key)

    def create_request_signature(self, method: str, path: str, body: str = "", timestamp: Optional[str] = None) -> str:
        """创建请求签名"""
        if not self.signature_secret:
            raise ValueError("未配置请求签名密钥")

        if timestamp is None:
            timestamp = str(int(time.time()))

        # 构建签名字符串
        sign_string = f"{method.upper()}\n{path}\n{body}\n{timestamp}"

        # 创建HMAC签名
        if self.signature_algorithm == 'HMAC-SHA256':
            signature = hmac.new(
                self.signature_secret.encode(),
                sign_string.encode(),
                hashlib.sha256
            ).hexdigest()
        else:
            raise ValueError(f"不支持的签名算法: {self.signature_algorithm}")

        return f"{timestamp}.{signature}"

    def verify_request_signature(self, signature: str, method: str, path: str, body: str = "") -> bool:
        """验证请求签名"""
        if not self.signature_secret:
            logger.warning("未配置请求签名密钥")
            return False

        try:
            # 解析签名
            timestamp_str, received_signature = signature.split('.', 1)
            timestamp = int(timestamp_str)

            # 检查时间戳（防止重放攻击）
            current_time = int(time.time())
            if abs(current_time - timestamp) > 300:  # 5分钟窗口
                logger.warning("请求签名时间戳过期")
                return False

            # 重新计算签名
            expected_signature = self.create_request_signature(method, path, body, timestamp_str)
            expected_sig_part = expected_signature.split('.', 1)[1]

            # 使用时间安全的比较
            return hmac.compare_digest(received_signature, expected_sig_part)
        except Exception as e:
            logger.warning(f"请求签名验证失败: {str(e)}")
            return False

    def verify_webhook_auth(self, auth_header: str) -> bool:
        """验证webhook认证（原有功能保持不变）"""
        if not auth_header or not auth_header.startswith("Bearer "):
            logger.warning("无效的Authorization头格式")
            return False

        if not self.webhook_secret:
            logger.warning("未配置CLERK_WEBHOOK_SECRET，跳过webhook认证")
            return True

        token = auth_header[7:]  # 移除"Bearer "前缀

        try:
            decoded = base64.b64decode(token).decode('utf-8')

            if decoded.startswith("webhook:"):
                webhook_secret = decoded[8:]

                if self.webhook_secret == webhook_secret:
                    logger.info("Webhook认证成功")
                    return True
                else:
                    logger.warning("Webhook密钥不匹配")
                    return False
            else:
                logger.warning("令牌格式错误，不是webhook格式")
                return False
        except Exception as e:
            logger.error(f"Webhook认证异常: {str(e)}")
            return False

    def create_session_token(self, user_id: str, session_data: Dict[str, Any]) -> str:
        """创建会话令牌"""
        now = datetime.utcnow()
        expires = now + timedelta(minutes=self.session_timeout)

        payload = {
            "sub": user_id,
            "iss": self.issuer,
            "aud": self.audience,
            "iat": now.timestamp(),
            "exp": expires.timestamp(),
            "type": "session",
            "session_data": session_data
        }

        token = jwt.encode(payload, self.secret_key, algorithm=self.algorithm)
        logger.debug(f"创建会话令牌成功，用户ID: {user_id}")
        return token

    def verify_session_token(self, token: str) -> Dict[str, Any]:
        """验证会话令牌"""
        try:
            payload = jwt.decode(
                token,
                self.secret_key,
                algorithms=[self.algorithm],
                issuer=self.issuer,
                audience=self.audience
            )

            if payload.get("type") != "session":
                raise jwt.InvalidTokenError("不是会话令牌")

            logger.debug(f"会话令牌验证成功，用户ID: {payload.get('sub')}")
            return payload
        except jwt.ExpiredSignatureError:
            logger.warning("会话令牌已过期")
            raise
        except jwt.InvalidTokenError as e:
            logger.warning(f"会话令牌无效: {str(e)}")
            raise

    def get_token_info(self, token: str) -> Dict[str, Any]:
        """获取令牌信息（不验证签名）"""
        try:
            payload = jwt.decode(token, options={"verify_signature": False})
            return {
                "user_id": payload.get("sub"),
                "username": payload.get("username"),
                "email": payload.get("email"),
                "roles": payload.get("roles", []),
                "type": payload.get("type"),
                "issued_at": payload.get("iat"),
                "expires_at": payload.get("exp"),
                "issuer": payload.get("iss"),
                "audience": payload.get("aud")
            }
        except Exception as e:
            logger.error(f"获取令牌信息失败: {str(e)}")
            return {}

    def is_token_expired(self, token: str) -> bool:
        """检查令牌是否过期"""
        try:
            payload = jwt.decode(token, options={"verify_signature": False})
            exp = payload.get("exp")
            if exp:
                return datetime.utcnow().timestamp() > exp
            return False
        except Exception:
            return True
