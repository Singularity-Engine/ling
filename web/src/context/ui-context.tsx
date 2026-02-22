/**
 * UI 全局状态上下文
 *
 * 管理全局 UI 状态如定价页面开关、计费弹窗等。
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

interface UIContextType {
  pricingOpen: boolean;
  setPricingOpen: (open: boolean) => void;
  billingModal: BillingModalState;
  setBillingModal: (state: BillingModalState) => void;
  closeBillingModal: () => void;
}

const UIContext = createContext<UIContextType | null>(null);

// ── Provider ──────────────────────────────────────────────────

export function UIProvider({ children }: { children: ReactNode }) {
  const [pricingOpen, setPricingOpen] = useState(false);
  const [billingModal, setBillingModal] = useState<BillingModalState>({
    open: false,
  });

  const closeBillingModal = useCallback(() => {
    setBillingModal({ open: false });
  }, []);

  const contextValue = useMemo(
    () => ({ pricingOpen, setPricingOpen, billingModal, setBillingModal, closeBillingModal }),
    [pricingOpen, billingModal, closeBillingModal],
  );

  return (
    <UIContext.Provider value={contextValue}>
      {children}
    </UIContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────

export function useUI(): UIContextType {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used within UIProvider');
  return ctx;
}
