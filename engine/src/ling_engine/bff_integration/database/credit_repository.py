"""
用户积分数据访问层

提供用户积分的CRUD操作和消耗逻辑
"""

from typing import Optional, Dict, Any, List
from loguru import logger
import psycopg2
from psycopg2.extras import RealDictCursor
from decimal import Decimal


class CreditRepository:
    """用户积分数据访问类"""

    def __init__(self, db_manager=None):
        """初始化积分仓库

        Args:
            db_manager: 数据库管理器实例（可选）
        """
        self.db_manager = db_manager

    def _get_connection(self):
        """获取数据库连接"""
        import os

        if self.db_manager:
            logger.info(f"🔌 CreditRepository: 使用数据库管理器获取连接")
            return self.db_manager.get_connection()
        else:
            # 如果没有数据库管理器，使用环境变量或默认配置
            host = os.getenv('POSTGRES_HOST') or os.getenv('DB_HOST', 'localhost')
            port = int(os.getenv('POSTGRES_PORT') or os.getenv('DB_PORT', '5432'))
            database = os.getenv('POSTGRES_DB') or os.getenv('DB_NAME', 'qidian')
            user = os.getenv('POSTGRES_USER') or os.getenv('DB_USER', 'postgres')
            password = os.getenv('POSTGRES_PASSWORD') or os.getenv('DB_PASSWORD', '')

            logger.info(f"🔌 CreditRepository: 使用直接连接方式")
            logger.info(f"🔌 CreditRepository: 连接信息 - 主机: {host}, 端口: {port}, 数据库: {database}, 用户: {user}")

            try:
                conn = psycopg2.connect(
                    host=host,
                    port=port,
                    database=database,
                    user=user,
                    password=password
                )
                logger.info(f"✅ CreditRepository: 数据库连接成功")
                return conn
            except Exception as e:
                logger.error(f"❌ CreditRepository: 数据库连接失败: {str(e)}")
                import traceback
                logger.error(f"❌ CreditRepository: 异常堆栈: {traceback.format_exc()}")
                raise

    def get_user_credits(self, user_id: str) -> Optional[Dict[str, Any]]:
        """获取用户积分信息

        Args:
            user_id: 用户ID

        Returns:
            用户积分信息字典，如果不存在则返回None
        """
        logger.info(f"💰 CreditRepository: 获取用户积分: {user_id}")

        try:
            conn = self._get_connection()
            try:
                with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                    cursor.execute("""
                        SELECT
                            id, user_id, event_credits, daily_credits, monthly_credits,
                            additional_credits, free_credits, total_credits,
                            daily_credits_last_updated, daily_credits_amount,
                            monthly_credits_last_updated, monthly_credits_amount,
                            subscription_id, event_credits_expiry, event_id,
                            updated_at, version
                        FROM user_credits
                        WHERE user_id = %s
                    """, (user_id,))

                    result = cursor.fetchone()
                    if result:
                        credits_info = dict(result)
                        logger.info(f"✅ CreditRepository: 找到用户积分记录: 总积分={credits_info['total_credits']}")
                        return credits_info
                    else:
                        logger.warning(f"⚠️ CreditRepository: 未找到用户积分记录: {user_id}")
                        return None

            finally:
                if not self.db_manager:
                    conn.close()

        except Exception as e:
            logger.error(f"❌ CreditRepository: 获取用户积分失败: {str(e)}")
            import traceback
            logger.error(f"❌ CreditRepository: 异常堆栈: {traceback.format_exc()}")
            return None

    def consume_credits(self, user_id: str, amount: float = 1.0,
                       usage_type: str = "usage", usage_description: str = None) -> Dict[str, Any]:
        """按优先级消耗用户积分

        【积分扣除核心逻辑】
        消耗顺序：活动积分 → 每日积分 → 月度积分 → 附加积分 → 免费积分

        逻辑说明：
        1. 使用数据库行锁(FOR UPDATE)确保并发安全
        2. 检查总积分是否足够，不足则拒绝扣除
        3. 按优先级顺序依次扣除各类积分
        4. 使用乐观锁(version字段)防止并发更新冲突
        5. 所有操作在事务中执行，确保数据一致性

        Args:
            user_id: 用户ID
            amount: 要消耗的积分数量，默认1.0
            usage_type: 使用类型，默认"usage"（对话消耗），也可以是"tool_usage"（工具调用消耗）
            usage_description: 自定义描述（可选），如果不提供则使用默认描述

        Returns:
            消耗结果字典，包含：
            - success: 是否成功
            - consumed_amount: 实际消耗数量
            - remaining_credits: 剩余总积分
            - consumption_details: 各类积分的消耗明细
            - error_message: 错误信息(如有)
        """
        logger.info(f"💸 CreditRepository: 开始消耗用户积分: {user_id}, 数量: {amount}")

        result = {
            "success": False,
            "consumed_amount": 0.0,
            "remaining_credits": 0.0,
            "consumption_details": {},
            "error_message": None
        }

        conn = None
        try:
            conn = self._get_connection()
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                # 开始事务 - 确保积分扣除的原子性
                conn.autocommit = False

                # 1. 获取当前积分信息（带行锁） - 防止并发扣除导致的余额错误
                # FOR UPDATE 锁定当前行，其他事务必须等待当前事务完成
                cursor.execute("""
                    SELECT
                        id, event_credits, daily_credits, monthly_credits,
                        additional_credits, free_credits, total_credits, version
                    FROM user_credits
                    WHERE user_id = %s
                    FOR UPDATE
                """, (user_id,))

                current_credits = cursor.fetchone()
                if not current_credits:
                    result["error_message"] = f"用户积分记录不存在: {user_id}"
                    logger.error(f"❌ CreditRepository: {result['error_message']}")
                    conn.rollback()
                    return result

                # 转换为Decimal进行精确计算
                current_credits = dict(current_credits)
                amount_decimal = Decimal(str(amount))

                # 【积分余额检查】- 在扣除前确保有足够积分，避免负余额
                total_available = Decimal(str(current_credits['total_credits']))
                if total_available < amount_decimal:
                    result["error_message"] = f"积分不足: 需要{amount}, 可用{total_available}"
                    logger.warning(f"⚠️ CreditRepository: {result['error_message']}")
                    conn.rollback()
                    return result

                # 2. 【按优先级消耗积分】- 优先消耗即将过期的积分，减少用户损失
                remaining_to_consume = amount_decimal
                consumption_details = {}

                # 【积分消耗优先级顺序】：
                # 活动积分(有过期时间) → 每日积分(每日刷新) → 月度积分(每月刷新) → 附加积分(奖励积分) → 免费积分(系统赠送)
                credit_types = [
                    ("event_credits", "活动积分"),      # 最优先：有过期时间，不用会损失
                    ("daily_credits", "每日积分"),      # 次优先：每日刷新，当天不用会浪费
                    ("monthly_credits", "月度积分"),    # 第三：每月刷新
                    ("additional_credits", "附加积分"), # 第四：奖励积分，相对珍贵
                    ("free_credits", "免费积分")        # 最后：系统赠送，价值最低
                ]

                new_values = {}
                # 【逐类型扣除积分】- 按优先级顺序依次扣除各类积分
                for credit_field, credit_name in credit_types:
                    if remaining_to_consume <= 0:  # 已扣除够数量，停止
                        break

                    current_amount = Decimal(str(current_credits[credit_field]))
                    if current_amount > 0:  # 该类积分有余额才处理
                        # 计算这种积分类型能消耗多少 - 取当前余额和剩余需求的最小值
                        consumed_from_this_type = min(current_amount, remaining_to_consume)
                        new_amount = current_amount - consumed_from_this_type

                        # 记录新值和消耗详情
                        new_values[credit_field] = float(new_amount)
                        consumption_details[credit_name] = float(consumed_from_this_type)
                        remaining_to_consume -= consumed_from_this_type

                        logger.info(f"💸 消耗{credit_name}: {float(consumed_from_this_type)}, 剩余: {float(new_amount)}")

                # 计算新的总积分
                new_total = total_available - amount_decimal
                new_values["total_credits"] = float(new_total)

                # 3. 【数据库更新】- 使用乐观锁确保并发安全
                set_clause = ", ".join([f"{field} = %s" for field in new_values.keys()])
                set_clause += ", version = version + 1, updated_at = now()"  # version+1 实现乐观锁

                # WHERE条件包含version检查，确保在读取后没有其他事务修改过数据
                update_query = f"""
                    UPDATE user_credits
                    SET {set_clause}
                    WHERE user_id = %s AND version = %s
                    RETURNING version
                """

                values = list(new_values.values()) + [user_id, current_credits['version']]
                cursor.execute(update_query, values)

                updated_result = cursor.fetchone()
                if not updated_result:
                    # 【并发冲突处理】- version不匹配说明有其他事务修改了数据
                    result["error_message"] = "积分更新失败，可能存在并发冲突，请重试"
                    logger.error(f"❌ CreditRepository: {result['error_message']}")
                    conn.rollback()
                    return result

                # 【事务提交】- 确保所有更改生效
                conn.commit()

                # 设置成功结果
                result.update({
                    "success": True,
                    "consumed_amount": float(amount_decimal),
                    "remaining_credits": float(new_total),
                    "consumption_details": consumption_details
                })

                logger.info(f"✅ CreditRepository: 积分消耗成功!")
                logger.info(f"   消耗数量: {amount}")
                logger.info(f"   剩余积分: {float(new_total)}")
                logger.info(f"   消耗详情: {consumption_details}")

                # 【记录积分变动】- 在成功消耗后记录变动历史
                try:
                    # 只记录一次总消耗，包含详细的消耗分布信息
                    details_text = ", ".join([f"{name}:{amount}" for name, amount in consumption_details.items() if amount > 0])

                    # 根据usage_type和usage_description生成描述
                    if usage_description:
                        # 使用自定义描述
                        final_description = usage_description
                    elif usage_type == "tool_usage":
                        # 工具调用消耗
                        final_description = f"工具调用消耗 {float(amount_decimal)}积分 ({details_text})"
                    else:
                        # 默认对话消耗
                        final_description = f"对话消耗 {float(amount_decimal)}积分 ({details_text})"

                    self.record_credit_change(
                        user_id=user_id,
                        change_type=usage_type,  # 使用传入的类型
                        amount=-float(amount_decimal),  # 负数表示消耗
                        description=final_description,
                        credit_type="mixed"
                    )

                except Exception as record_error:
                    # 记录失败不影响积分消耗的成功，只记录警告
                    logger.warning(f"⚠️ CreditRepository: 积分变动记录失败，但消耗成功: {record_error}")

                return result

        except Exception as e:
            if conn:
                try:
                    conn.rollback()
                except:
                    pass
            result["error_message"] = f"积分消耗异常: {str(e)}"
            logger.error(f"❌ CreditRepository: {result['error_message']}")
            import traceback
            logger.error(f"❌ CreditRepository: 异常堆栈: {traceback.format_exc()}")
            return result
        finally:
            if conn and not self.db_manager:
                try:
                    conn.close()
                except:
                    pass

    def check_sufficient_credits(self, user_id: str, required_amount: float = 1.0) -> bool:
        """检查用户是否有足够的积分

        【积分检查核心逻辑】
        - 在执行消耗操作前进行预检查，避免无效的扣除尝试
        - 只读操作，不加锁，性能较好
        - 用于对话前的权限验证

        Args:
            user_id: 用户ID
            required_amount: 需要的积分数量，默认1.0

        Returns:
            bool: 是否有足够积分
            - True: 积分充足，可以进行消耗
            - False: 积分不足或用户不存在
        """
        logger.info(f"🔍 CreditRepository: 检查用户积分是否充足: {user_id}, 需要: {required_amount}")

        try:
            credits_info = self.get_user_credits(user_id)
            if not credits_info:
                logger.warning(f"⚠️ CreditRepository: 用户积分记录不存在: {user_id}")
                return False

            total_credits = float(credits_info['total_credits'])
            sufficient = total_credits >= required_amount

            logger.info(f"💰 CreditRepository: 积分检查结果: 总积分={total_credits}, 需要={required_amount}, 充足={sufficient}")
            return sufficient

        except Exception as e:
            logger.error(f"❌ CreditRepository: 检查积分充足性失败: {str(e)}")
            return False

    def record_credit_change(self, user_id: str, change_type: str, amount: float,
                           description: str, credit_type: str = "unknown",
                           transaction_id: str = None, package_id: str = None,
                           event_id: str = None, subscription_id: str = None) -> bool:
        """记录积分变动

        Args:
            user_id: 用户ID
            change_type: 变动类型(usage, daily, purchase, expire等)
            amount: 变动数量(正数表示增加，负数表示减少)
            description: 变动描述
            credit_type: 积分类型(daily, monthly, event, additional, free等)
            transaction_id: 交易ID(可选)
            package_id: 套餐ID(可选)
            event_id: 活动ID(可选)
            subscription_id: 订阅ID(可选)

        Returns:
            是否记录成功
        """
        logger.info(f"📝 CreditRepository: 记录积分变动: {user_id}, 类型={change_type}, 数量={amount}")

        try:
            conn = self._get_connection()
            try:
                with conn.cursor() as cursor:
                    cursor.execute("""
                        INSERT INTO credit_records (
                            user_id, type, amount, description, credit_type,
                            stripe_session_id, package_id, event_id, subscription_id
                        ) VALUES (
                            %s, %s, %s, %s, %s, %s, %s, %s, %s
                        )
                    """, (
                        user_id, change_type, amount, description, credit_type,
                        transaction_id, package_id, event_id, subscription_id
                    ))

                    conn.commit()
                    logger.info(f"✅ CreditRepository: 积分变动记录成功")
                    return True

            finally:
                if not self.db_manager:
                    conn.close()

        except Exception as e:
            logger.error(f"❌ CreditRepository: 记录积分变动失败: {str(e)}")
            import traceback
            logger.error(f"❌ CreditRepository: 异常堆栈: {traceback.format_exc()}")
            return False

    def get_credit_records(self, user_id: str, limit: int = 50, change_type: str = None) -> List[Dict[str, Any]]:
        """获取用户积分变动记录

        Args:
            user_id: 用户ID
            limit: 返回记录数限制
            change_type: 变动类型过滤(可选)

        Returns:
            积分变动记录列表
        """
        logger.info(f"📋 CreditRepository: 获取积分变动记录: {user_id}, 限制={limit}, 类型={change_type}")

        try:
            conn = self._get_connection()
            try:
                with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                    base_query = """
                        SELECT
                            id, user_id, type, amount, description, credit_type,
                            stripe_session_id, stripe_payment_intent, package_id,
                            event_id, subscription_id, created_at
                        FROM credit_records
                        WHERE user_id = %s
                    """
                    params = [user_id]

                    if change_type:
                        base_query += " AND type = %s"
                        params.append(change_type)

                    base_query += " ORDER BY created_at DESC LIMIT %s"
                    params.append(limit)

                    cursor.execute(base_query, params)
                    results = cursor.fetchall()

                    records = [dict(row) for row in results]
                    logger.info(f"✅ CreditRepository: 找到 {len(records)} 条积分变动记录")
                    return records

            finally:
                if not self.db_manager:
                    conn.close()

        except Exception as e:
            logger.error(f"❌ CreditRepository: 获取积分变动记录失败: {str(e)}")
            import traceback
            logger.error(f"❌ CreditRepository: 异常堆栈: {traceback.format_exc()}")
            return []

    def create_user_credits(self, user_id: str, initial_credits: Dict[str, float] = None) -> bool:
        """为用户创建积分记录

        Args:
            user_id: 用户ID
            initial_credits: 初始积分配置

        Returns:
            创建是否成功
        """
        logger.info(f"📝 CreditRepository: 为用户创建积分记录: {user_id}")

        if initial_credits is None:
            initial_credits = {
                "event_credits": 0.0,
                "daily_credits": 0.0,
                "monthly_credits": 0.0,
                "additional_credits": 0.0,
                "free_credits": 0.0
            }

        try:
            conn = self._get_connection()
            try:
                with conn.cursor() as cursor:
                    total_credits = sum(initial_credits.values())

                    cursor.execute("""
                        INSERT INTO user_credits (
                            user_id, event_credits, daily_credits, monthly_credits,
                            additional_credits, free_credits, total_credits,
                            daily_credits_amount, monthly_credits_amount
                        ) VALUES (
                            %s, %s, %s, %s, %s, %s, %s, %s, %s
                        )
                        ON CONFLICT (user_id) DO NOTHING
                    """, (
                        user_id,
                        initial_credits.get("event_credits", 0.0),
                        initial_credits.get("daily_credits", 0.0),
                        initial_credits.get("monthly_credits", 0.0),
                        initial_credits.get("additional_credits", 0.0),
                        initial_credits.get("free_credits", 0.0),
                        total_credits,
                        initial_credits.get("daily_credits", 0.0),
                        initial_credits.get("monthly_credits", 0.0)
                    ))

                    conn.commit()
                    logger.info(f"✅ CreditRepository: 用户积分记录创建成功: {user_id}")
                    return True

            finally:
                if not self.db_manager:
                    conn.close()

        except Exception as e:
            logger.error(f"❌ CreditRepository: 创建用户积分记录失败: {str(e)}")
            import traceback
            logger.error(f"❌ CreditRepository: 异常堆栈: {traceback.format_exc()}")
            return False