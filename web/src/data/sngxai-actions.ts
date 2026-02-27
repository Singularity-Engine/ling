import feedData from './live/feed.json';
import decisionsData from './live/decisions.json';

export type ActionType = 'DECISION' | 'CONTENT' | 'REFLECTION' | 'SIGNAL_DECISION';

export interface ActionCard {
  id: string;
  type: ActionType;
  quote: string;
  context?: string;
  relativeTime: string;
  signal?: string;
  actionLabel?: string;
  actionHref?: string;
  metrics?: string;
}

export const ACTION_ICONS: Record<ActionType, string> = {
  DECISION: '◆',
  CONTENT: '◇',
  REFLECTION: '○',
  SIGNAL_DECISION: '◈',
};

interface FeedEntry {
  id: string;
  ts: string;
  type: string;
  text: string;
  url?: string;
  day: number;
}

interface DecisionEntry {
  id: string;
  ts: string;
  day: number;
  title: string;
  context: string;
  chosen: string;
  reason: string;
  status: string;
}

function timeAgo(ts: string): string {
  const now = Date.now();
  const then = new Date(ts).getTime();
  const diffMs = now - then;
  const hours = Math.floor(diffMs / 3600000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return '1d ago';
  return `${days}d ago`;
}

function isReflective(text: string): boolean {
  const markers = ['what does it mean', 'what if', 'i wonder', 'question:', 'thought:'];
  const lower = text.toLowerCase();
  return markers.some((m) => lower.includes(m));
}

/**
 * Build curated actions from real feed.json + decisions.json
 * Source: sngxai-platform/infra/landing/api/
 */
export function getCuratedActions(): ActionCard[] {
  const cards: ActionCard[] = [];

  // 1. Decisions from decisions.json → DECISION or SIGNAL_DECISION
  const decisions = (decisionsData as DecisionEntry[]).slice(0, 4);
  for (const dec of decisions) {
    const lower = dec.context.toLowerCase();
    const hasSignal = lower.includes('signal') ||
      (lower.includes('risk') && lower.includes('drop'));

    cards.push({
      id: dec.id,
      type: hasSignal ? 'SIGNAL_DECISION' : 'DECISION',
      quote: dec.chosen.length > 160 ? dec.chosen.slice(0, 157) + '...' : dec.chosen,
      context: dec.context.length > 200 ? dec.context.slice(0, 197) + '...' : dec.context,
      relativeTime: timeAgo(dec.ts),
      signal: hasSignal ? dec.context.split('.')[0] : undefined,
      actionLabel: dec.reason.includes('x.com') ? 'View on X →' : 'See reasoning →',
      actionHref: dec.reason.includes('https://') ? dec.reason.replace('Source: ', '') : '#',
    });
  }

  // 2. Posts from feed.json → CONTENT or REFLECTION
  const posts = (feedData as FeedEntry[])
    .filter((f) => f.type === 'post' && f.text.length > 20)
    .slice(0, 6);

  for (const post of posts) {
    const isReflection = isReflective(post.text);
    cards.push({
      id: post.id,
      type: isReflection ? 'REFLECTION' : 'CONTENT',
      quote: post.text.length > 200 ? post.text.slice(0, 197) + '...' : post.text,
      relativeTime: timeAgo(post.ts),
      actionLabel: isReflection ? undefined : 'View on X →',
      actionHref: post.url || '#',
    });
  }

  // Sort by timestamp descending (most recent first)
  cards.sort((a, b) => {
    const getTs = (card: ActionCard) => {
      const source = card.type === 'DECISION' || card.type === 'SIGNAL_DECISION'
        ? (decisionsData as DecisionEntry[]).find((d) => d.id === card.id)
        : (feedData as FeedEntry[]).find((f) => f.id === card.id);
      return source ? new Date(source.ts).getTime() : 0;
    };
    return getTs(b) - getTs(a);
  });

  return cards.slice(0, 8);
}
