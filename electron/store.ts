import fs from 'node:fs';
import path from 'node:path';
import type { AppData, AppSettings, Lane, TaskStatus, TimeMode, ViewMode, WorkCategory, WorkItem } from '../shared/types';
import { LIMITS } from '../shared/types';
import { createDefaultData } from '../shared/defaults';
import { sanitizeLanes } from '../shared/lanes';
import { normalizeTimeCode } from '../shared/time';

const FILE_NAME = 'work-focus.json';

function toCodePoints(value: string): string[] {
  return Array.from(value);
}

function truncate(value: string, max: number): string {
  const points = toCodePoints(value.trim());
  return points.length > max ? points.slice(0, max).join('') : points.join('');
}

function isStatus(value: unknown): value is TaskStatus {
  return value === 'active' || value === 'inactive';
}

function isCategory(value: unknown): value is WorkCategory {
  return value === 'work' || value === 'life';
}

function isTimeMode(value: unknown): value is TimeMode {
  return value === 'countdown' || value === 'custom';
}

function isViewMode(value: unknown): value is ViewMode {
  return value === 'standard' || value === 'compact';
}

function isValidDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

/** 校验并清洗任务数组：丢弃非法项、去重 ID、重排 order、限制数量与长度。 */
function sanitizeItems(input: unknown, lanes: Lane[]): WorkItem[] {
  if (!Array.isArray(input)) {
    throw new Error('items is not an array');
  }

  const laneIds = new Set(lanes.map((lane) => lane.id));
  const now = new Date().toISOString();
  const seen = new Set<string>();
  const clean: WorkItem[] = [];

  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;

    const title = typeof item.title === 'string' ? truncate(item.title, LIMITS.titleMax) : '';
    if (!title) continue;

    let id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : '';
    if (!id || seen.has(id)) id = crypto.randomUUID();
    seen.add(id);

    const subtitle = typeof item.subtitle === 'string' ? truncate(item.subtitle, LIMITS.subtitleMax) : '';
    const stage = typeof item.stage === 'string' ? truncate(item.stage, LIMITS.stageMax) : '';
    const time = typeof item.time === 'string' ? normalizeTimeCode(item.time) : '';
    const timeMode: TimeMode = isTimeMode(item.timeMode) ? item.timeMode : 'countdown';
    const timeText = typeof item.timeText === 'string' ? truncate(item.timeText, LIMITS.timeTextMax) : '';
    const pinned = item.pinned === true;
    const category: WorkCategory = isCategory(item.category) ? item.category : 'work';
    const laneId = typeof item.laneId === 'string' && laneIds.has(item.laneId) ? item.laneId : null;
    const note = typeof item.note === 'string' ? toCodePoints(item.note).slice(0, LIMITS.noteMax).join('') : '';
    const status: TaskStatus = isStatus(item.status) ? item.status : 'inactive';
    const order = typeof item.order === 'number' && Number.isFinite(item.order) ? item.order : clean.length;

    clean.push({
      id,
      title,
      subtitle,
      stage,
      time,
      timeMode,
      timeText,
      pinned,
      category,
      laneId,
      note,
      status,
      order,
      createdAt: isValidDate(item.createdAt) ? item.createdAt : now,
      updatedAt: isValidDate(item.updatedAt) ? item.updatedAt : now,
    });
  }

  clean.sort((a, b) => a.order - b.order);
  return clean.slice(0, LIMITS.maxItems).map((item, index) => ({ ...item, order: index }));
}

function sanitizeSettings(input: unknown, previous?: AppSettings): AppSettings {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const placementRaw = raw.windowPlacement as Record<string, unknown> | undefined;
  const placement =
    placementRaw && Number.isFinite(placementRaw.x) && Number.isFinite(placementRaw.y)
      ? {
          x: Number(placementRaw.x),
          y: Number(placementRaw.y),
          displayId: typeof placementRaw.displayId === 'string' ? placementRaw.displayId : undefined,
        }
      : previous?.windowPlacement;

  const sizeRaw = raw.windowSize as Record<string, unknown> | undefined;
  const size =
    sizeRaw && Number.isFinite(sizeRaw.width) && Number.isFinite(sizeRaw.height)
      ? { width: Number(sizeRaw.width), height: Number(sizeRaw.height) }
      : previous?.windowSize;

  return {
    viewMode: isViewMode(raw.viewMode) ? raw.viewMode : previous?.viewMode ?? 'standard',
    alwaysOnTop: typeof raw.alwaysOnTop === 'boolean' ? raw.alwaysOnTop : previous?.alwaysOnTop ?? false,
    lanes: sanitizeLanes(raw.lanes, previous?.lanes),
    inboxWidth:
      typeof raw.inboxWidth === 'number' && Number.isFinite(raw.inboxWidth)
        ? Math.min(Math.max(Number(raw.inboxWidth), 300), 620)
        : previous?.inboxWidth,
    windowPlacement: placement,
    windowSize: size,
  };
}

export interface LoadResult {
  data: AppData;
  recovered: boolean;
  backupPath?: string;
}

export class Store {
  private readonly filePath: string;
  private readonly tmpPath: string;
  private data: AppData;
  private writeTimer: NodeJS.Timeout | null = null;
  private dirty = false;

  constructor(userDataDir: string) {
    this.filePath = path.join(userDataDir, FILE_NAME);
    this.tmpPath = `${this.filePath}.tmp`;
    this.data = createDefaultData();
  }

  load(): LoadResult {
    if (!fs.existsSync(this.filePath)) {
      this.data = createDefaultData();
      this.writeNow();
      return { data: this.data, recovered: false };
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as Record<string, unknown>;
      const settings = sanitizeSettings(parsed.settings);
      const items = sanitizeItems(parsed.items, settings.lanes);
      this.data = { schemaVersion: 1, items, settings };
      return { data: this.data, recovered: false };
    } catch (error) {
      // 读取失败：保留损坏文件的备份，回退到示例数据，绝不静默清空用户数据。
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(path.dirname(this.filePath), `work-focus.corrupt-${stamp}.json`);
      try {
        fs.copyFileSync(this.filePath, backupPath);
      } catch {
        /* 备份失败不阻断启动 */
      }
      console.error('[store] 读取本地数据失败，已备份原文件：', error);
      this.data = createDefaultData();
      this.writeNow();
      return { data: this.data, recovered: true, backupPath };
    }
  }

  getData(): AppData {
    return this.data;
  }

  setItems(items: WorkItem[]): AppData {
    this.data = { ...this.data, items: sanitizeItems(items, this.data.settings.lanes) };
    this.markDirty();
    return this.data;
  }

  setSettings(settings: AppSettings): AppData {
    this.data = { ...this.data, settings };
    this.markDirty();
    return this.data;
  }

  /** 仅更新窗口位置，避免高频交互影响其它设置。 */
  updatePlacement(placement: AppData['settings']['windowPlacement']): void {
    if (!placement) return;
    this.data = { ...this.data, settings: { ...this.data.settings, windowPlacement: placement } };
    this.markDirty();
  }

  /** 记录用户手动拖动边缘后的窗口尺寸。 */
  updateWindowSize(size: { width: number; height: number }): void {
    this.data = { ...this.data, settings: { ...this.data.settings, windowSize: size } };
    this.markDirty();
  }

  private markDirty(): void {
    this.dirty = true;
    if (this.writeTimer) return;
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      this.flush();
    }, 120);
  }

  flush(): void {
    if (!this.dirty) return;
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    this.writeNow();
  }

  private writeNow(): void {
    this.dirty = false;
    const payload = `${JSON.stringify(this.data, null, 2)}\n`;
    try {
      fs.writeFileSync(this.tmpPath, payload, 'utf8');
      fs.renameSync(this.tmpPath, this.filePath);
    } catch (error) {
      console.error('[store] 写入本地数据失败：', error);
    }
  }
}
