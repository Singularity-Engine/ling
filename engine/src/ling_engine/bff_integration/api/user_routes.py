"""
用户相关的API路由

提供用户管理相关的端点
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
from loguru import logger

from ..auth.jwt_handler import JWTHandler
from ..auth.middleware import create_jwt_dependency, require_roles
from ..models.user_models import UserResponse, UserContext
from ..database.user_repository import UserRepository

def create_user_router(config=None, db_manager=None) -> APIRouter:
    """创建用户路由

    Args:
        config: 应用配置（可选）
        db_manager: 数据库管理器（可选）

    Returns:
        用户路由器
    """
    router = APIRouter(prefix="/api/users", tags=["用户管理"])

    # 初始化组件
    jwt_handler = JWTHandler(config)
    user_repo = UserRepository(db_manager)

    # 创建JWT依赖项
    get_current_user = create_jwt_dependency(jwt_handler, optional=False)
    require_admin = require_roles("admin", "super_admin")

    @router.get("/profile", response_model=UserResponse)
    async def get_user_profile(current_user: UserContext = Depends(get_current_user)):
        """获取用户个人资料

        Args:
            current_user: 当前用户上下文

        Returns:
            用户个人资料
        """
        try:
            user = user_repo.find_by_user_id(current_user.user_id)
            if not user:
                raise HTTPException(status_code=404, detail="用户不存在")

            return UserResponse(
                id=user.id,
                user_id=user.user_id,
                username=user.username,
                email=user.email,
                avatar_url=user.avatar_url,
                authenticated=True
            )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"获取用户个人资料失败: {str(e)}")
            raise HTTPException(status_code=500, detail="获取用户资料失败")

    @router.get("/list", response_model=List[UserResponse])
    async def list_users(
        limit: int = Query(default=20, ge=1, le=100, description="每页数量"),
        offset: int = Query(default=0, ge=0, description="偏移量"),
        current_user: UserContext = Depends(require_admin)
    ):
        """获取用户列表（管理员权限）

        Args:
            limit: 每页数量
            offset: 偏移量
            current_user: 当前用户上下文

        Returns:
            用户列表
        """
        try:
            users = user_repo.list_users(limit=limit, offset=offset)

            return [
                UserResponse(
                    id=user.id,
                    user_id=user.user_id,
                    username=user.username,
                    email=user.email,
                    avatar_url=user.avatar_url,
                    authenticated=True
                )
                for user in users
            ]
        except Exception as e:
            logger.error(f"获取用户列表失败: {str(e)}")
            raise HTTPException(status_code=500, detail="获取用户列表失败")

    @router.get("/count")
    async def get_user_count(current_user: UserContext = Depends(require_admin)):
        """获取用户总数（管理员权限）

        Args:
            current_user: 当前用户上下文

        Returns:
            用户总数
        """
        try:
            count = user_repo.count_users()
            return {"count": count}
        except Exception as e:
            logger.error(f"获取用户总数失败: {str(e)}")
            raise HTTPException(status_code=500, detail="获取用户总数失败")

    @router.get("/{user_id}", response_model=UserResponse)
    async def get_user_by_id(
        user_id: str,
        current_user: UserContext = Depends(get_current_user)
    ):
        """根据用户ID获取用户信息

        Args:
            user_id: 用户ID
            current_user: 当前用户上下文

        Returns:
            用户信息
        """
        try:
            # 检查权限：只能查看自己的信息，或者管理员可以查看所有用户
            if current_user.user_id != user_id and not any(
                role in current_user.roles for role in ["admin", "super_admin"]
            ):
                raise HTTPException(status_code=403, detail="无权访问该用户信息")

            user = user_repo.find_by_user_id(user_id)
            if not user:
                raise HTTPException(status_code=404, detail="用户不存在")

            return UserResponse(
                id=user.id,
                user_id=user.user_id,
                username=user.username,
                email=user.email,
                avatar_url=user.avatar_url,
                authenticated=True
            )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"获取用户信息失败: {str(e)}")
            raise HTTPException(status_code=500, detail="获取用户信息失败")

    @router.delete("/{user_id}")
    async def delete_user(
        user_id: str,
        current_user: UserContext = Depends(require_admin)
    ):
        """删除用户（管理员权限）

        Args:
            user_id: 用户ID
            current_user: 当前用户上下文

        Returns:
            删除结果
        """
        try:
            # 防止删除自己
            if current_user.user_id == user_id:
                raise HTTPException(status_code=400, detail="不能删除自己的账户")

            # 检查用户是否存在
            user = user_repo.find_by_user_id(user_id)
            if not user:
                raise HTTPException(status_code=404, detail="用户不存在")

            # 删除用户
            success = user_repo.delete_user(user_id)
            if success:
                logger.info(f"管理员 {current_user.username} 删除了用户 {user.username}")
                return {"success": True, "message": "用户删除成功"}
            else:
                raise HTTPException(status_code=500, detail="删除用户失败")

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"删除用户失败: {str(e)}")
            raise HTTPException(status_code=500, detail="删除用户失败")

    @router.get("/search/username/{username}", response_model=Optional[UserResponse])
    async def search_user_by_username(
        username: str,
        current_user: UserContext = Depends(get_current_user)
    ):
        """根据用户名搜索用户

        Args:
            username: 用户名
            current_user: 当前用户上下文

        Returns:
            用户信息（如果找到）
        """
        try:
            # 检查权限：只能搜索自己，或者管理员可以搜索所有用户
            if current_user.username != username and not any(
                role in current_user.roles for role in ["admin", "super_admin"]
            ):
                raise HTTPException(status_code=403, detail="无权搜索其他用户")

            user = user_repo.find_by_username(username)
            if not user:
                return None

            return UserResponse(
                id=user.id,
                user_id=user.user_id,
                username=user.username,
                email=user.email,
                avatar_url=user.avatar_url,
                authenticated=True
            )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"搜索用户失败: {str(e)}")
            raise HTTPException(status_code=500, detail="搜索用户失败")

    @router.get("/stats/summary")
    async def get_user_stats(current_user: UserContext = Depends(require_admin)):
        """获取用户统计信息（管理员权限）

        Args:
            current_user: 当前用户上下文

        Returns:
            用户统计信息
        """
        try:
            total_users = user_repo.count_users()

            # 这里可以添加更多统计信息，如：
            # - 今日新增用户
            # - 活跃用户数
            # - 用户分布等

            return {
                "total_users": total_users,
                "stats_generated_at": "2024-01-01T00:00:00Z",  # 实际应该使用当前时间
                "version": "1.0.0"
            }
        except Exception as e:
            logger.error(f"获取用户统计信息失败: {str(e)}")
            raise HTTPException(status_code=500, detail="获取统计信息失败")

    return router
