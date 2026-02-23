/**
 * UI 全局状态上下文
 *
 * 管理全局 UI 状态如定价页面开关、计费弹窗等。
 * 拆分为 read-only state + stable actions 双 context，
 * 避免只需 action 的消费者被 state 变化触发重渲染。
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';

// ── 计费弹窗状态 ──────────────────────────────────────────────

export interface BillingModalState {
  open: boolean;
  reason?: 'insufficient_credits' | 'daily_limit_reached' | 'tool_quota_reached' | 'guest_limit' | 'affinity_milestone';
  message?: string;
}

// ── Context 类型 ──────────────────────────────────────────────

interface UIState {
  pricingOpen: boolean;
  billingModal: BillingModalState;
}

interface UIActionsType {
  setPricingOpen: (open: boolean) => void;
  setBillingModal: (state: BillingModalState) => void;
  closeBillingModal: () => void;
}

const UIStateContext = createContext<UIState | null>(null);
const UIActionsContext = createContext<UIActionsType | null>(null);

// ── Provider ──────────────────────────────────────────────────

export function UIProvider({ children }: { children: ReactNode }) {
  const [pricingOpen, setPricingOpen] = useState(false);
  const [billingModal, setBillingModal] = useState<BillingModalState>({
    open: false,
  });

  const closeBillingModal = useCallback(() => {
    setBillingModal({ open: false });
  }, []);

  const actions = useMemo(
    () => ({ setPricingOpen, setBillingModal, closeBillingModal }),
    [closeBillingModal],
  );

  const state = useMemo(
    () => ({ pricingOpen, billingModal }),
    [pricingOpen, billingModal],
  );

  return (
    <UIActionsContext.Provider value={actions}>
      <UIStateContext.Provider value={state}>
        {children}
      </UIStateContext.Provider>
    </UIActionsContext.Provider>
  );
}

// ── Hooks ──────────────────────────────────────────────────────

/** Subscribe to read-only UI state (re-renders on state changes). */
export function useUIState() {
  const ctx = useContext(UIStateContext);
  if (!ctx) throw new Error('useUIState must be used within UIProvider');
  return ctx;
}

/** Subscribe to stable UI actions (never causes re-renders). */
export function useUIActions() {
  const ctx = useContext(UIActionsContext);
  if (!ctx) throw new Error('useUIActions must be used within UIProvider');
  return ctx;
}
