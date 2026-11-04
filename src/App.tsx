import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { AppSettings, ViewMode, WorkCategory, WorkItem } from '../shared/types';
import { LIMITS } from '../shared/types';
import { normalizeTimeCode } from '../shared/time';
import { sortItemsForDisplay } from '../shared/sort';
import { createDefaultLanes } from '../shared/lanes';
import { GlassPanel } from './components/GlassPanel';
import { WidgetHeader } from './components/WidgetHeader';
import { WorkItemRow } from './components/WorkItemRow';
import { BoardLane } from './components/BoardLane';
import { CompactView } from './components/CompactView';
import { ManageItemsView } from './components/ManageItemsView';
import { MoreMenu } from './components/MoreMenu';
import { ItemDetailView } from './components/ItemDetailView';
import { RowMenu } from './components/RowMenu';
import { ResizeHandles } from './components/ResizeHandles';

type View = ViewMode | 'manage';

const now = () => new Date().toISOString();

/** 让位 / 落位动画参数：时长稍长、缓动前快后慢，位移收尾更柔和 */
const SHIFT_MS = 260;
const LAND_MS = 220;
const EASE = 'cubic-bezier(0.22, 0.61, 0.36, 1)';
const SHIFT_ANIM_ID = 'wf-shift';

/** 拖拽时命中的落点：办理栏（带插入位置）或左侧待办区。 */
type DropSpot = { kind: 'lane'; laneId: string; index: number } | { kind: 'inbox' };

interface DragSession {
  id: string;
  fromLane: string | null;
  startX: number;
  startY: number;
  dx: number;
  dy: number;
  ghost: HTMLElement;
  origin: HTMLElement;
  spotKey: string | null;
}

interface Landing {
  id: string;
  ghost: HTMLElement;
  /** 提交前的所有卡片位置，用于给其它卡片做让位 FLIP。 */
  before: Map<string, DOMRect>;
  laneId: string | null;
}

/** 把事项放进目标栏 / 待办：换栏时点亮，拖回待办时熄灭。 */
function relocateItem(prev: WorkItem[], id: string, laneId: string | null, index: number): WorkItem[] {
  const from = prev.findIndex((item) => item.id === id);
  if (from < 0) return prev;
  const stamp = new Date().toISOString();
  const next = [...prev];
  const [original] = next.splice(from, 1);
  const moved: WorkItem = {
    ...original,
    laneId,
    status: laneId ? 'active' : 'inactive',
    updatedAt: stamp,
  };

  let insertAt = next.length;
  if (laneId) {
    const laneItems = next.filter((item) => item.laneId === laneId);
    if (index >= 0 && index < laneItems.length) {
      insertAt = next.findIndex((item) => item.id === laneItems[index].id);
    }
  }
  next.splice(insertAt, 0, moved);
  return next.map((item, order) => ({ ...item, order }));
}

export default function App() {
  const [items, setItems] = useState<WorkItem[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    viewMode: 'standard',
    alwaysOnTop: false,
    lanes: createDefaultLanes(),
  });
  const [view, setView] = useState<View>('standard');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropSpot, setDropSpot] = useState<DropSpot | null>(null);
  const [flashLaneId, setFlashLaneId] = useState<string | null>(null);
  const [rowMenu, setRowMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  /** 右键菜单「编辑标题」请求：seq 自增，触发对应行进入行内编辑。 */
  const [editTitleRequest, setEditTitleRequest] = useState<{ id: string; seq: number } | null>(null);
  /** 正在行内编辑的事项：编辑期间冻结排序，确认后再重排。 */
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const loadedRef = useRef(false);
  const boardRef = useRef<HTMLDivElement | null>(null);
  /** 拖动中的实时状态：跟手的幽灵卡片 + 当前落点（ref 避免每帧重渲染）。 */
  const dragRef = useRef<DragSession | null>(null);
  const dropRef = useRef<DropSpot | null>(null);
  /** 松手后的落位动画：幽灵卡片飞向新槽位，其它卡片同步让位。 */
  const landingRef = useRef<Landing | null>(null);
  const flashTimer = useRef<number | null>(null);

  const activeCount = items.filter((item) => item.status === 'active').length;
  const detailItem = detailId ? items.find((item) => item.id === detailId) ?? null : null;

  /** 每个办理栏里的卡片，按 items 数组顺序排列（拖入时决定插入位置）。 */
  const laneItems = useMemo(() => {
    const map = new Map<string, WorkItem[]>();
    settings.lanes.forEach((lane) => map.set(lane.id, []));
    items.forEach((item) => {
      if (!item.laneId) return;
      map.get(item.laneId)?.push(item);
    });
    return map;
  }, [items, settings.lanes]);

  const sortedItems = useMemo(
    () => sortItemsForDisplay(items.filter((item) => item.laneId === null), nowTs),
    [items, nowTs],
  );
  /** 编辑前的稳定顺序，用于编辑期间冻结列表。 */
  const stableOrderRef = useRef<string[]>([]);

  /**
   * 展示顺序：工作在前、生活在后 → 组内置顶 → 组内剩余时间由短到长 → 没填时间的垫底。
   * 有事项正在编辑时保持原顺序不动，等编辑确认（失焦 / Enter）后再重排。
   */
  const displayItems = useMemo(() => {
    if (!editingRowId) return sortedItems;
    const rank = new Map(stableOrderRef.current.map((id, index) => [id, index]));
    return items
      .filter((item) => item.laneId === null)
      .sort((a, b) => {
        const ra = rank.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const rb = rank.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return ra - rb;
      });
  }, [items, sortedItems, editingRowId]);

  const displayOrderKey = displayItems.map((item) => item.id).join('|');

  // 非编辑状态下记住当前顺序，作为下一次"冻结"的基准
  useEffect(() => {
    if (!editingRowId) stableOrderRef.current = sortedItems.map((item) => item.id);
  }, [editingRowId, sortedItems]);

  /** 排序变化时给所有行做位移补间，让"谁挪到哪"看得清。 */
  const prevTopsRef = useRef<Map<string, number>>(new Map());

  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    // 拖拽与落位由拖拽逻辑负责，避免两套位移动画叠加
    if (dragRef.current || landingRef.current) {
      prevTopsRef.current = new Map();
      return;
    }
    const previous = prevTopsRef.current;
    const current = new Map<string, number>();
    board.querySelectorAll<HTMLElement>('[data-item-id]').forEach((el) => {
      const id = el.dataset.itemId;
      if (!id) return;
      const top = el.getBoundingClientRect().top;
      current.set(id, top);
      const before = previous.get(id);
      if (before === undefined) return;
      const delta = before - top;
      if (Math.abs(delta) < 0.5) return;
      el.animate(
        [{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0px)' }],
        { duration: 340, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)' },
      );
    });
    prevTopsRef.current = current;
  }, [displayOrderKey]);

  // 窗口尺寸变化后行位置会重算，重置基准避免下次排序时算错位移
  useEffect(() => {
    const reset = () => {
      prevTopsRef.current = new Map();
    };
    window.addEventListener('resize', reset);
    return () => window.removeEventListener('resize', reset);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void window.workFocus.getAppData().then((data) => {
      if (cancelled) return;
      setItems(data.items);
      setSettings(data.settings);
      setView(data.settings.viewMode);
      loadedRef.current = true;
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // 每 30 秒推进一次“当前时间”，让剩余进度条自动走位
  useEffect(() => {
    const timer = window.setInterval(() => setNowTs(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!loadedRef.current) return;
    void window.workFocus.saveItems(items);
  }, [items]);

  useEffect(() => {
    if (!loadedRef.current) return;
    void window.workFocus.saveSettings(settings);
  }, [settings]);

  useEffect(
    () => () => {
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!loadedRef.current) return;
    void window.workFocus.requestLayout({
      mode: detailId ? 'detail' : view,
      itemCount: items.length + (view === 'manage' && addOpen ? 1 : 0),
      activeCount,
      menuOpen: !detailId && view !== 'manage' && menuOpen,
    });
    // 只按"条目数量/进行中数量/视图"重算窗口，备注输入不触发改尺寸
  }, [view, detailId, items.length, addOpen, menuOpen, activeCount]);

  const toggleItem = (id: string) => {
    const stamp = now();
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const active = item.status === 'active';
        // 在办理栏里熄灭 = 退回待办，保持"在栏里就一定点亮"的规则
        return { ...item, status: active ? 'inactive' : 'active', laneId: active ? null : item.laneId, updatedAt: stamp };
      }),
    );
  };

  const openDetail = (id: string) => {
    setMenuOpen(false);
    setRowMenu(null);
    setDetailId(id);
  };

  const openRowMenu = (id: string, x: number, y: number) => {
    setMenuOpen(false);
    setRowMenu({ id, x, y });
  };

  /** 右键菜单里的「编辑标题」：关掉菜单，直接让该行进入行内编辑（不跳管理页）。 */
  const startInlineEdit = (id: string) => {
    setRowMenu(null);
    setEditTitleRequest((prev) => ({ id, seq: (prev?.seq ?? 0) + 1 }));
  };

  /** 右键菜单里的「置顶 / 取消置顶」：置顶项永远排在自动排序之前。 */
  const toggleItemPin = (id: string) => {
    const stamp = now();
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, pinned: !item.pinned, updatedAt: stamp } : item)));
    setRowMenu(null);
  };

  /** 右键菜单 / 详情页里的「切换标签」：work ↔ life。 */
  const toggleItemCategory = (id: string) => {
    const stamp = now();
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, category: item.category === 'work' ? 'life' : 'work', updatedAt: stamp } : item,
      ),
    );
    setRowMenu(null);
  };

  /** 右键菜单里的「时间格模式」：倒计时 ↔ 正推（自定义内容）。 */
  const toggleItemTimeMode = (id: string) => {
    const stamp = now();
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, timeMode: item.timeMode === 'custom' ? 'countdown' : 'custom', updatedAt: stamp } : item,
      ),
    );
    setRowMenu(null);
  };

  const updateNote = (id: string, note: string) => {
    const clipped = Array.from(note).slice(0, LIMITS.noteMax).join('');
    const stamp = now();
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, note: clipped, updatedAt: stamp } : item)));
  };

  /** 行内“阶段 / 设备”输入，同样即时落盘。 */
  const updateStage = (id: string, stage: string) => {
    const clipped = Array.from(stage).slice(0, LIMITS.stageMax).join('');
    const stamp = now();
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, stage: clipped, updatedAt: stamp } : item)));
  };

  /** 行内时间码（MMDDHH），原始数字落盘，展示时格式化。 */
  const updateTime = (id: string, time: string) => {
    const normalized = normalizeTimeCode(time);
    const stamp = now();
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, time: normalized, updatedAt: stamp } : item)));
  };

  /** 正推模式下的自定义内容，原样落盘（限长）。 */
  const updateTimeText = (id: string, text: string) => {
    const clipped = Array.from(text).slice(0, LIMITS.timeTextMax).join('');
    const stamp = now();
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, timeText: clipped, updatedAt: stamp } : item)));
  };

  const switchMode = (mode: ViewMode) => {
    setSettings((prev) => ({ ...prev, viewMode: mode }));
    setView(mode);
    setDetailId(null);
    setMenuOpen(false);
    setRowMenu(null);
  };

  const togglePin = () => {
    const next = !settings.alwaysOnTop;
    setSettings((prev) => ({ ...prev, alwaysOnTop: next }));
    setMenuOpen(false);
    void window.workFocus.setAlwaysOnTop(next);
  };

  const openManage = (withAddForm = false) => {
    setMenuOpen(false);
    setRowMenu(null);
    setDetailId(null);
    setAddOpen(withAddForm);
    setView('manage');
  };

  const closeManage = () => {
    setAddOpen(false);
    setView(settings.viewMode);
  };

  /** 办理栏改名：限长、去空；名称保存在 settings 里随组件一起落盘。 */
  const renameLane = (id: string, name: string) => {
    const clean = Array.from(name.trim()).slice(0, LIMITS.laneNameMax).join('');
    if (!clean) return;
    setSettings((prev) => ({
      ...prev,
      lanes: prev.lanes.map((lane) => (lane.id === id ? { ...lane, name: clean } : lane)),
    }));
  };

  const updateItem = (id: string, patch: { title?: string; subtitle?: string }) => {
    const stamp = now();
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const title = patch.title !== undefined ? patch.title.trim() : item.title;
        const subtitle = patch.subtitle !== undefined ? patch.subtitle.trim() : item.subtitle;
        if (!title) return item;
        return {
          ...item,
          title: Array.from(title).slice(0, LIMITS.titleMax).join(''),
          subtitle: Array.from(subtitle).slice(0, LIMITS.subtitleMax).join(''),
          updatedAt: stamp,
        };
      }),
    );
  };

  /** 双击办理栏卡片空白处：熄灭并退回待办区，按剩余时间重新参与排序。 */
  const returnToInbox = (id: string) => {
    const stamp = now();
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, laneId: null, status: 'inactive', updatedAt: stamp } : item)),
    );
  };

  /** 分隔条拖动状态：拖动时直接改 DOM 宽度（不触发重渲染），松手后写回设置。 */
  const splitRef = useRef<{
    kind: 'inbox' | 'lane';
    startX: number;
    inboxW: number;
    aId: string;
    bId: string;
    aW: number;
    bW: number;
    inboxEl: HTMLElement | null;
    aEl: HTMLElement | null;
    bEl: HTMLElement | null;
  } | null>(null);

  const beginSplit = (
    event: ReactPointerEvent<HTMLDivElement>,
    kind: 'inbox' | 'lane',
    aId = '',
    bId = '',
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const board = boardRef.current;
    const inboxEl = board?.querySelector<HTMLElement>('[data-inbox]') ?? null;
    const aEl = aId ? board?.querySelector<HTMLElement>(`[data-lane-id="${aId}"]`) ?? null : null;
    const bEl = bId ? board?.querySelector<HTMLElement>(`[data-lane-id="${bId}"]`) ?? null : null;
    splitRef.current = {
      kind,
      startX: event.clientX,
      inboxW: inboxEl?.getBoundingClientRect().width ?? 0,
      aId,
      bId,
      aW: aEl?.getBoundingClientRect().width ?? 0,
      bW: bEl?.getBoundingClientRect().width ?? 0,
      inboxEl,
      aEl,
      bEl,
    };
  };

  const moveSplit = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = splitRef.current;
    if (!state) return;
    const dx = event.clientX - state.startX;
    if (state.kind === 'inbox') {
      const total = boardRef.current?.getBoundingClientRect().width ?? 1160;
      // 给三栏至少留 3*128 + 分隔条，避免把待办区拖到把栏挤没
      const next = Math.min(Math.max(state.inboxW + dx, 300), Math.max(300, total - 430));
      if (state.inboxEl) state.inboxEl.style.flexBasis = `${Math.round(next)}px`;
      return;
    }
    const min = 128;
    // 两栏总宽保持不变，任一侧到下限时另一侧同步停下
    const total = state.aW + state.bW;
    const a = Math.min(Math.max(state.aW + dx, min), total - min);
    const b = total - a;
    if (state.aEl) state.aEl.style.flexBasis = `${Math.round(a)}px`;
    if (state.bEl) state.bEl.style.flexBasis = `${Math.round(b)}px`;
  };

  const endSplit = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = splitRef.current;
    splitRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // 指针已释放时忽略
    }
    if (!state) return;
    if (state.kind === 'inbox') {
      const width = Math.round(state.inboxEl?.getBoundingClientRect().width ?? state.inboxW);
      setSettings((prev) => ({ ...prev, inboxWidth: width }));
      return;
    }
    // 一次记录三栏的实际宽度，避免只存相邻两栏导致重启后布局漂移
    const laneEls = boardRef.current?.querySelectorAll<HTMLElement>('[data-lane-id]');
    const measured = new Map<string, number>();
    laneEls?.forEach((el) => {
      if (el.dataset.laneId) measured.set(el.dataset.laneId, Math.round(el.getBoundingClientRect().width));
    });
    setSettings((prev) => ({
      ...prev,
      lanes: prev.lanes.map((lane) => {
        const width = measured.get(lane.id);
        return width ? { ...lane, width } : lane;
      }),
    }));
  };

  const addItem = (title: string, subtitle: string) => {
    const cleanTitle = Array.from(title.trim()).slice(0, LIMITS.titleMax).join('');
    if (!cleanTitle) return false;
    let added = false;
    setItems((prev) => {
      if (prev.length >= LIMITS.maxItems) return prev;
      added = true;
      const stamp = now();
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          title: cleanTitle,
          subtitle: Array.from(subtitle.trim()).slice(0, LIMITS.subtitleMax).join(''),
          stage: '',
          time: '',
          timeMode: 'countdown' as const,
          timeText: '',
          pinned: false,
          category: 'work' as WorkCategory,
          laneId: null,
          note: '',
          status: 'inactive',
          order: prev.length,
          createdAt: stamp,
          updatedAt: stamp,
        },
      ];
    });
    return added;
  };

  const deleteItem = (id: string) => {
    setDetailId((current) => (current === id ? null : current));
    setRowMenu((current) => (current?.id === id ? null : current));
    setEditingRowId((current) => (current === id ? null : current));
    setItems((prev) => prev.filter((item) => item.id !== id).map((item, index) => ({ ...item, order: index })));
  };

  const moveItem = (id: string, direction: -1 | 1) => {
    setItems((prev) => {
      const index = prev.findIndex((item) => item.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((item, order) => ({ ...item, order, updatedAt: now() }));
    });
  };

  const getCardEl = (id: string): HTMLElement | null =>
    boardRef.current?.querySelector<HTMLElement>(`[data-item-id="${id}"]`) ?? null;

  /** 记录当前所有卡片的屏幕位置，供落位时给其它卡片做让位动画。 */
  const captureRects = (): Map<string, DOMRect> => {
    const map = new Map<string, DOMRect>();
    boardRef.current?.querySelectorAll<HTMLElement>('[data-item-id]').forEach((el) => {
      const id = el.dataset.itemId;
      if (id) map.set(id, el.getBoundingClientRect());
    });
    return map;
  };

  /** 命中检测：指针下的办理栏 / 待办区。办理栏里再按卡片中线算插入位置。 */
  const hitTest = (x: number, y: number, dragItemId: string): DropSpot | null => {
    const under = document.elementFromPoint(x, y);
    if (!under) return null;
    const laneEl = under.closest('[data-lane-id]');
    if (laneEl) {
      const laneId = laneEl.getAttribute('data-lane-id') ?? '';
      const cards = Array.from(laneEl.querySelectorAll<HTMLElement>('[data-item-id]')).filter(
        (el) => el.dataset.itemId !== dragItemId,
      );
      let index = cards.length;
      for (let i = 0; i < cards.length; i += 1) {
        const rect = cards[i].getBoundingClientRect();
        if (y < rect.top + rect.height / 2) {
          index = i;
          break;
        }
      }
      return { kind: 'lane', laneId, index };
    }
    if (under.closest('[data-inbox]')) return { kind: 'inbox' };
    return null;
  };

  /** 指针靠近滚动容器上下边缘时自动滚动，方便长列表里拖拽。 */
  const autoScroll = (x: number, y: number) => {
    const under = document.elementFromPoint(x, y);
    const scroller = under?.closest<HTMLElement>('[data-scroll]');
    if (!scroller) return;
    const rect = scroller.getBoundingClientRect();
    if (y - rect.top < 38) scroller.scrollTop -= 10;
    else if (rect.bottom - y < 38) scroller.scrollTop += 10;
  };

  /** 幽灵卡片回到原位并淡出（落点无效时的取消动画）。 */
  const flyBack = (session: DragSession) => {
    const ghost = session.ghost;
    ghost.style.transform = `translate3d(${session.dx}px, ${session.dy}px, 0) rotate(1.2deg) scale(1.02)`;
    const anim = ghost.animate(
      [
        { transform: ghost.style.transform, opacity: 1 },
        { transform: 'translate3d(0px, 0px, 0) rotate(0deg) scale(1)', opacity: 0.2 },
      ],
      { duration: 200, easing: EASE },
    );
    const cleanup = () => {
      ghost.remove();
      session.origin.style.opacity = '';
      session.origin.style.filter = '';
      session.origin.style.transition = '';
    };
    anim.finished.then(cleanup).catch(cleanup);
  };

  const beginDrag = (id: string, clientX: number, clientY: number) => {
    if (dragRef.current) return;
    const origin = getCardEl(id);
    if (!origin) return;
    const item = items.find((entry) => entry.id === id);
    if (!item) return;

    const rect = origin.getBoundingClientRect();
    const ghost = origin.cloneNode(true) as HTMLElement;
    ghost.removeAttribute('data-item-id');
    ghost.querySelectorAll('input, textarea').forEach((node) => node.remove());
    ghost.classList.remove('is-dragging', 'is-drop-target', 'is-drag-origin');
    ghost.classList.add('drag-ghost');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    document.body.appendChild(ghost);

    // 原卡片保留槽位但淡出；用内联样式，避免被 React 的 className 重渲染覆盖
    origin.style.transition = 'opacity 150ms ease, filter 150ms ease';
    origin.style.opacity = '0.14';
    origin.style.filter = 'saturate(0.55)';

    dragRef.current = {
      id,
      fromLane: item.laneId,
      startX: clientX,
      startY: clientY,
      dx: 0,
      dy: 0,
      ghost,
      origin,
      spotKey: null,
    };
    dropRef.current = null;
    setDragId(id);
    setDropSpot(null);
  };

  const moveDrag = (x: number, y: number) => {
    const session = dragRef.current;
    if (!session) return;

    session.dx = x - session.startX;
    session.dy = y - session.startY;
    session.ghost.style.transform = `translate3d(${session.dx}px, ${session.dy}px, 0) rotate(1.2deg) scale(1.02)`;

    const spot = hitTest(x, y, session.id);
    const key = spot === null ? '' : spot.kind === 'inbox' ? 'inbox' : `lane:${spot.laneId}:${spot.index}`;
    if (key !== session.spotKey) {
      session.spotKey = key;
      dropRef.current = spot;
      setDropSpot(spot);
    }
    autoScroll(x, y);
  };

  const cancelDrag = () => {
    const session = dragRef.current;
    if (!session) return;
    dragRef.current = null;
    dropRef.current = null;
    setDragId(null);
    setDropSpot(null);
    flyBack(session);
  };

  const endDrag = (x?: number, y?: number) => {
    const session = dragRef.current;
    if (!session) return;
    if (x !== undefined && y !== undefined) moveDrag(x, y);

    dragRef.current = null;
    const spot = dropRef.current;
    dropRef.current = null;
    setDragId(null);
    setDropSpot(null);

    // 待办内部拖动没有实际排序意义（待办始终按剩余时间自动排序），直接飞回原位
    if (!spot || (spot.kind === 'inbox' && session.fromLane === null)) {
      flyBack(session);
      return;
    }

    const laneId = spot.kind === 'lane' ? spot.laneId : null;
    const index = spot.kind === 'lane' ? spot.index : -1;
    const before = captureRects();
    prevTopsRef.current = new Map();
    // 先登记落位动画，再提交状态；layout effect 里会拿到新槽位并让幽灵飞过去
    landingRef.current = { id: session.id, ghost: session.ghost, before, laneId };
    setItems((prev) => relocateItem(prev, session.id, laneId, index));

    if (laneId) {
      setFlashLaneId(laneId);
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => {
        setFlashLaneId(null);
        flashTimer.current = null;
      }, 560);
    }
  };

  /**
   * 落入动画：
   * 1. 幽灵从松手位置飞向目标槽位的真实位置（跨栏时同时缩放成目标卡片大小）；
   * 2. 真实卡片先隐藏，等幽灵落稳后再轻微放大淡入；
   * 3. 其它被挤动的卡片按提交前位置做 FLIP 让位。
   */
  useLayoutEffect(() => {
    const landing = landingRef.current;
    if (!landing) return;
    landingRef.current = null;

    const target = getCardEl(landing.id);
    if (!target) {
      landing.ghost.remove();
      return;
    }

    // 真实卡片先隐身：等幽灵落到它的槽位后再接管，避免两张卡重影
    target.style.opacity = '0';
    target.style.filter = '';
    target.style.transition = '';

    const targetRect = target.getBoundingClientRect();
    const baseLeft = parseFloat(landing.ghost.style.left) || 0;
    const baseTop = parseFloat(landing.ghost.style.top) || 0;
    const ghostW = parseFloat(landing.ghost.style.width) || 0;
    const ghostH = parseFloat(landing.ghost.style.height) || 0;

    // 从当前跟手位置直接接管，不重置 transform，避免落位瞬间跳一下
    const fromTransform = landing.ghost.style.transform || 'none';
    // 宽行拖进窄栏时多缩一点，让幽灵接近目标卡片大小，而不是横向溢出到邻栏
    const fitX = ghostW > 0 ? targetRect.width / ghostW : 1;
    const fitY = ghostH > 0 ? targetRect.height / ghostH : 1;
    const scale = Math.max(0.52, Math.min(0.94, Math.min(fitX, fitY)));
    // scale 以中心为原点，补回缩放带来的位置偏移，保证落到目标槽位正中心
    const dx = targetRect.left - baseLeft - (ghostW * (1 - scale)) / 2;
    const dy = targetRect.top - baseTop - (ghostH * (1 - scale)) / 2;
    landing.ghost.style.willChange = 'transform, opacity';

    // 幽灵缩小并淡出飞向槽位，避免把宽行硬拉成窄卡造成的内容挤压
    const flight = landing.ghost.animate(
      [
        { transform: fromTransform, opacity: 1 },
        { transform: `translate3d(${dx}px, ${dy}px, 0) rotate(0deg) scale(${scale})`, opacity: 0 },
      ],
      { duration: LAND_MS, easing: EASE, fill: 'forwards' },
    );
    const settle = () => {
      landing.ghost.remove();
      target.style.opacity = '';
      // 真实卡片接替：从略小、透明到原位弹出
      target.animate(
        [
          { opacity: 0, transform: 'scale(0.94)' },
          { opacity: 1, transform: 'scale(1)' },
        ],
        { duration: 180, easing: EASE },
      );
    };
    flight.finished.then(settle).catch(settle);

    landing.before.forEach((oldRect, otherId) => {
      if (otherId === landing.id) return;
      const el = getCardEl(otherId);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const ox = oldRect.left - rect.left;
      const oy = oldRect.top - rect.top;
      if (Math.abs(ox) < 0.5 && Math.abs(oy) < 0.5) return;
      el.getAnimations().forEach((anim) => {
        if (anim.id === SHIFT_ANIM_ID) anim.cancel();
      });
      el.animate([{ transform: `translate3d(${ox}px, ${oy}px, 0)` }, { transform: 'translate3d(0px, 0px, 0)' }], {
        duration: SHIFT_MS,
        easing: EASE,
        id: SHIFT_ANIM_ID,
      });
    });
    prevTopsRef.current = new Map();
  }, [items]);

  // 拖动期间在 window 上监听：即使指针移到面板外也能继续跟随
  useEffect(() => {
    if (!dragId) return;
    const onMove = (event: PointerEvent) => moveDrag(event.clientX, event.clientY);
    const onUp = (event: PointerEvent) => endDrag(event.clientX, event.clientY);
    const onCancel = () => cancelDrag();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('blur', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('blur', onCancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragId]);

  if (!ready) return null;

  const activeItems = items.filter((item) => item.status === 'active');
  const rowMenuItem = rowMenu ? items.find((item) => item.id === rowMenu.id) ?? null : null;

  return (
    <div className="widget-root">
      <GlassPanel>
        {detailItem ? (
          <ItemDetailView
            item={detailItem}
            onBack={() => setDetailId(null)}
            onToggle={toggleItem}
            onChangeNote={updateNote}
            onToggleCategory={toggleItemCategory}
          />
        ) : view === 'manage' ? (
          <ManageItemsView
            items={items}
            addOpen={addOpen}
            onStartAdd={() => setAddOpen(true)}
            onCancelAdd={() => setAddOpen(false)}
            onAdd={(title, subtitle) => {
              const ok = addItem(title, subtitle);
              if (ok) setAddOpen(false);
              return ok;
            }}
            onUpdate={updateItem}
            onDelete={deleteItem}
            onMove={moveItem}
            onDone={closeManage}
          />
        ) : view === 'compact' ? (
          <CompactView
            items={items}
            activeItems={activeItems}
            pinned={settings.alwaysOnTop}
            menuOpen={menuOpen}
            onToggle={toggleItem}
            onOpen={openDetail}
            onExpand={() => switchMode('standard')}
            onOpenMenu={() => setMenuOpen((open) => !open)}
            onMinimize={() => { void window.workFocus.hideWidget(); }}
          />
        ) : (
          <>
            <WidgetHeader
              variant="standard"
              activeCount={activeItems.length}
              total={items.length}
              pinned={settings.alwaysOnTop}
              menuOpen={menuOpen}
              onTogglePin={togglePin}
              onCollapse={() => switchMode('compact')}
              onOpenMenu={() => setMenuOpen((open) => !open)}
              onMinimize={() => { void window.workFocus.hideWidget(); }}
            />
            <div className="board" ref={boardRef}>
              <section
                className={`board-inbox ${dropSpot?.kind === 'inbox' ? 'is-drop-active' : ''}`}
                data-inbox
                style={settings.inboxWidth ? { flexBasis: `${settings.inboxWidth}px` } : undefined}
              >
                <div className="board-col-head">
                  <span className="board-col-title">待办事件</span>
                  <span className="board-col-count">{displayItems.length}</span>
                  {displayItems.length > 0 ? <span className="board-col-hint">拖到右侧办理</span> : null}
                </div>
                {displayItems.length === 0 ? (
                  <div className={`board-inbox-empty ${items.length === 0 ? 'is-blank' : ''}`}>
                    <div className="board-empty-title">{items.length === 0 ? '还没有事项' : '待办已清空'}</div>
                    <div className="board-empty-desc">
                      {items.length === 0 ? '添加一项，再拖进右侧办理栏。' : '从右侧拖回卡片，或到管理里添加新事项。'}
                    </div>
                    {items.length === 0 ? (
                      <button type="button" className="empty-action" onClick={() => openManage(true)}>
                        添加事项
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <div className="item-list board-inbox-list" data-scroll>
                    {displayItems.map((item) => (
                      <WorkItemRow
                        key={item.id}
                        item={item}
                        onToggle={toggleItem}
                        onOpen={openDetail}
                        onRename={updateItem}
                        onStageChange={updateStage}
                        onTimeChange={updateTime}
                        onTimeTextChange={updateTimeText}
                        onContextMenu={openRowMenu}
                        editTitleSeq={editTitleRequest?.id === item.id ? editTitleRequest.seq : 0}
                        onEditingChange={(active) => setEditingRowId(active ? item.id : null)}
                        now={nowTs}
                        onDragBegin={beginDrag}
                        onDragEnd={cancelDrag}
                        dragging={dragId === item.id}
                        dropTarget={false}
                      />
                    ))}
                  </div>
                )}
              </section>

              <div
                className="board-split"
                role="separator"
                aria-orientation="vertical"
                aria-label="拖动调整待办区宽度"
                onPointerDown={(event) => beginSplit(event, 'inbox')}
                onPointerMove={moveSplit}
                onPointerUp={endSplit}
                onPointerCancel={endSplit}
              />

              <div className="board-lanes">
                {settings.lanes.map((lane, index) => {
                  const laneList = laneItems.get(lane.id) ?? [];
                  const laneSpot = dropSpot?.kind === 'lane' && dropSpot.laneId === lane.id ? dropSpot : null;
                  const next = settings.lanes[index + 1];
                  return (
                    <Fragment key={lane.id}>
                      <BoardLane
                        lane={lane}
                        items={laneList}
                        now={nowTs}
                        flexBasis={lane.width}
                        dropActive={Boolean(laneSpot)}
                        landed={flashLaneId === lane.id}
                        dropItemId={laneSpot ? laneList[laneSpot.index]?.id ?? null : null}
                        draggingId={dragId}
                        editTitleRequest={editTitleRequest}
                        onRenameLane={renameLane}
                        onToggle={toggleItem}
                        onOpen={openDetail}
                        onRename={updateItem}
                        onStageChange={updateStage}
                        onTimeChange={updateTime}
                        onTimeTextChange={updateTimeText}
                        onReturn={returnToInbox}
                        onContextMenu={openRowMenu}
                        onDragBegin={beginDrag}
                      />
                      {next ? (
                        <div
                          className="board-split"
                          role="separator"
                          aria-orientation="vertical"
                          aria-label={`拖动调整「${lane.name}」宽度`}
                          onPointerDown={(event) => beginSplit(event, 'lane', lane.id, next.id)}
                          onPointerMove={moveSplit}
                          onPointerUp={endSplit}
                          onPointerCancel={endSplit}
                        />
                      ) : null}
                    </Fragment>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {menuOpen && !detailItem && view !== 'manage' ? (
          <MoreMenu
            viewMode={view}
            pinned={settings.alwaysOnTop}
            onManage={() => openManage(false)}
            onToggleMode={() => switchMode(view === 'compact' ? 'standard' : 'compact')}
            onTogglePin={togglePin}
            onHide={() => {
              setMenuOpen(false);
              void window.workFocus.hideWidget();
            }}
            onQuit={() => void window.workFocus.quitApp()}
            onClose={() => setMenuOpen(false)}
          />
        ) : null}
      </GlassPanel>

      {rowMenu && rowMenuItem ? (
        <RowMenu
          x={rowMenu.x}
          y={rowMenu.y}
          title={rowMenuItem.title}
          pinned={rowMenuItem.pinned}
          category={rowMenuItem.category}
          timeMode={rowMenuItem.timeMode}
          onEdit={() => startInlineEdit(rowMenu.id)}
          onDelete={() => deleteItem(rowMenu.id)}
          onTogglePin={() => toggleItemPin(rowMenu.id)}
          onToggleCategory={() => toggleItemCategory(rowMenu.id)}
          onToggleTimeMode={() => toggleItemTimeMode(rowMenu.id)}
          onClose={() => setRowMenu(null)}
        />
      ) : null}

      <ResizeHandles />
    </div>
  );
}
