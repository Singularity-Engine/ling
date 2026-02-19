/**
 * Gateway Message Adapter
 *
 * Translates OpenClaw Gateway agent events into the MessageEvent format
 * that websocket-handler.tsx already understands. This allows Phase 1
 * (connection layer) to work without rewriting the message handler.
 *
 * Gateway format:  { type: 'event', event: 'agent.event', payload: { stream, data } }
 * Frontend format: { type: 'full-text' | 'tool_call_status' | 'control' | ... }
 */

import { Subject } from 'rxjs';
import type { GatewayAgentEvent, GatewayFrame } from './gateway-connector';
import type { MessageEvent } from './websocket-service';

// Extended MessageEvent with Gateway-specific fields (affinity, emotion)
export interface GatewayMessageEvent extends MessageEvent {
  affinity?: number;
  level?: string;
  milestone?: string;
  expression?: string;
  intensity?: number;
}

// ─── Text accumulation state ──────────────────────────────────────

interface RunState {
  runId: string;
  accumulatedText: string;
  lastSeq: number;
}

class GatewayMessageAdapter {
  /** Emits MessageEvent objects compatible with websocket-handler.tsx */
  readonly message$ = new Subject<GatewayMessageEvent>();

  private activeRuns = new Map<string, RunState>();

  /**
   * Process a Gateway agent event and emit corresponding MessageEvent(s).
   */
  handleAgentEvent(event: GatewayAgentEvent) {
    switch (event.stream) {
      case 'assistant':
        this.handleAssistantDelta(event);
        break;
      case 'tool':
        this.handleToolEvent(event);
        break;
      case 'lifecycle':
        this.handleLifecycleEvent(event);
        break;
      default:
        console.warn('[GatewayAdapter] Unknown stream:', event.stream);
    }
  }

  /**
   * Process a raw Gateway frame for non-agent events
   * (affinity, emotion, tick, etc.)
   */
  handleRawFrame(frame: GatewayFrame) {
    if (frame.type !== 'event') return;

    // Custom events from Gateway plugins (affinity, emotion, etc.)
    const event = frame.event;
    const payload = frame.payload || {};

    switch (event) {
      case 'affinity-update':
        this.emit({
          type: 'affinity-update',
          affinity: payload.affinity as number,
          level: payload.level as string,
        });
        break;

      case 'affinity-milestone':
        this.emit({
          type: 'affinity-milestone',
          milestone: payload.milestone as string,
          message: payload.message as string,
        });
        break;

      case 'emotion-expression':
        this.emit({
          type: 'emotion-expression',
          expression: payload.expression as string,
          intensity: payload.intensity as number,
        });
        break;

      // agent.event / agent and tick are handled elsewhere
      case 'agent.event':
      case 'agent':
      case 'tick':
      case 'connect.challenge':
        break;

      default:
        if (import.meta.env.DEV) console.log('[GatewayAdapter] Unhandled event:', event);
    }
  }

  /**
   * Return accumulated texts from all active (interrupted) runs.
   * Useful for detecting if a response was mid-stream when connection dropped.
   */
  getActiveTexts(): string[] {
    return Array.from(this.activeRuns.values())
      .map(run => run.accumulatedText)
      .filter(text => text.length > 0);
  }

  /**
   * Clear state for all runs (e.g., on disconnect)
   */
  reset() {
    this.activeRuns.clear();
  }

  // ── Assistant text stream ──────────────────────────────────────

  private handleAssistantDelta(event: GatewayAgentEvent) {
    const { runId, data } = event;
    const deltaText = (data.delta as string) || '';

    // Get or create run state
    let run = this.activeRuns.get(runId);
    if (!run) {
      run = { runId, accumulatedText: '', lastSeq: 0 };
      this.activeRuns.set(runId, run);

      // New run = new message bubble (force-new-message)
      this.emit({ type: 'force-new-message' } as any);
    }

    if (deltaText) {
      run.accumulatedText += deltaText;
    } else if (data.text) {
      run.accumulatedText = data.text as string;
    }
    run.lastSeq = event.seq;

    // Emit full-text with the accumulated text (for subtitle display)
    this.emit({
      type: 'full-text',
      text: run.accumulatedText,
    });
  }

  // ── Tool events ────────────────────────────────────────────────

  private handleToolEvent(event: GatewayAgentEvent) {
    const { data } = event;
    const phase = data.phase as string;
    const toolName = (data.name as string) || 'unknown';
    const toolCallId = (data.toolCallId as string) || event.runId + '-' + event.seq;
    const meta = (data.meta as string) || '';
    const isError = data.isError as boolean || false;

    if (phase === 'call') {
      // Tool call started
      this.emit({
        type: 'tool_call_status',
        tool_id: toolCallId,
        tool_name: toolName,
        name: toolName,
        status: 'running',
        content: meta,
        timestamp: new Date().toISOString(),
      });
    } else if (phase === 'result') {
      // Tool call completed
      this.emit({
        type: 'tool_call_status',
        tool_id: toolCallId,
        tool_name: toolName,
        name: toolName,
        status: isError ? 'error' : 'completed',
        content: meta,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // ── Lifecycle events ───────────────────────────────────────────

  private handleLifecycleEvent(event: GatewayAgentEvent) {
    const phase = event.data.phase as string;

    switch (phase) {
      case 'start':
        // Conversation chain starting
        this.emit({
          type: 'control',
          text: 'conversation-chain-start',
        });
        break;

      case 'end': {
        // Agent run finished — finalize text, then emit lifecycle events
        const endRun = this.activeRuns.get(event.runId);
        const finalText = endRun?.accumulatedText || '';
        this.activeRuns.delete(event.runId);

        // Emit finalized AI message text so the handler can persist it
        if (finalText) {
          this.emit({
            type: 'ai-message-complete',
            text: finalText,
          } as any);
        }

        this.emit({
          type: 'backend-synth-complete',
        });
        this.emit({
          type: 'control',
          text: 'conversation-chain-end',
        });
        break;
      }

      case 'abort':
        // Agent run aborted
        this.activeRuns.delete(event.runId);

        this.emit({
          type: 'control',
          text: 'conversation-chain-end',
        });
        break;

      default:
        console.warn('[GatewayAdapter] Unknown lifecycle phase:', phase);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────

  private emit(partial: Partial<GatewayMessageEvent> & { type: string }) {
    // Fill in missing fields with defaults to satisfy MessageEvent interface
    const msg: GatewayMessageEvent = {
      tool_id: undefined,
      tool_name: undefined,
      name: undefined,
      status: undefined,
      content: '',
      timestamp: new Date().toISOString(),
      ...partial,
    } as GatewayMessageEvent;

    this.message$.next(msg);
  }

  /**
   * Get accumulated text for a run (useful for interrupt — sending partial text)
   */
  getRunText(runId: string): string {
    return this.activeRuns.get(runId)?.accumulatedText || '';
  }

  /**
   * Get the most recent active runId (for interrupt)
   */
  getActiveRunId(): string | null {
    const runs = Array.from(this.activeRuns.keys());
    return runs.length > 0 ? runs[runs.length - 1] : null;
  }
}

/** Singleton instance */
export const gatewayAdapter = new GatewayMessageAdapter();
