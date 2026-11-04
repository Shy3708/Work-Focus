import type { WorkItem } from './types';
import { resolveTimeCode } from './time';

/** 剩余毫秒；没填时间、时间码非法或处于"正推"（自定义）模式时返回 null。 */
export function remainingMs(item: WorkItem, now: number): number | null {
  if (item.timeMode === 'custom') return null;
  if (!item.time) return null;
  const due = resolveTimeCode(item.time, new Date(now));
  return due ? due.getTime() - now : null;
}

/**
 * 展示顺序：
 * 1. 标签分组：工作（work）整体在上，生活（life）整体在下；
 * 2. 组内手动置顶的排前面；
 * 3. 组内有时间的按剩余时长由短到长（已过期 = 剩余最少，排最前）；
 * 4. 组内没填时间的、以及"正推"（自定义时间内容）的排在最后；
 * 5. 同档位用 order 兜底，保证稳定。
 */
export function sortItemsForDisplay(items: WorkItem[], now: number): WorkItem[] {
  return [...items].sort((a, b) => {
    if (a.category !== b.category) return a.category === 'work' ? -1 : 1;
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const ra = remainingMs(a, now);
    const rb = remainingMs(b, now);
    if (ra === null && rb === null) return a.order - b.order;
    if (ra === null) return 1;
    if (rb === null) return -1;
    if (ra !== rb) return ra - rb;
    return a.order - b.order;
  });
}
