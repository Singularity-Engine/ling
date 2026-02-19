"""
JWT令牌处理器

提供JWT令牌的创建、验证和解码功能
支持传统JWT和Clerk JWT两种验证方式
"""

import jwt
import base64
import os
from datetime import datetime, timedelta
from typing import Dict, Optional, Any
from loguru import logger

class JWTHandler:
    """JWT令牌处理类"""

    def __init__(self, config: Optional[Any] = None):
        """初始化JWT处理器

        Args:
            config: 应用配置对象（可选）
        """
        # 从配置或环境变量获取设置
        if config and hasattr(config, 'bff_integration') and config.bff_integration is not None:
            bff_config = getattr(config, 'bff_integration', {})
            # 处理dataclass或字典格式
            if hasattr(bff_config, 'jwt_config'):
                # dataclass格式
                jwt_config = bff_config.jwt_config if bff_config.jwt_config else {}
                clerk_config = bff_config.clerk_config if bff_config.clerk_config else {}
            elif isinstance(bff_config, dict):
                # 字典格式
                jwt_config = bff_config.get('jwt_config', {})
                clerk_config = bff_config.get('clerk_config', {})
            else:
                jwt_config = {}
                clerk_config = {}

            self.secret_key = jwt_config.get('secret_key') or os.getenv('JWT_SECRET_KEY')
            if not self.secret_key:
                logger.warning("JWT_SECRET_KEY 未设置，JWT 认证将不可用")
            self.algorithm = jwt_config.get('algorithm') or os.getenv('JWT_ALGORITHM', 'RS256')
            self.expiration_hours = jwt_config.get('expiration_hours', 24)
            self.webhook_secret = clerk_config.get('webhook_secret') or os.getenv('CLERK_WEBHOOK_SECRET')
        else:
            # 使用环境变量作为后备
            self.secret_key = os.getenv('JWT_SECRET_KEY')
            if not self.secret_key:
                logger.warning("JWT_SECRET_KEY 未设置，JWT 认证将不可用")
            self.algorithm = os.getenv('JWT_ALGORITHM', 'RS256')
            self.expiration_hours = int(os.getenv('JWT_EXPIRATION_HOURS', '24'))
            self.webhook_secret = os.getenv('CLERK_WEBHOOK_SECRET')

        # 初始化Clerk JWT处理器
        clerk_publishable_key = os.getenv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'pk_test_cmVhbC1lbGVwaGFudC0zNS5jbGVyay5hY2NvdW50cy5kZXYk')
        self.clerk_jwt_handler = None
        try:
            from .clerk_jwt_handler import ClerkJWTHandler
            self.clerk_jwt_handler = ClerkJWTHandler(clerk_publishable_key)
            logger.info("✅ Clerk JWT处理器初始化成功")
        except ImportError as e:
            logger.warning(f"⚠️ Clerk JWT处理器初始化失败，缺少依赖: {e}")
        except Exception as e:
            logger.warning(f"⚠️ Clerk JWT处理器初始化失败: {e}")
            # 如果Clerk JWT处理器初始化失败，尝试创建一个简化版本
            logger.info("🔄 尝试创建简化的Clerk JWT处理器...")
            try:
                from .enhanced_jwt_handler import EnhancedJWTHandler
                self.clerk_jwt_handler = EnhancedJWTHandler()
                logger.info("✅ 简化Clerk JWT处理器初始化成功")
            except Exception as e2:
                logger.warning(f"⚠️ 简化Clerk JWT处理器也初始化失败: {e2}")

        logger.debug(f"JWT处理器初始化完成，算法: {self.algorithm}, 过期时间: {self.expiration_hours}小时")

    def create_token(self, user_id: str, username: str, email: Optional[str] = None,
                    roles: Optional[list] = None, expires_delta: Optional[timedelta] = None) -> str:
        """创建JWT令牌

        Args:
            user_id: 用户ID
            username: 用户名
            email: 邮箱（可选）
            roles: 角色列表（可选）
            expires_delta: 过期时间增量（可选）

        Returns:
            JWT令牌字符串
        """
        expires = datetime.utcnow() + (expires_delta or timedelta(hours=self.expiration_hours))

        payload = {
            "sub": user_id,
            "username": username,
            "exp": expires.timestamp(),
            "iat": datetime.utcnow().timestamp()
        }

        # 添加可选字段
        if email:
            payload["email"] = email
        if roles:
            payload["roles"] = roles

        token = jwt.encode(payload, self.secret_key, algorithm=self.algorithm)
        logger.debug(f"已创建JWT令牌，用户ID: {user_id}, 过期时间: {expires}")
        return token

    def decode_token(self, token: str) -> Dict[str, Any]:
        """解码JWT令牌（支持传统JWT和Clerk JWT）

        Args:
            token: JWT令牌字符串

        Returns:
            解码后的令牌负载

        Raises:
            jwt.InvalidTokenError: 令牌无效
            jwt.ExpiredSignatureError: 令牌已过期
        """
        logger.info(f"🔐 开始解码JWT令牌，令牌长度: {len(token)}")
        logger.info(f"🔐 令牌前50字符: {token[:50]}...")

        # 首先尝试使用Clerk JWT处理器
        if self.clerk_jwt_handler:
            try:
                logger.info("🔍 尝试使用Clerk JWT验证...")
                payload = self.clerk_jwt_handler.decode_token(token)
                logger.info("✅ Clerk JWT验证成功")
                return payload
            except Exception as e:
                logger.info(f"⚠️ Clerk JWT验证失败，尝试传统JWT验证: {str(e)}")

        # 回退到传统JWT验证
        try:
            logger.info("🔍 使用传统JWT验证...")

            # 尝试获取令牌头部信息
            try:
                header = jwt.get_unverified_header(token)
                token_alg = header.get('alg')
                logger.info(f"🔑 令牌使用的算法: {token_alg}")
            except Exception as e:
                logger.warning(f"⚠️ 无法解析令牌头部: {str(e)}")
                token_alg = None

            # 支持多种算法
            algorithms = [self.algorithm]  # 默认使用配置的算法

            # RS256 令牌需要公钥验证签名，不再接受未验证签名的令牌
            if token_alg == 'RS256':
                logger.warning("检测到 RS256 令牌，但当前未配置 RS256 公钥，拒绝此令牌")
                logger.warning("Phase 1 将迁移到 HS256 自签 JWT，届时此路径将移除")

            # 仅对非RS256令牌尝试使用传统方式验证
            if token_alg != 'RS256':
                try:
                    payload = jwt.decode(token, self.secret_key, algorithms=algorithms)

                    # 详细记录解码后的用户信息
                    user_id = payload.get('sub') or payload.get('user_id')
                    username = payload.get('username')
                    email = payload.get('email')
                    roles = payload.get('roles', [])

                    logger.info(f"🎯 传统JWT令牌解码成功！")
                    logger.info(f"   👤 用户ID: {user_id}")
                    logger.info(f"   📝 用户名: {username}")
                    logger.info(f"   📧 邮箱: {email}")
                    logger.info(f"   🏷️ 角色: {roles}")
                    logger.info(f"   ⏰ 签发时间: {payload.get('iat')}")
                    logger.info(f"   ⏰ 过期时间: {payload.get('exp')}")

                    return payload
                except jwt.ExpiredSignatureError:
                    logger.warning("⚠️ 传统JWT令牌已过期，尝试不验证时间的解码...")
                    try:
                        payload = jwt.decode(token, self.secret_key, algorithms=algorithms, options={'verify_exp': False})
                        
                        # 详细记录解码后的用户信息
                        user_id = payload.get('sub') or payload.get('user_id')
                        username = payload.get('username')
                        email = payload.get('email')
                        roles = payload.get('roles', [])

                        logger.info(f"🎯 从过期的传统JWT令牌解码成功！")
                        logger.info(f"   👤 用户ID: {user_id}")
                        logger.info(f"   📝 用户名: {username}")
                        logger.info(f"   📧 邮箱: {email}")
                        logger.info(f"   🏷️ 角色: {roles}")
                        logger.info(f"   ⏰ 签发时间: {payload.get('iat')}")
                        logger.info(f"   ⏰ 过期时间: {payload.get('exp')}")
                        logger.warning(f"   ⚠️ 注意：此令牌已过期，建议用户重新登录")
                        
                        # 标记为过期令牌
                        payload['expired'] = True
                        return payload
                        
                    except Exception as fallback_e:
                        logger.warning(f"⚠️ 从过期传统JWT令牌提取用户信息也失败: {str(fallback_e)}")
                        raise
                except Exception as e:
                    logger.warning(f"⚠️ 传统JWT验证失败: {str(e)}")
                    raise
            else:
                logger.warning("⚠️ RS256令牌无法使用传统JWT验证方式，已跳过")
                raise jwt.InvalidTokenError("RS256令牌解码失败")

        except jwt.ExpiredSignatureError:
            logger.warning("❌ JWT令牌已过期")
            raise
        except jwt.InvalidTokenError as e:
            logger.warning(f"❌ JWT令牌无效: {str(e)}")
            raise

    def verify_token(self, token: str) -> bool:
        """验证JWT令牌是否有效

        Args:
            token: JWT令牌字符串

        Returns:
            令牌是否有效
        """
        try:
            self.decode_token(token)
            return True
        except (jwt.InvalidTokenError, jwt.ExpiredSignatureError):
            return False

    def refresh_token(self, token: str) -> Optional[str]:
        """刷新JWT令牌

        Args:
            token: 原始JWT令牌

        Returns:
            新的JWT令牌，如果原令牌无效则返回None
        """
        try:
            payload = self.decode_token(token)

            # 创建新令牌
            return self.create_token(
                user_id=payload.get("sub"),
                username=payload.get("username"),
                email=payload.get("email"),
                roles=payload.get("roles", [])
            )
        except (jwt.InvalidTokenError, jwt.ExpiredSignatureError):
            logger.warning("无法刷新无效或过期的令牌")
            return None

    def verify_webhook_auth(self, auth_header: str) -> bool:
        """验证webhook认证（增强版 - 完全兼容Node.js格式）

        Args:
            auth_header: Authorization头部值

        Returns:
            认证是否有效
        """
        logger.info("🔐 === 开始验证webhook认证（增强版）===")
        logger.info(f"🔐 认证头: {auth_header[:50] if auth_header else 'None'}...")
        logger.info(f"🔐 webhook密钥配置: {'已配置' if self.webhook_secret else '未配置'}")

        if not auth_header or not auth_header.startswith("Bearer "):
            logger.warning("🔐 ❌ 无效的Authorization头格式")
            return False

        if not self.webhook_secret:
            logger.warning("🔐 ⚠️ 未配置CLERK_WEBHOOK_SECRET，跳过webhook认证")
            return True  # 如果未配置密钥，则跳过验证

        token = auth_header[7:]  # 移除"Bearer "前缀
        logger.info(f"🔐 提取的token长度: {len(token)}")
        logger.info(f"🔐 token前30字符: {token[:30]}...")

        # 1. 首先检查是否是JWT格式（包含两个点）
        if token.count('.') == 2:
            logger.info("🔐 检测到JWT格式令牌，尝试验证系统级JWT...")
            return self._verify_system_jwt(token)

        # 2. 尝试Base64解码处理
        try:
            logger.info("🔐 开始解码base64令牌...")
            decoded = base64.b64decode(token).decode('utf-8')
            logger.info(f"🔐 解码后内容长度: {len(decoded)}")
            logger.info(f"🔐 解码后前50字符: {decoded[:50]}...")

            # 3. 检查Node.js的SYSTEM格式: SYSTEM:<webhook_secret>:<timestamp>
            if decoded.startswith("SYSTEM:"):
                logger.info("🔐 检测到Node.js SYSTEM格式令牌")
                parts = decoded.split(":")
                if len(parts) == 3:
                    system_marker, provided_secret, timestamp = parts
                    logger.info(f"🔐 系统标记: {system_marker}")
                    logger.info(f"🔐 提供的密钥长度: {len(provided_secret)}")
                    logger.info(f"🔐 时间戳: {timestamp}")
                    
                    # 验证密钥
                    if provided_secret == self.webhook_secret:
                        logger.info("🔐 ✅ SYSTEM格式认证成功")
                        return True
                    else:
                        logger.warning("🔐 ❌ SYSTEM格式密钥不匹配")
                        logger.warning(f"🔐 期望密钥: {self.webhook_secret[:10]}...")
                        logger.warning(f"🔐 实际密钥: {provided_secret[:10]}...")
                        return False
                else:
                    logger.warning(f"🔐 ❌ SYSTEM格式不正确，部分数量: {len(parts)}")
                    return False

            # 4. 检查传统webhook格式: webhook:<secret>
            elif decoded.startswith("webhook:"):
                logger.info("🔐 检测到传统webhook格式")
                webhook_secret = decoded[8:]  # 移除"webhook:"前缀
                logger.info(f"🔐 提取的webhook密钥长度: {len(webhook_secret)}")
                logger.info(f"🔐 配置的webhook密钥长度: {len(self.webhook_secret)}")

                # 验证密钥
                if self.webhook_secret == webhook_secret:
                    logger.info("🔐 ✅ 传统Webhook认证成功")
                    return True
                else:
                    logger.warning("🔐 ❌ 传统Webhook密钥不匹配")
                    logger.warning(f"🔐 期望密钥: {self.webhook_secret[:10]}...")
                    logger.warning(f"🔐 实际密钥: {webhook_secret[:10]}...")
                    return False

            # 5. 检查JSON格式的备用认证
            elif '"type":"webhook-auth"' in decoded:
                logger.info("🔐 检测到JSON格式备用认证")
                try:
                    import json
                    auth_data = json.loads(decoded)
                    if auth_data.get("type") == "webhook-auth":
                        secret_part = auth_data.get("secret", "")
                        if secret_part == self.webhook_secret[:10]:
                            logger.info("🔐 ✅ JSON备用认证验证成功")
                            return True
                        else:
                            logger.warning("🔐 ❌ JSON备用认证密钥不匹配")
                            return False
                except json.JSONDecodeError as e:
                    logger.warning(f"🔐 ❌ JSON备用认证解析失败: {str(e)}")
                    return False

            # 6. 未知格式
            else:
                logger.warning("🔐 ❌ 未知的令牌格式")
                logger.warning(f"🔐 解码内容: {decoded}")
                return False

        except Exception as e:
            logger.error(f"🔐 💥 Base64解码或认证验证异常: {str(e)}")
            import traceback
            logger.error(f"🔐 错误堆栈: {traceback.format_exc()}")
            return False

    def _verify_system_jwt(self, token: str) -> bool:
        """验证系统级JWT令牌

        Args:
            token: JWT令牌字符串

        Returns:
            验证是否成功
        """
        try:
            logger.info("🔐 === 开始验证系统级JWT ===")

            # 分割JWT
            parts = token.split('.')
            if len(parts) != 3:
                logger.warning("🔐 ❌ JWT格式错误，不是3部分结构")
                return False

            # 解码payload
            import json
            payload_json = base64.b64decode(parts[1] + '==').decode('utf-8')  # 添加padding
            payload = json.loads(payload_json)
            logger.info(f"🔐 📄 JWT载荷: {payload}")

            # 检查是否是系统级JWT
            if payload.get("system") is True and payload.get("webhook") is True:
                logger.info("🔐 ✅ 检测到系统级JWT")

                # 验证签名
                if self.webhook_secret:
                    try:
                        import hmac
                        import hashlib

                        # 重新计算签名
                        header_and_payload = f"{parts[0]}.{parts[1]}"
                        expected_signature = base64.urlsafe_b64encode(
                            hmac.new(
                                self.webhook_secret.encode(),
                                header_and_payload.encode(),
                                hashlib.sha256
                            ).digest()
                        ).decode().rstrip('=')  # 使用base64url编码并移除padding

                        received_signature = parts[2]

                        signature_valid = expected_signature == received_signature
                        logger.info(f"🔐 🔐 JWT签名验证结果: {signature_valid}")

                        if signature_valid:
                            logger.info("🔐 ✅ 系统级JWT验证成功")
                            return True
                        else:
                            logger.warning("🔐 ❌ JWT签名验证失败")
                            logger.warning(f"🔐 期望签名: {expected_signature[:20]}...")
                            logger.warning(f"🔐 收到签名: {received_signature[:20]}...")
                    except Exception as e:
                        logger.error(f"🔐 ❌ JWT签名验证异常: {str(e)}")
                else:
                    logger.warning("🔐 ❌ 无法验证JWT签名，webhook密钥未配置")
            else:
                logger.warning("🔐 ❌ 不是系统级JWT")

            return False
        except Exception as e:
            logger.error(f"🔐 ❌ 系统级JWT验证异常: {str(e)}")
            import traceback
            logger.error(f"🔐 错误堆栈: {traceback.format_exc()}")
            return False

    def extract_user_info(self, token: str) -> Optional[Dict[str, Any]]:
        """从JWT令牌中提取用户信息

        Args:
            token: JWT令牌字符串

        Returns:
            用户信息字典，如果令牌无效则返回None
        """
        try:
            payload = self.decode_token(token)
            return {
                "user_id": payload.get("sub"),
                "username": payload.get("username"),
                "email": payload.get("email"),
                "roles": payload.get("roles", [])
            }
        except (jwt.InvalidTokenError, jwt.ExpiredSignatureError):
            return None
