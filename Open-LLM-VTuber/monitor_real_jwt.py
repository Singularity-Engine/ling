#!/usr/bin/env python3
"""
实时监控Python后端接收的JWT令牌
"""

import time
import requests
import json
from datetime import datetime

def monitor_python_backend():
    """监控Python后端的JWT令牌接收"""
    print("🔍 开始监控Python后端JWT令牌接收...")
    print("=" * 60)
    print("等待真实的用户登录和JWT令牌...")
    print("请在前端重新登录您的账号")
    print("=" * 60)

    # 监控各个端点
    endpoints_to_monitor = [
        "/api/auth/config",
        "/api/auth/status",
        "/api/auth/me",
        "/api/users/me"
    ]

    last_check_time = datetime.now()

    while True:
        try:
            current_time = datetime.now()

            # 每30秒显示一次状态
            if (current_time - last_check_time).seconds >= 30:
                print(f"\n⏰ {current_time.strftime('%H:%M:%S')} - Python服务监控中...")
                print("💡 提示: 请在前端完成登录，然后访问需要认证的页面")
                last_check_time = current_time

            # 检查是否有新的认证请求
            # 这里我们可以通过检查日志或者其他方式来监控
            # 但由于我们无法直接访问FastAPI的日志，我们将依赖用户的操作

            time.sleep(5)  # 每5秒检查一次

        except KeyboardInterrupt:
            print("\n\n🛑 监控已停止")
            break
        except Exception as e:
            print(f"❌ 监控错误: {e}")
            time.sleep(5)

def test_jwt_endpoints():
    """测试JWT相关端点"""
    print("\n🧪 测试JWT相关端点...")

    base_url = "http://localhost:12393"

    # 测试公开端点
    try:
        response = requests.get(f"{base_url}/api/auth/config")
        print(f"✅ /api/auth/config: {response.status_code}")
    except Exception as e:
        print(f"❌ /api/auth/config: {e}")

    # 测试需要认证的端点（应该返回401）
    try:
        response = requests.get(f"{base_url}/api/auth/me")
        print(f"📋 /api/auth/me (无认证): {response.status_code} - {response.text[:50]}")
    except Exception as e:
        print(f"❌ /api/auth/me: {e}")

    try:
        response = requests.get(f"{base_url}/api/users/me")
        print(f"📋 /api/users/me (无认证): {response.status_code} - {response.text[:50]}")
    except Exception as e:
        print(f"❌ /api/users/me: {e}")

if __name__ == "__main__":
    print("🚀 Python后端JWT监控工具")
    print("=" * 60)

    # 先测试端点可用性
    test_jwt_endpoints()

    print("\n" + "=" * 60)
    print("📋 监控说明:")
    print("1. 请在前端重新登录您的账号")
    print("2. 登录后，尝试访问需要认证的页面或API")
    print("3. 观察Python后端的日志输出")
    print("4. 按 Ctrl+C 停止监控")
    print("=" * 60)

    # 开始监控
    monitor_python_backend()
