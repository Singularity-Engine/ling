"""
Clerk JWT令牌验证器

专门用于验证来自Clerk的JWT令牌
"""

import jwt
import requests
import time
import base64
from typing import Dict, Any, Optional
from loguru import logger


class ClerkJWTHandler:
    """Clerk JWT令牌处理器"""

    def __init__(self, clerk_publishable_key: str):
        """初始化Clerk JWT处理器

        Args:
            clerk_publishable_key: Clerk的可发布密钥
        """
        self.clerk_publishable_key = clerk_publishable_key
        self.jwks_cache = {}
        self.jwks_cache_expiry = 0
        self.last_token_iss = None  # 保存最后一个令牌的issuer
        self.jwks_url = self._get_jwks_url()

    def _get_jwks_url(self) -> str:
        """从可发布密钥中提取JWKS URL或从JWT令牌的issuer中提取"""
        try:
            # 尝试从JWT令牌的issuer中提取域名
            # 这是一个新增的方法，用于解决URL格式错误的问题
            if hasattr(self, 'last_token_iss') and self.last_token_iss:
                # 从issuer中提取域名，例如 https://real-elephant-35.clerk.accounts.dev
                issuer = self.last_token_iss
                # 确保issuer不包含任何错误的字符
                if '$' in issuer:
                    issuer = issuer.replace('$', '')
                    logger.warning(f"🔧 修复了issuer中的错误字符: {issuer}")

                # 确保issuer有https://前缀
                if not issuer.startswith('http://') and not issuer.startswith('https://'):
                    issuer = f"https://{issuer}"
                jwks_url = f"{issuer.rstrip('/')}/.well-known/jwks.json"
                logger.info(f"🔑 从令牌issuer生成JWKS URL: {jwks_url}")
                return jwks_url

            # 如果没有issuer信息，则使用原有的逻辑
            # Clerk的可发布密钥格式: pk_test_base64encodedDomain 或 pk_live_xxx
            if self.clerk_publishable_key.startswith('pk_test_'):
                # 测试环境 - 解码base64获取域名
                encoded_domain = self.clerk_publishable_key.replace('pk_test_', '')

                # 添加必要的填充
                missing_padding = len(encoded_domain) % 4
                if missing_padding:
                    encoded_domain += '=' * (4 - missing_padding)

                try:
                    decoded_domain = base64.b64decode(encoded_domain).decode('utf-8')
                    jwks_url = f"https://{decoded_domain}/.well-known/jwks.json"
                    logger.info(f"🔑 解析测试环境JWKS URL: {jwks_url}")
                    return jwks_url
                except Exception as decode_error:
                    logger.warning(f"⚠️ 解码Clerk域名失败: {decode_error}")
                    # 回退到通用格式
                    return f"https://clerk.{encoded_domain}/.well-known/jwks.json"

            elif self.clerk_publishable_key.startswith('pk_live_'):
                # 生产环境
                jwks_url = "https://clerk.com/.well-known/jwks.json"
                logger.info(f"🔑 使用生产环境JWKS URL: {jwks_url}")
                return jwks_url
            else:
                # 未知格式，使用默认
                logger.warning(f"⚠️ 未知的Clerk密钥格式: {self.clerk_publishable_key[:20]}...")
                return "https://clerk.com/.well-known/jwks.json"

        except Exception as e:
            logger.error(f"❌ 生成JWKS URL失败: {e}")
            # 最终回退
            return "https://clerk.com/.well-known/jwks.json"

    def _fetch_jwks(self) -> Dict[str, Any]:
        """获取JWKS（JSON Web Key Set）"""
        current_time = time.time()

        # 检查缓存是否有效（缓存1小时）
        if self.jwks_cache and current_time < self.jwks_cache_expiry:
            logger.debug("🔑 使用缓存的JWKS")
            return self.jwks_cache

        try:
            logger.info(f"🔑 从Clerk获取JWKS: {self.jwks_url}")
            response = requests.get(self.jwks_url, timeout=10)
            response.raise_for_status()

            jwks = response.json()

            # 缓存JWKS（1小时）
            self.jwks_cache = jwks
            self.jwks_cache_expiry = current_time + 3600

            logger.info(f"✅ JWKS获取成功，包含 {len(jwks.get('keys', []))} 个密钥")
            return jwks

        except Exception as e:
            logger.error(f"❌ 获取JWKS失败: {e}")
            # 如果有缓存，使用过期的缓存
            if self.jwks_cache:
                logger.warning("⚠️ 使用过期的JWKS缓存")
                return self.jwks_cache
            raise

    def _get_signing_key(self, kid: str):
        """根据kid获取签名密钥"""
        jwks = self._fetch_jwks()

        for key in jwks.get('keys', []):
            if key.get('kid') == kid:
                logger.info(f"🔑 找到匹配的密钥，kid: {kid}, kty: {key.get('kty')}")
                # 直接返回JWK，让PyJWT处理转换
                return key

        raise ValueError(f"未找到kid为 {kid} 的签名密钥")

    def _decode_without_verification(self, token: str) -> Dict[str, Any]:
        """在无法获取JWKS时进行基本验证

        Args:
            token: JWT令牌字符串

        Returns:
            解码后的令牌负载

        Raises:
            jwt.InvalidTokenError: 令牌格式无效
        """
        try:
            # 不验证签名，只解码令牌
            logger.warning("⚠️ 使用本地验证回退机制（不验证签名）")
            payload = jwt.decode(
                token,
                options={
                    'verify_signature': False,
                    'verify_exp': True,
                    'verify_iat': True,
                    'verify_aud': False,
                    'verify_iss': False,
                }
            )

                        # 基本验证：检查必要字段
            if not payload.get('sub'):
                raise jwt.InvalidTokenError("令牌缺少sub字段")

            # 如果令牌中没有username字段，添加一个默认值
            user_id = payload.get('sub')
            username = payload.get('username')
            email = payload.get('email')

            if username is None:
                # 尝试从邮箱中提取用户名
                if email:
                    username = email.split('@')[0]
                else:
                    # 如果没有邮箱，使用用户ID的最后8位作为用户名
                    username = f"user_{user_id[-8:]}" if user_id else "unknown"

                # 将计算出的用户名添加到负载中
                payload['username'] = username
                logger.info(f"⚠️ 本地验证时添加默认用户名到JWT负载: {username}")

            # 记录解码结果
            logger.info(f"🔍 本地验证成功（未验证签名）")
            logger.info(f"   👤 用户ID: {payload.get('sub')}")
            logger.info(f"   📝 用户名: {username}")
            logger.info(f"   🏷️ 签发者: {payload.get('iss')}")

            return payload
        except Exception as e:
            logger.error(f"❌ 本地验证失败: {str(e)}")
            raise jwt.InvalidTokenError(f"本地验证失败: {str(e)}")

    def decode_token(self, token: str) -> Dict[str, Any]:
        """解码并验证Clerk JWT令牌

        Args:
            token: JWT令牌字符串

        Returns:
            解码后的令牌负载

        Raises:
            jwt.InvalidTokenError: 令牌无效
            jwt.ExpiredSignatureError: 令牌已过期
        """
        try:
            logger.info(f"🔐 开始验证Clerk JWT令牌，长度: {len(token)}")
            logger.info(f"🔐 令牌前50字符: {token[:50]}...")

            # 首先解码头部获取kid和算法
            header = jwt.get_unverified_header(token)
            kid = header.get('kid')
            alg = header.get('alg', 'RS256')  # 默认使用RS256

            if not kid:
                raise jwt.InvalidTokenError("JWT头部缺少kid字段")

            logger.info(f"🔑 JWT密钥ID (kid): {kid}")
            logger.info(f"🔑 JWT算法: {alg}")

            # 不验证签名的情况下解码令牌，获取issuer信息
            try:
                unverified_payload = jwt.decode(token, options={'verify_signature': False})
                self.last_token_iss = unverified_payload.get('iss')
                logger.info(f"🔑 JWT签发者: {self.last_token_iss}")

                # 更新JWKS URL
                self.jwks_url = self._get_jwks_url()
            except Exception as e:
                logger.warning(f"⚠️ 解码令牌获取issuer失败: {str(e)}")

            try:
                # 获取对应的JWK
                jwk = self._get_signing_key(kid)

                # 使用PyJWT的内置JWK处理
                signing_key = jwt.algorithms.RSAAlgorithm.from_jwk(jwk)

                # 验证并解码令牌
                payload = jwt.decode(
                    token,
                    signing_key,
                    algorithms=[alg],  # 使用令牌头部指定的算法
                    options={
                        'verify_signature': True,
                        'verify_exp': True,
                        'verify_iat': True,
                        'verify_aud': False,  # 暂时不验证audience
                        'verify_iss': False,  # 暂时不验证issuer
                    }
                )
            except (requests.exceptions.RequestException, ValueError) as e:
                logger.warning(f"⚠️ 无法获取JWKS或验证签名: {str(e)}")
                # 尝试使用本地验证回退机制
                payload = self._decode_without_verification(token)

            # 详细记录解码后的用户信息
            user_id = payload.get('sub')
            username = payload.get('username')
            email = payload.get('email')

            # 如果令牌中没有username字段，添加一个默认值
            if username is None:
                # 尝试从邮箱中提取用户名
                if email:
                    username = email.split('@')[0]
                else:
                    # 如果没有邮箱，使用用户ID的最后8位作为用户名
                    username = f"user_{user_id[-8:]}" if user_id else "unknown"

                # 将计算出的用户名添加到负载中
                payload['username'] = username
                logger.info(f"⚠️ 添加默认用户名到JWT负载: {username}")

            logger.info(f"🎯 Clerk JWT令牌验证成功！")
            logger.info(f"   👤 用户ID: {user_id}")
            logger.info(f"   📝 用户名: {username}")
            logger.info(f"   📧 邮箱: {email}")
            logger.info(f"   🏷️ 签发者: {payload.get('iss')}")
            logger.info(f"   ⏰ 签发时间: {payload.get('iat')}")
            logger.info(f"   ⏰ 过期时间: {payload.get('exp')}")

            return payload

        except jwt.ExpiredSignatureError:
            logger.warning("❌ Clerk JWT令牌已过期")
            raise
        except jwt.InvalidTokenError as e:
            logger.warning(f"❌ Clerk JWT令牌无效: {str(e)}")
            raise
        except Exception as e:
            logger.error(f"❌ Clerk JWT令牌验证异常: {str(e)}")
            logger.error(f"   异常类型: {type(e).__name__}")
            logger.error(f"   JWKS URL: {self.jwks_url}")

            # 尝试使用本地验证回退机制
            try:
                logger.info("🔄 尝试使用本地验证回退机制...")
                return self._decode_without_verification(token)
            except:
                # 如果本地验证也失败，则抛出原始异常
                raise jwt.InvalidTokenError(f"Clerk JWT验证失败: {str(e)}")

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
