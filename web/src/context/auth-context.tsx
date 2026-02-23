/**
 * 灵认证上下文
 *
 * 提供 login / register / logout / refreshUser 以及当前用户状态。
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { apiClient } from '@/services/api-client';

// ── 类型 ──────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string | null;
  username: string;
  display_name: string | null;
  role: string;
  plan: string;
  credits_balance: number;
  subscription_status: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login(identifier: string, password: string): Promise<void>;
  register(
    email: string,
    username: string,
    password: string,
    displayName?: string,
  ): Promise<void>;
  logout(): void;
  refreshUser(): Promise<void>;
  updateCredits(balance: number): void;
}

const AuthContext = createContext<AuthContextType | null>(null);

// ── Provider ──────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 启动时检查已有 token
  useEffect(() => {
    const token = apiClient.getToken();
    if (!token) { setIsLoading(false); return; }

    const ac = new AbortController();
    apiClient
      .get<User>('/api/auth/me', ac.signal)
      .then(setUser)
      .catch(() => { if (!ac.signal.aborted) apiClient.clearTokens(); })
      .finally(() => { if (!ac.signal.aborted) setIsLoading(false); });
    return () => ac.abort();
  }, []);

  const login = useCallback(async (identifier: string, password: string) => {
    const res = await apiClient.post<{
      token: string;
      refresh_token: string;
      user: User;
    }>('/api/auth/login', { identifier, password });
    apiClient.setTokens(res.token, res.refresh_token);
    setUser(res.user);
  }, []);

  const register = useCallback(
    async (
      email: string,
      username: string,
      password: string,
      displayName?: string,
    ) => {
      const res = await apiClient.post<{
        token: string;
        refresh_token: string;
        user: User;
      }>('/api/auth/register', {
        email,
        username,
        password,
        display_name: displayName || undefined,
      });
      apiClient.setTokens(res.token, res.refresh_token);
      setUser(res.user);
    },
    [],
  );

  const logout = useCallback(() => {
    apiClient.post('/api/auth/logout').catch(() => {});
    apiClient.clearTokens();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const u = await apiClient.get<User>('/api/auth/me');
      setUser(u);
    } catch {
      // 忽略
    }
  }, []);

  const updateCredits = useCallback((balance: number) => {
    setUser((prev) => prev ? { ...prev, credits_balance: balance } : prev);
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      login,
      register,
      logout,
      refreshUser,
      updateCredits,
    }),
    [user, isLoading, login, register, logout, refreshUser, updateCredits],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Hooks ─────────────────────────────────────────────────────

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用');
  return ctx;
}

export function useUser(): User | null {
  return useAuth().user;
}

export function useIsAuthenticated(): boolean {
  return useAuth().isAuthenticated;
}
