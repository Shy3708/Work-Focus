export type TaskStatus = 'active' | 'inactive';
export type ViewMode = 'standard' | 'compact';
export type LayoutMode = ViewMode | 'manage' | 'detail';
/** 事项标签：默认"工作"（蓝色系），可选"生活"（淡绿色系）。 */
export type WorkCategory = 'work' | 'life';
/**
 * 时间格模式：二选一。
 * - countdown：倒计时，按 time 时间码算剩余时长并画进度条；
 * - custom：正推，不做倒计时，显示 timeText 里的自定义内容。
 */
export type TimeMode = 'countdown' | 'custom';

/** 办理栏：一类办理方式，名称可由用户双击修改。 */
export interface Lane {
  id: string;
  name: string;
  /** 用户拖动分栏边界后的宽度（px）；缺省时三栏等分。 */
  width?: number;
}

export interface WorkItem {
  id: string;
  title: string;
  subtitle: string;
  /** 当前阶段 / 运行设备，例如"联调中 · 台式机"。 */
  stage: string;
  /** 6 位时间码 MMDDHH（如 110202 展示为 11月2日2点），空串表示未填。 */
  time: string;
  /** 时间格模式：倒计时 / 正推（自定义内容）。 */
  timeMode: TimeMode;
  /** 正推模式下的自定义内容，例如"第 3 周""持续中"。 */
  timeText: string;
  /** 手动置顶：永远排在自动排序之前。 */
  pinned: boolean;
  /** 事项标签：工作 / 生活；决定行上的装饰色。 */
  category: WorkCategory;
  /** 所在办理栏；null 表示还在左侧待办区。 */
  laneId: string | null;
  note: string;
  status: TaskStatus;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface WindowPlacement {
  x: number;
  y: number;
  displayId?: string;
}

export interface WindowSize {
  width: number;
  height: number;
}

export interface AppSettings {
  viewMode: ViewMode;
  alwaysOnTop: boolean;
  /** 办理栏（默认三栏，名称可编辑）。 */
  lanes: Lane[];
  /** 用户拖动分隔条后的待办区宽度（px）；缺省按内容自适应。 */
  inboxWidth?: number;
  windowPlacement?: WindowPlacement;
  /** 用户手动拖动边缘调整过的窗口尺寸；存在时不再按内容自动改变大小。 */
  windowSize?: WindowSize;
}

export interface AppData {
  schemaVersion: 1;
  items: WorkItem[];
  settings: AppSettings;
}

export interface LayoutRequest {
  mode: LayoutMode;
  itemCount: number;
  activeCount: number;
  menuOpen?: boolean;
}

export const LIMITS = {
  maxItems: 12,
  titleMax: 40,
  subtitleMax: 80,
  stageMax: 60,
  noteMax: 4000,
  timeTextMax: 24,
  laneCount: 3,
  laneNameMax: 12,
} as const;

export type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export interface ResizePayload {
  edge: ResizeEdge;
  phase: 'start' | 'move' | 'end';
  screenX: number;
  screenY: number;
}

export interface TrayMenuState {
  alwaysOnTop: boolean;
  visible: boolean;
}

export type TrayMenuAction = 'toggle-window' | 'toggle-always-on-top' | 'quit';

export interface WorkFocusBridge {
  getAppData(): Promise<AppData>;
  saveItems(items: WorkItem[]): Promise<void>;
  saveSettings(settings: AppSettings): Promise<void>;
  setAlwaysOnTop(enabled: boolean): Promise<void>;
  setViewMode(mode: ViewMode): Promise<void>;
  requestLayout(request: LayoutRequest): Promise<void>;
  resizeWindow(payload: ResizePayload): Promise<void>;
  hideWidget(): Promise<void>;
  quitApp(): Promise<void>;
  getTrayMenuState(): Promise<TrayMenuState>;
  trayMenuAction(action: TrayMenuAction): Promise<void>;
  closeTrayMenu(): Promise<void>;
}
