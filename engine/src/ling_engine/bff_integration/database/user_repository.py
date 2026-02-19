"""
用户数据访问层

提供用户数据的CRUD操作
"""

from typing import Optional, List
from loguru import logger
import psycopg2
from psycopg2.extras import RealDictCursor

from ..models.user_models import User

class UserRepository:
    """用户数据访问类"""

    def __init__(self, db_manager=None):
        """初始化用户仓库

        Args:
            db_manager: 数据库管理器实例（可选）
        """
        self.db_manager = db_manager
        self._ensure_table_exists()

    def _get_connection(self):
        """获取数据库连接"""
        import os

        if self.db_manager:
            logger.info(f"🔌 UserRepository: 使用数据库管理器获取连接")
            return self.db_manager.get_connection()
        else:
            # 如果没有数据库管理器，使用环境变量或默认配置
            host = os.getenv('POSTGRES_HOST') or os.getenv('DB_HOST', 'localhost')
            port = int(os.getenv('POSTGRES_PORT') or os.getenv('DB_PORT', '5432'))
            database = os.getenv('POSTGRES_DB') or os.getenv('DB_NAME', 'qidian')
            user = os.getenv('POSTGRES_USER') or os.getenv('DB_USER', 'postgres')
            password = os.getenv('POSTGRES_PASSWORD') or os.getenv('DB_PASSWORD', '')

            logger.info(f"🔌 UserRepository: 使用直接连接方式")
            logger.info(f"🔌 UserRepository: 连接信息 - 主机: {host}, 端口: {port}, 数据库: {database}, 用户: {user}")

            try:
                conn = psycopg2.connect(
                    host=host,
                    port=port,
                    database=database,
                    user=user,
                    password=password
                )
                logger.info(f"✅ UserRepository: 数据库连接成功")
                return conn
            except Exception as e:
                logger.error(f"❌ UserRepository: 数据库连接失败: {str(e)}")
                logger.error(f"❌ UserRepository: 异常类型: {type(e).__name__}")
                import traceback
                logger.error(f"❌ UserRepository: 异常堆栈: {traceback.format_exc()}")
                raise

    def _ensure_table_exists(self):
        """确保用户表存在（已由数据库迁移脚本处理，此处仅做检查）"""
        try:
            conn = self._get_connection()
            try:
                with conn.cursor() as cursor:
                    # 检查用户表是否存在（V3迁移脚本应该已经创建了完整表结构）
                    cursor.execute("""
                        SELECT column_name
                        FROM information_schema.columns
                        WHERE table_name = 'users'
                        ORDER BY ordinal_position
                    """)
                    columns = [row[0] for row in cursor.fetchall()]

                    expected_columns = [
                        'id', 'user_id', 'username', 'email', 'first_name', 'last_name',
                        'avatar_url', 'is_active', 'last_login_at', 'created_at', 'updated_at',
                        'clerk_created_at', 'clerk_updated_at', 'roles', 'preferences'
                    ]

                    missing_columns = [col for col in expected_columns if col not in columns]

                    if missing_columns:
                        logger.warning(f"⚠️ UserRepository: 用户表缺少字段: {missing_columns}")
                        logger.warning(f"⚠️ UserRepository: 请确保运行了V3数据库迁移脚本")
                        # 如果表不存在或字段不完整，创建基础表结构
                        if 'id' not in columns:
                            cursor.execute("""
                                CREATE TABLE IF NOT EXISTS users (
                                    id SERIAL PRIMARY KEY,
                                    user_id VARCHAR(255) UNIQUE NOT NULL,
                                    username VARCHAR(255) NOT NULL,
                                    avatar_url TEXT
                                );
                                CREATE INDEX IF NOT EXISTS idx_users_user_id ON users(user_id);
                                CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
                            """)
                            conn.commit()
                            logger.info("✅ UserRepository: 创建了基础用户表结构")
                    else:
                        logger.info("✅ UserRepository: 用户表结构检查完成，包含所有必需字段")

            finally:
                if not self.db_manager:
                    conn.close()

        except Exception as e:
            logger.error(f"检查用户表失败: {str(e)}")
            raise

    def find_by_user_id(self, user_id: str) -> Optional[User]:
        """根据Clerk用户ID查找用户

        Args:
            user_id: Clerk用户ID

        Returns:
            用户对象，如果不存在则返回None
        """
        logger.info(f"🔍 UserRepository: 根据用户ID查找用户: {user_id}")

        if not user_id:
            logger.warning(f"⚠️ UserRepository: 用户ID为空")
            return None

        try:
            logger.info(f"🔌 UserRepository: 正在获取数据库连接...")
            conn = self._get_connection()
            logger.info(f"✅ UserRepository: 数据库连接获取成功")

            try:
                with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                    query = """
                        SELECT id, user_id, username, email, first_name, last_name, avatar_url,
                               is_active, last_login_at, created_at, updated_at,
                               clerk_created_at, clerk_updated_at, roles, preferences
                        FROM users WHERE user_id = %s
                    """
                    logger.info(f"🔍 UserRepository: 执行SQL查询: {query}")
                    logger.info(f"🔍 UserRepository: 参数: {user_id}")

                    cursor.execute(query, (user_id,))
                    row = cursor.fetchone()

                    if row:
                        logger.info(f"✅ UserRepository: 找到用户记录:")
                        logger.info(f"   🆔 ID: {row['id']}")
                        logger.info(f"   👤 用户ID: {row['user_id']}")
                        logger.info(f"   📝 用户名: {row['username']}")
                        logger.info(f"   📧 邮箱: {row['email']}")
                        logger.info(f"   🖼️ 头像URL: {row['avatar_url']}")

                        return User(
                            id=row['id'],
                            user_id=row['user_id'],
                            username=row['username'],
                            email=row['email'],
                            first_name=row['first_name'],
                            last_name=row['last_name'],
                            avatar_url=row['avatar_url'],
                            is_active=row['is_active'],
                            last_login_at=row['last_login_at'],
                            created_at=row['created_at'],
                            updated_at=row['updated_at'],
                            clerk_created_at=row['clerk_created_at'],
                            clerk_updated_at=row['clerk_updated_at'],
                            roles=row['roles'] if row['roles'] else ["USER"],
                            preferences=row['preferences'] if row['preferences'] else {}
                        )
                    else:
                        logger.warning(f"⚠️ UserRepository: 未找到用户记录: {user_id}")
                        return None
            finally:
                if not self.db_manager:
                    logger.info(f"🔌 UserRepository: 关闭数据库连接")
                    conn.close()
        except Exception as e:
            logger.error(f"❌ UserRepository: 查找用户失败: {str(e)}")
            logger.error(f"❌ UserRepository: 异常类型: {type(e).__name__}")
            import traceback
            logger.error(f"❌ UserRepository: 异常堆栈: {traceback.format_exc()}")
            return None

    def find_by_id(self, id: int) -> Optional[User]:
        """根据ID查找用户

        Args:
            id: 用户ID

        Returns:
            用户对象，如果不存在则返回None
        """
        try:
            conn = self._get_connection()
            try:
                with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                    cursor.execute("""
                        SELECT id, user_id, username, email, first_name, last_name, avatar_url,
                               is_active, last_login_at, created_at, updated_at,
                               clerk_created_at, clerk_updated_at, roles, preferences
                        FROM users WHERE id = %s
                    """, (id,))
                    row = cursor.fetchone()

                    if row:
                        return User(
                            id=row['id'],
                            user_id=row['user_id'],
                            username=row['username'],
                            email=row['email'],
                            first_name=row['first_name'],
                            last_name=row['last_name'],
                            avatar_url=row['avatar_url'],
                            is_active=row['is_active'],
                            last_login_at=row['last_login_at'],
                            created_at=row['created_at'],
                            updated_at=row['updated_at'],
                            clerk_created_at=row['clerk_created_at'],
                            clerk_updated_at=row['clerk_updated_at'],
                            roles=row['roles'] if row['roles'] else ["USER"],
                            preferences=row['preferences'] if row['preferences'] else {}
                        )
                    return None
            finally:
                if not self.db_manager:
                    conn.close()
        except Exception as e:
            logger.error(f"根据ID查找用户失败: {str(e)}")
            return None

    def find_by_username(self, username: str) -> Optional[User]:
        """根据用户名查找用户

        Args:
            username: 用户名

        Returns:
            用户对象，如果不存在则返回None
        """
        try:
            conn = self._get_connection()
            try:
                with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                    cursor.execute("""
                        SELECT id, user_id, username, email, first_name, last_name, avatar_url,
                               is_active, last_login_at, created_at, updated_at,
                               clerk_created_at, clerk_updated_at, roles, preferences
                        FROM users WHERE username = %s
                    """, (username,))
                    row = cursor.fetchone()

                    if row:
                        return User(
                            id=row['id'],
                            user_id=row['user_id'],
                            username=row['username'],
                            email=row['email'],
                            first_name=row['first_name'],
                            last_name=row['last_name'],
                            avatar_url=row['avatar_url'],
                            is_active=row['is_active'],
                            last_login_at=row['last_login_at'],
                            created_at=row['created_at'],
                            updated_at=row['updated_at'],
                            clerk_created_at=row['clerk_created_at'],
                            clerk_updated_at=row['clerk_updated_at'],
                            roles=row['roles'] if row['roles'] else ["USER"],
                            preferences=row['preferences'] if row['preferences'] else {}
                        )
                    return None
            finally:
                if not self.db_manager:
                    conn.close()
        except Exception as e:
            logger.error(f"根据用户名查找用户失败: {str(e)}")
            return None

    def create_user(self, user: User) -> User:
        """创建新用户

        Args:
            user: 用户对象

        Returns:
            创建后的用户对象（包含ID）
        """
        try:
            conn = self._get_connection()
            try:
                with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                    import json
                    cursor.execute("""
                        INSERT INTO users (
                            user_id, username, email, first_name, last_name, avatar_url,
                            is_active, last_login_at, clerk_created_at, clerk_updated_at,
                            roles, preferences
                        ) VALUES (
                            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                        ) RETURNING id
                    """, (
                        user.user_id, user.username, user.email, user.first_name, user.last_name,
                        user.avatar_url, user.is_active, user.last_login_at,
                        user.clerk_created_at, user.clerk_updated_at,
                        json.dumps(user.roles) if user.roles else '[]',
                        json.dumps(user.preferences) if user.preferences else '{}'
                    ))
                    result = cursor.fetchone()
                    user.id = result['id']
                    conn.commit()

                logger.info(f"创建用户成功: ID={user.id}, 用户名={user.username}")
                return user
            finally:
                if not self.db_manager:
                    conn.close()
        except Exception as e:
            logger.error(f"创建用户失败: {str(e)}")
            raise

    def update_user(self, user: User) -> bool:
        """更新用户信息

        Args:
            user: 用户对象

        Returns:
            更新是否成功
        """
        try:
            conn = self._get_connection()
            try:
                with conn.cursor() as cursor:
                    import json
                    cursor.execute("""
                        UPDATE users SET
                            username = %s, email = %s, first_name = %s, last_name = %s,
                            avatar_url = %s, is_active = %s, last_login_at = %s,
                            clerk_created_at = %s, clerk_updated_at = %s,
                            roles = %s, preferences = %s
                        WHERE user_id = %s
                    """, (
                        user.username, user.email, user.first_name, user.last_name,
                        user.avatar_url, user.is_active, user.last_login_at,
                        user.clerk_created_at, user.clerk_updated_at,
                        json.dumps(user.roles) if user.roles else '[]',
                        json.dumps(user.preferences) if user.preferences else '{}',
                        user.user_id
                    ))
                    success = cursor.rowcount > 0
                    conn.commit()

                if success:
                    logger.info(f"更新用户成功: ID={user.id}, 用户名={user.username}")
                else:
                    logger.warning(f"更新用户失败: 用户ID={user.user_id} 不存在")

                return success
            finally:
                if not self.db_manager:
                    conn.close()
        except Exception as e:
            logger.error(f"更新用户失败: {str(e)}")
            return False

    def delete_user(self, user_id: str) -> bool:
        """删除用户

        Args:
            user_id: Clerk用户ID

        Returns:
            删除是否成功
        """
        try:
            conn = self._get_connection()
            try:
                with conn.cursor() as cursor:
                    cursor.execute("DELETE FROM users WHERE user_id = %s", (user_id,))
                    success = cursor.rowcount > 0
                    conn.commit()

                if success:
                    logger.info(f"删除用户成功: 用户ID={user_id}")
                else:
                    logger.warning(f"删除用户失败: 用户ID={user_id} 不存在")

                return success
            finally:
                if not self.db_manager:
                    conn.close()
        except Exception as e:
            logger.error(f"删除用户失败: {str(e)}")
            return False

    def find_or_create_user(self, user_id: str, username: str,
                          avatar_url: Optional[str] = None) -> User:
        """查找或创建用户

        Args:
            user_id: Clerk用户ID
            username: 用户名
            avatar_url: 头像URL

        Returns:
            用户对象
        """
        logger.info(f"🗄️ 开始查找或创建用户: {user_id}")
        logger.info(f"🗄️ 用户名: {username}")
        logger.info(f"🗄️ 头像URL: {avatar_url}")

        logger.info(f"🗄️ 查找现有用户...")
        existing_user = self.find_by_user_id(user_id)

        if existing_user:
            logger.info(f"🗄️ ✅ 找到现有用户: ID={existing_user.id}, 用户名={existing_user.username}")
            return existing_user

        logger.info(f"🗄️ 📝 创建新用户对象...")
        new_user = User(
            user_id=user_id,
            username=username,
            avatar_url=avatar_url
        )

        logger.info(f"🗄️ 💾 保存新用户到数据库...")
        created_user = self.create_user(new_user)
        logger.info(f"🗄️ ✅ 新用户创建成功: ID={created_user.id}")
        return created_user

    def list_users(self, limit: int = 100, offset: int = 0) -> List[User]:
        """获取用户列表

        Args:
            limit: 限制数量
            offset: 偏移量

        Returns:
            用户列表
        """
        try:
            conn = self._get_connection()
            try:
                with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                    cursor.execute("""
                        SELECT id, user_id, username, email, first_name, last_name, avatar_url,
                               is_active, last_login_at, created_at, updated_at,
                               clerk_created_at, clerk_updated_at, roles, preferences
                        FROM users ORDER BY id DESC LIMIT %s OFFSET %s
                    """, (limit, offset))
                    rows = cursor.fetchall()

                    return [
                        User(
                            id=row['id'],
                            user_id=row['user_id'],
                            username=row['username'],
                            email=row['email'],
                            first_name=row['first_name'],
                            last_name=row['last_name'],
                            avatar_url=row['avatar_url'],
                            is_active=row['is_active'],
                            last_login_at=row['last_login_at'],
                            created_at=row['created_at'],
                            updated_at=row['updated_at'],
                            clerk_created_at=row['clerk_created_at'],
                            clerk_updated_at=row['clerk_updated_at'],
                            roles=row['roles'] if row['roles'] else ["USER"],
                            preferences=row['preferences'] if row['preferences'] else {}
                        )
                        for row in rows
                    ]
            finally:
                if not self.db_manager:
                    conn.close()
        except Exception as e:
            logger.error(f"获取用户列表失败: {str(e)}")
            return []

    def count_users(self) -> int:
        """获取用户总数

        Returns:
            用户总数
        """
        try:
            conn = self._get_connection()
            try:
                with conn.cursor() as cursor:
                    cursor.execute("SELECT COUNT(*) FROM users")
                    return cursor.fetchone()[0]
            finally:
                if not self.db_manager:
                    conn.close()
        except Exception as e:
            logger.error(f"获取用户总数失败: {str(e)}")
            return 0

    def find_by_email(self, email: str) -> Optional[User]:
        """根据邮箱查找用户

        Args:
            email: 邮箱地址

        Returns:
            用户对象，如果不存在则返回None
        """
        if not email:
            logger.warning(f"⚠️ UserRepository: 邮箱为空")
            return None

        try:
            conn = self._get_connection()
            try:
                with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                    cursor.execute("""
                        SELECT id, user_id, username, email, first_name, last_name, avatar_url,
                               is_active, last_login_at, created_at, updated_at,
                               clerk_created_at, clerk_updated_at, roles, preferences
                        FROM users WHERE email = %s
                    """, (email,))
                    row = cursor.fetchone()

                    if row:
                        logger.info(f"✅ UserRepository: 根据邮箱找到用户: {email}")
                        return User(
                            id=row['id'],
                            user_id=row['user_id'],
                            username=row['username'],
                            email=row['email'],
                            first_name=row['first_name'],
                            last_name=row['last_name'],
                            avatar_url=row['avatar_url'],
                            is_active=row['is_active'],
                            last_login_at=row['last_login_at'],
                            created_at=row['created_at'],
                            updated_at=row['updated_at'],
                            clerk_created_at=row['clerk_created_at'],
                            clerk_updated_at=row['clerk_updated_at'],
                            roles=row['roles'] if row['roles'] else ["USER"],
                            preferences=row['preferences'] if row['preferences'] else {}
                        )
                    else:
                        logger.warning(f"⚠️ UserRepository: 未找到邮箱对应的用户: {email}")
                        return None
            finally:
                if not self.db_manager:
                    conn.close()
        except Exception as e:
            logger.error(f"❌ UserRepository: 根据邮箱查找用户失败: {str(e)}")
            return None

    def update_last_login_time(self, user_id: str) -> bool:
        """更新最后登录时间

        Args:
            user_id: Clerk用户ID

        Returns:
            更新是否成功
        """
        if not user_id:
            logger.warning(f"⚠️ UserRepository: 用户ID为空")
            return False

        try:
            conn = self._get_connection()
            try:
                with conn.cursor() as cursor:
                    cursor.execute("""
                        UPDATE users
                        SET last_login_at = CURRENT_TIMESTAMP
                        WHERE user_id = %s
                    """, (user_id,))
                    success = cursor.rowcount > 0
                    conn.commit()

                    if success:
                        logger.info(f"✅ UserRepository: 更新最后登录时间成功: {user_id}")
                    else:
                        logger.warning(f"⚠️ UserRepository: 用户不存在，无法更新登录时间: {user_id}")

                    return success
            finally:
                if not self.db_manager:
                    conn.close()
        except Exception as e:
            logger.error(f"❌ UserRepository: 更新最后登录时间失败: {str(e)}")
            return False

    def sync_user_from_jwt(self, jwt_claims: dict) -> Optional[User]:
        """从JWT声明同步用户信息到数据库

        Args:
            jwt_claims: JWT声明字典

        Returns:
            同步后的用户对象
        """
        logger.info(f"🔄 UserRepository: 开始从JWT同步用户信息")
        logger.info(f"🔄 JWT Claims: {jwt_claims}")

        try:
            # 提取用户ID
            user_id = jwt_claims.get('sub')
            if not user_id:
                logger.error(f"❌ UserRepository: JWT中缺少用户ID (sub)")
                return None

            # 提取用户名（尝试多个字段）
            username = (jwt_claims.get('username') or
                       jwt_claims.get('preferred_username') or
                       jwt_claims.get('name'))

            # 如果没有用户名，尝试从邮箱提取
            if not username:
                email = jwt_claims.get('email')
                if email and '@' in email:
                    username = email.split('@')[0]
                    logger.info(f"🔄 UserRepository: 从邮箱提取用户名: {username}")
                else:
                    username = user_id  # 最后兜底使用用户ID
                    logger.info(f"🔄 UserRepository: 使用用户ID作为用户名: {username}")

            # 构建用户对象
            user_data = {
                'user_id': user_id,
                'username': username,
                'email': jwt_claims.get('email'),
                'first_name': jwt_claims.get('first_name') or jwt_claims.get('given_name'),
                'last_name': jwt_claims.get('last_name') or jwt_claims.get('family_name'),
                'avatar_url': jwt_claims.get('image_url') or jwt_claims.get('picture'),
                'is_active': True,
                'clerk_created_at': jwt_claims.get('created_at'),
                'clerk_updated_at': jwt_claims.get('updated_at'),
                'roles': ["USER"],  # 默认角色
                'preferences': {}
            }

            logger.info(f"🔄 UserRepository: 构建的用户数据: {user_data}")

            # 检查用户是否已存在
            existing_user = self.find_by_user_id(user_id)

            if existing_user:
                logger.info(f"🔄 UserRepository: 用户已存在，更新信息")
                # 更新现有用户
                for key, value in user_data.items():
                    if key != 'user_id' and value is not None:
                        setattr(existing_user, key, value)

                if self.update_user(existing_user):
                    logger.info(f"✅ UserRepository: 用户信息更新成功")
                    return existing_user
                else:
                    logger.error(f"❌ UserRepository: 用户信息更新失败")
                    return existing_user  # 返回原有用户
            else:
                logger.info(f"🔄 UserRepository: 用户不存在，创建新用户")
                # 创建新用户
                new_user = User(**user_data)
                created_user = self.create_user(new_user)
                logger.info(f"✅ UserRepository: 新用户创建成功")
                return created_user

        except Exception as e:
            logger.error(f"❌ UserRepository: JWT用户同步失败: {str(e)}")
            import traceback
            logger.error(f"❌ UserRepository: 异常堆栈: {traceback.format_exc()}")
            return None
