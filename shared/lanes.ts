import type { Lane } from './types';
import { LIMITS } from './types';

/** 默认三栏办理方式；id 固定，用户只改名称，历史数据升级后也能对号入座。 */
export const DEFAULT_LANES: readonly Lane[] = [
  { id: 'lane-self', name: '自己办理' },
  { id: 'lane-other', name: '委托他人' },
  { id: 'lane-wait', name: '等待反馈' },
];

export function createDefaultLanes(): Lane[] {
  return DEFAULT_LANES.map((lane) => ({ ...lane }));
}

/** 清洗办理栏：限长、去重、最多三栏；缺失时用默认栏补齐，保证看板始终可用。 */
export function sanitizeLanes(input: unknown, fallback?: Lane[]): Lane[] {
  const raw = Array.isArray(input) ? input : [];
  const source = raw.length > 0 ? raw : fallback ?? DEFAULT_LANES;
  const seen = new Set<string>();
  const clean: Lane[] = [];

  for (const entry of source) {
    if (!entry || typeof entry !== 'object') continue;
    const lane = entry as Record<string, unknown>;
    const id = typeof lane.id === 'string' ? lane.id.trim() : '';
    const name =
      typeof lane.name === 'string' ? Array.from(lane.name.trim()).slice(0, LIMITS.laneNameMax).join('') : '';
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    const width = typeof lane.width === 'number' && Number.isFinite(lane.width) ? Math.min(Math.max(lane.width, 120), 620) : undefined;
    clean.push(width ? { id, name, width } : { id, name });
    if (clean.length >= LIMITS.laneCount) break;
  }

  for (const lane of DEFAULT_LANES) {
    if (clean.length >= LIMITS.laneCount) break;
    if (seen.has(lane.id)) continue;
    seen.add(lane.id);
    clean.push({ ...lane });
  }

  return clean.slice(0, LIMITS.laneCount);
}
