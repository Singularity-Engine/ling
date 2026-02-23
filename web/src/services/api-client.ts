/**
 * 灵 HTTP API 客户端
 *
 * 统一处理 token 注入、401 自动跳转登录、请求/响应封装。
 */

import i18next from 'i18next';

function getApiBase(): string {
  // 开发模式：Vite proxy 会把 /api 转发到后端，无需指定地址
  // 生产模式：使用实际后端域名
  if (import.meta.env.DEV) {
    return '';
  }
  return 'https://lain.sngxai.com';
}

const TOKEN_KEY = 'ling_token';
const REFRESH_KEY = 'ling_refresh_token';

class ApiClient {
  private base: string;

  constructor() {
    this.base = getApiBase();
  }

  // ── Token 管理 ──────────────────────────────────────────

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_KEY);
  }

  setTokens(token: string, refreshToken: string): void {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(REFRESH_KEY, refreshToken);
  }

  clearTokens(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  }

  // ── 请求 ────────────────────────────────────────────────

  async request<T = unknown>(
    path: string,
    options: RequestInit = {},
    signal?: AbortSignal,
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${this.base}${path}`, {
      ...options,
      headers,
      signal,
    });

    // 401 → 尝试 refresh，失败则跳转登录
    if (res.status === 401) {
      const refreshed = await this._tryRefresh();
      if (refreshed) {
        // 用新 token 重试
        headers['Authorization'] = `Bearer ${this.getToken()}`;
        const retryRes = await fetch(`${this.base}${path}`, {
          ...options,
          headers,
          signal,
        });
        if (retryRes.ok) {
          return retryRes.json();
        }
      }
      this.clearTokens();
      // 只在非登录页时跳转
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
      throw new Error(i18next.t('error.authExpired'));
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ApiError(res.status, body.detail || res.statusText);
    }

    return res.json();
  }

  async get<T = unknown>(path: string, signal?: AbortSignal): Promise<T> {
    return this.request<T>(path, { method: 'GET' }, signal);
  }

  async post<T = unknown>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }, signal);
  }

  async put<T = unknown>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    return this.request<T>(path, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    }, signal);
  }

  async del<T = unknown>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    return this.request<T>(path, {
      method: 'DELETE',
      body: body ? JSON.stringify(body) : undefined,
    }, signal);
  }

  // ── Billing ────────────────────────────────────────────

  async checkAndDeduct(): Promise<{
    allowed: boolean;
    reason?: string;
    message?: string;
    credits_balance?: number;
    daily_count?: number;
    daily_limit?: number;
  }> {
    return this.post('/api/billing/check-and-deduct');
  }

  async getBalance(): Promise<{
    credits_balance: number;
    plan: string;
    role: string;
    daily_count: number;
    daily_limit: number;
  }> {
    return this.get('/api/billing/balance');
  }

  // ── Stripe ────────────────────────────────────────────

  async createCheckout(
    type: 'subscription' | 'credits',
    plan?: string,
    credits?: number,
  ): Promise<{ checkout_url?: string; detail?: string }> {
    return this.post('/api/stripe/create-checkout', { type, plan, credits });
  }

  async getPortalUrl(): Promise<{ portal_url: string }> {
    return this.get('/api/stripe/portal');
  }

  // ── Refresh ─────────────────────────────────────────────

  // Dedup guard: when multiple 401s arrive simultaneously (e.g. parallel
  // requests), only the first triggers an actual refresh; subsequent callers
  // share the same in-flight promise. Without this, the second call would
  // race and use an already-consumed refresh token, fail, clear credentials,
  // and redirect to login — a real-world auth failure on concurrent requests.
  private _refreshPromise: Promise<boolean> | null = null;

  private async _tryRefresh(): Promise<boolean> {
    if (this._refreshPromise) return this._refreshPromise;

    this._refreshPromise = this._doRefresh();
    try {
      return await this._refreshPromise;
    } finally {
      this._refreshPromise = null;
    }
  }

  private async _doRefresh(): Promise<boolean> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) return false;

    try {
      const res = await fetch(`${this.base}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!res.ok) return false;

      const data = await res.json();
      this.setTokens(data.token, data.refresh_token);
      return true;
    } catch {
      return false;
    }
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export const apiClient = new ApiClient();
