"""
用户相关的数据模型

定义用户实体、请求和响应模型
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class User(BaseModel):
    """用户模型"""
    id: Optional[int] = None  # 自增ID
    user_id: str  # Clerk用户ID
    username: str
    email: Optional[str] = None  # 用户邮箱地址
    first_name: Optional[str] = None  # 用户名字
    last_name: Optional[str] = None  # 用户姓氏
    avatar_url: Optional[str] = None  # 用户头像URL
    is_active: bool = True  # 用户是否激活状态
    last_login_at: Optional[datetime] = None  # 最后登录时间
    created_at: Optional[datetime] = None  # 记录创建时间
    updated_at: Optional[datetime] = None  # 记录更新时间
    clerk_created_at: Optional[int] = None  # Clerk用户创建时间戳
    clerk_updated_at: Optional[int] = None  # Clerk用户更新时间戳
    roles: List[str] = Field(default_factory=lambda: ["USER"])  # 用户角色列表
    preferences: dict = Field(default_factory=dict)  # 用户偏好设置

    class Config:
        """Pydantic配置"""
        from_attributes = True

    def get_display_name(self) -> str:
        """获取显示名称"""
        if self.first_name and self.last_name:
            return f"{self.first_name} {self.last_name}"
        elif self.first_name:
            return self.first_name
            return self.username

    def has_role(self, role: str) -> bool:
        """检查用户是否有指定角色"""
        return role in self.roles

class UserCreate(BaseModel):
    """用户创建请求模型"""
    clerk_user_id: str = Field(..., alias="clerk_user_id")
    username: str
    email: Optional[str] = None
    first_name: Optional[str] = Field(None, alias="first_name")
    last_name: Optional[str] = Field(None, alias="last_name")
    image_url: Optional[str] = Field(None, alias="image_url")
    operation: Optional[str] = None  # created, updated

    class Config:
        """Pydantic配置"""
        populate_by_name = True

    def get_display_name(self) -> str:
        """获取显示名称"""
        if self.first_name and self.last_name:
            return f"{self.first_name} {self.last_name}"
        elif self.first_name:
            return self.first_name
            return self.username

class UserResponse(BaseModel):
    """用户响应模型"""
    id: int
    user_id: str
    username: str
    email: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    avatar_url: Optional[str] = None
    display_name: Optional[str] = None
    is_active: bool = True
    last_login_at: Optional[datetime] = None
    roles: List[str] = Field(default_factory=lambda: ["USER"])
    authenticated: bool = True
    source: Optional[str] = None  # 数据来源：database_synced, jwt_only等

    class Config:
        """Pydantic配置"""
        from_attributes = True

    def get_display_name(self) -> str:
        """获取显示名称"""
        if self.first_name and self.last_name:
            return f"{self.first_name} {self.last_name}"
        elif self.first_name:
            return self.first_name
            return self.username

class UserContext(BaseModel):
    """用户上下文模型"""
    user_id: str
    username: str
    email: Optional[str] = None
    roles: List[str] = Field(default_factory=list)
    token: Optional[str] = None
    is_system: bool = False  # 新增：标识是否为系统用户

    class Config:
        """配置"""
        from_attributes = True

    def is_system_user(self) -> bool:
        """检查是否为系统用户"""
        return self.is_system or 'SYSTEM' in self.roles

class TokenPayload(BaseModel):
    """JWT令牌负载模型"""
    sub: str  # 用户ID
    username: str
    email: Optional[str] = None
    roles: List[str] = Field(default_factory=list)
    exp: float  # 过期时间戳
    iat: float  # 签发时间戳

    class Config:
        """Pydantic配置"""
        from_attributes = True
