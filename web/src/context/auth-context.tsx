/**
 * 灵认证上下文
 *
 * 提供 login / register / logout / refreshUser 以及当前用户状态。
 * 拆分为 read-only state + stable actions 双 context，
 * 避免只需 action 的消费者被 state 变化触发重渲染。
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

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthActionsType {
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

const AuthStateContext = createContext<AuthState | null>(null);
const AuthActionsContext = createContext<AuthActionsType | null>(null);

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

  const actions = useMemo<AuthActionsType>(
    () => ({ login, register, logout, refreshUser, updateCredits }),
    [login, register, logout, refreshUser, updateCredits],
  );

  const state = useMemo<AuthState>(
    () => ({ user, isLoading, isAuthenticated: !!user }),
    [user, isLoading],
  );

  return (
    <AuthActionsContext.Provider value={actions}>
      <AuthStateContext.Provider value={state}>
        {children}
      </AuthStateContext.Provider>
    </AuthActionsContext.Provider>
  );
}

// ── Hooks ─────────────────────────────────────────────────────

/** Subscribe to read-only auth state (re-renders on state changes). */
export function useAuthState(): AuthState {
  const ctx = useContext(AuthStateContext);
  if (!ctx) throw new Error('useAuthState 必须在 AuthProvider 内使用');
  return ctx;
}

/** Subscribe to stable auth actions (never causes re-renders). */
export function useAuthActions(): AuthActionsType {
  const ctx = useContext(AuthActionsContext);
  if (!ctx) throw new Error('useAuthActions 必须在 AuthProvider 内使用');
  return ctx;
}

/** Combined hook for backward compatibility. Prefer useAuthState / useAuthActions. */
export function useAuth() {
  return { ...useAuthState(), ...useAuthActions() };
}

export function useUser(): User | null {
  return useAuthState().user;
}

export function useIsAuthenticated(): boolean {
  return useAuthState().isAuthenticated;
}
