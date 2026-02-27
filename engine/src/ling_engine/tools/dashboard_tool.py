"""
Dashboard 查询工具 — 让灵可以在对话中查询自己的运营数据
"""

import json

from loguru import logger

from .base_tool import BaseTool


class DashboardQueryTool(BaseTool):
    """查询灵的运营数据：用户数、今日活跃、新增用户、系统状态"""

    def __init__(self):
        super().__init__(
            name="query_dashboard",
            description=(
                "查询灵的实时运营数据。返回总用户数、今日活跃用户数、"
                "今日新增用户数、付费用户数。灵可以用这些数据做出商业决策。"
            ),
        )
        self._repo = None

    def set_repo(self, repo):
        """注入 LingUserRepository 实例"""
        self._repo = repo

    async def execute(self, **kwargs) -> str:
        if not self._repo:
            return json.dumps({"error": "数据库连接未初始化"}, ensure_ascii=False)

        try:
            stats = self._repo.get_stats()
            result = {
                "total_users": stats.get("total_users", 0),
                "active_today": stats.get("active_today", 0),
                "new_today": stats.get("new_today", 0),
                "paid_users": stats.get("paid_users", 0),
            }
            return json.dumps(result, ensure_ascii=False)
        except Exception as e:
            logger.error(f"Dashboard 查询工具执行失败: {e}")
            return json.dumps({"error": str(e)}, ensure_ascii=False)


def create_dashboard_tool() -> DashboardQueryTool:
    """创建 Dashboard 查询工具实例"""
    return DashboardQueryTool()
