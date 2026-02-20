import type { IconType } from "react-icons";
import {
  LuSearch, LuSparkles, LuBrain, LuPenLine, LuCloudSun,
  LuMapPin, LuCode, LuGithub, LuMic, LuFileText,
  LuBookOpen, LuStar,
} from "react-icons/lu";

export interface SkillMeta {
  key: string;
  icon: IconType;
  label: { en: string; zh: string };
  color: string;
  tags: string[];
}

// Tool name → normalized key
const TOOL_TO_KEY: Record<string, string> = {
  'web_search': 'search', 'brave_search': 'search',
  'openai-image-gen': 'create',
  'memory_search': 'memory', 'memory_store': 'memory',
  'prose': 'writing', 'summarize': 'writing',
  'weather': 'weather',
  'goplaces': 'places', 'local-places': 'places',
  'coding-agent': 'code',
  'github': 'github',
  'nano-pdf': 'docs', 'nano-banana-pro': 'reason',
  'openai-whisper-api': 'listen',
  'notion': 'notion',
};

const SKILL_META: Record<string, SkillMeta> = {
  search:  { key: 'search',  icon: LuSearch,   label: { en: 'Search',  zh: '搜索' },   color: '#60a5fa', tags: ['learning', 'life'] },
  create:  { key: 'create',  icon: LuSparkles, label: { en: 'Create',  zh: '创作' },   color: '#f472b6', tags: ['creative', 'fun'] },
  memory:  { key: 'memory',  icon: LuBrain,    label: { en: 'Memory',  zh: '记忆' },   color: '#a78bfa', tags: ['all'] },
  writing: { key: 'writing', icon: LuPenLine,  label: { en: 'Writing', zh: '写作' },   color: '#34d399', tags: ['creative', 'work'] },
  weather: { key: 'weather', icon: LuCloudSun, label: { en: 'Weather', zh: '天气' },   color: '#facc15', tags: ['life'] },
  places:  { key: 'places',  icon: LuMapPin,   label: { en: 'Places',  zh: '地点' },   color: '#fb923c', tags: ['life', 'fun'] },
  code:    { key: 'code',    icon: LuCode,     label: { en: 'Code',    zh: '编程' },   color: '#10b981', tags: ['tech'] },
  github:  { key: 'github',  icon: LuGithub,   label: { en: 'GitHub',  zh: 'GitHub' }, color: '#e2e8f0', tags: ['tech'] },
  docs:    { key: 'docs',    icon: LuFileText, label: { en: 'Docs',    zh: '文档' },   color: '#38bdf8', tags: ['learning', 'work'] },
  reason:  { key: 'reason',  icon: LuBookOpen, label: { en: 'Reason',  zh: '推理' },   color: '#c084fc', tags: ['learning', 'tech'] },
  listen:  { key: 'listen',  icon: LuMic,      label: { en: 'Listen',  zh: '听觉' },   color: '#fbbf24', tags: ['all'] },
  notion:  { key: 'notion',  icon: LuFileText, label: { en: 'Notion',  zh: 'Notion' }, color: '#f1f1f0', tags: ['work'] },
};

const DEFAULT_META: SkillMeta = {
  key: 'unknown', icon: LuStar,
  label: { en: 'Skill', zh: '技能' },
  color: '#8b5cf6', tags: [],
};

export function getSkillKey(toolName: string): string {
  const lower = toolName.toLowerCase();
  if (TOOL_TO_KEY[lower]) return TOOL_TO_KEY[lower];
  // Fuzzy match
  if (/search|brave|web|google/.test(lower)) return 'search';
  if (/weather/.test(lower)) return 'weather';
  if (/memory|remember|recall|evermem/.test(lower)) return 'memory';
  if (/code|exec|run|python|node/.test(lower)) return 'code';
  if (/image|paint|draw|gen/.test(lower)) return 'create';
  return 'unknown';
}

export function getSkillMeta(toolName: string): SkillMeta {
  const key = getSkillKey(toolName);
  return SKILL_META[key] || DEFAULT_META;
}

export function getMetaByKey(key: string): SkillMeta {
  return SKILL_META[key] || DEFAULT_META;
}

export function getSkillsByTags(tags: string[]): SkillMeta[] {
  return Object.values(SKILL_META).filter(meta =>
    meta.tags.some(t => t === 'all' || tags.includes(t))
  );
}

export function getAllSkillMetas(): SkillMeta[] {
  return Object.values(SKILL_META);
}
