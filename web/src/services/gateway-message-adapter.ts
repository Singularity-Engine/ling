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
import { createLogger } from '@/utils/logger';

const log = createLogger('GatewayAdapter');

// ─── Runtime type guards for untyped Gateway payloads ────────────

function str(val: unknown, fallback = ''): string {
  return typeof val === 'string' ? val : fallback;
}

function num(val: unknown, fallback = 0): number {
  return typeof val === 'number' && !Number.isNaN(val) ? val : fallback;
}

function bool(val: unknown, fallback = false): boolean {
  return typeof val === 'boolean' ? val : fallback;
}

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
        log.debug('Unknown stream:', event.stream);
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
          affinity: num(payload.affinity),
          level: str(payload.level),
        });
        break;

      case 'affinity-milestone':
        this.emit({
          type: 'affinity-milestone',
          milestone: str(payload.milestone),
          message: str(payload.message),
        });
        break;

      case 'emotion-expression':
        this.emit({
          type: 'emotion-expression',
          expression: str(payload.expression),
          intensity: num(payload.intensity),
        });
        break;

      // agent.event / agent and tick are handled elsewhere
      case 'agent.event':
      case 'agent':
      case 'tick':
      case 'connect.challenge':
        break;

      default:
        log.debug('Unhandled event:', event);
    }
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

    // Get or create run state
    let run = this.activeRuns.get(runId);
    if (!run) {
      run = { runId, accumulatedText: '', lastSeq: 0 };
      this.activeRuns.set(runId, run);

      // New run = new message bubble (force-new-message)
      this.emit({ type: 'force-new-message' });
    }

    // Skip duplicate or out-of-order seq
    if (event.seq <= run.lastSeq) {
      log.debug('Skipping duplicate/out-of-order seq', event.seq, '<=', run.lastSeq);
      return;
    }

    const deltaText = str(data.delta);
    if (deltaText) {
      run.accumulatedText += deltaText;
    } else if (data.text) {
      run.accumulatedText = str(data.text);
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
    const phase = str(data.phase);
    const toolName = str(data.name, 'unknown');
    const toolCallId = str(data.toolCallId, event.runId + '-' + event.seq);
    const meta = str(data.meta);
    const isError = bool(data.isError);

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
    const phase = str(event.data.phase);

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
          });
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

      case 'error': {
        // Agent run errored — clean up and notify UI
        const errorRun = this.activeRuns.get(event.runId);
        const partialText = errorRun?.accumulatedText || '';
        this.activeRuns.delete(event.runId);

        // Persist any partial text that was streamed before the error
        if (partialText) {
          this.emit({
            type: 'ai-message-complete',
            text: partialText,
          });
        }

        // Surface the error message to the user
        const errorMessage = str(event.data.message) || str(event.data.error) || 'Agent encountered an error';
        this.emit({
          type: 'error',
          message: errorMessage,
        });

        // End the conversation chain so UI resets from thinking-speaking
        this.emit({
          type: 'control',
          text: 'conversation-chain-end',
        });
        break;
      }

      default:
        log.debug('Unknown lifecycle phase:', phase);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────

  private emit(fields: Partial<GatewayMessageEvent> & { type: string }) {
    // In-place defaults avoid an intermediate spread object on every
    // streaming delta (~30fps). Only `content` needs a default; the
    // remaining MessageEvent fields (`tool_id`, `tool_name`,
    // `name`, `status`) are typed as `string | undefined`.
    const event = fields as GatewayMessageEvent;
    event.content ??= '';
    this.message$.next(event);
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
