import { Component, type ErrorInfo, type ReactNode } from "react";
import { createLogger } from "@/utils/logger";

const log = createLogger("ErrorBoundary");

interface Props {
  /** Identifies this boundary in log output */
  name: string;
  /** What to render when the section crashes. Defaults to `null` (silent). */
  fallback?: ReactNode;
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Lightweight error boundary for isolating non-critical UI sections.
 *
 * Unlike the root ErrorBoundary (full-screen crash page), this renders a
 * small inline fallback (or nothing) so the rest of the app keeps working.
 */
export class SectionErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    log.error(`[${this.props.name}] caught:`, error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}
