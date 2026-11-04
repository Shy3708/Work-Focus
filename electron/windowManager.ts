import { screen, type BrowserWindow, type Rectangle } from 'electron';
import { LIMITS } from '../shared/types';
import type { LayoutRequest, WindowPlacement } from '../shared/types';

/**
 * 布局常量与 src/styles/widget.css 中的尺寸严格对应（单位 DIP / CSS 像素）。
 */
export const LAYOUT = {
  margin: 12,
  windowWidth: 560,
  panelPad: 18,
  headerHeight: 62,
  manageHeaderHeight: 52,
  rowHeight: 52,
  rowGap: 8,
  emptyBlockHeight: 96,
  compactRowHeight: 40,
  compactRowGap: 6,
  compactEmptyHeight: 56,
  compactOverflowLine: 24,
  manageRowHeight: 64,
  manageRowGap: 6,
  manageAddHeight: 32,
  manageAddGap: 12,
  minVisibleGap: 8,
  edgeOffset: 24,
  menuTop: 84,
  menuHeight: 181,
  menuBottomGap: 8,
  /** 看板：左侧待办 + 右侧三列办理栏 */
  boardWidth: 1160,
  boardMinBody: 360,
  /** 看板顶部的「待办事件 / 栏名」表头高度（含下方间距） */
  boardHead: 43,
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function computeWindowSize(request: LayoutRequest): { width: number; height: number } {
  const L = LAYOUT;
  const count = clamp(Math.trunc(request.itemCount), 0, LIMITS.maxItems);
  const active = clamp(Math.trunc(request.activeCount), 0, LIMITS.maxItems);
  let body: number;

  if (request.mode === 'compact') {
    const shown = Math.min(active, 2);
    body = shown === 0 ? L.compactEmptyHeight : shown * L.compactRowHeight + (shown - 1) * L.compactRowGap;
    if (active > 2) body += L.compactRowGap + L.compactOverflowLine;
    return withMenuSpace({ width: L.windowWidth, height: body + L.panelPad * 2 + L.headerHeight + L.margin * 2 }, request);
  }

  // 详情页高度固定：标题 + 副标题 + 备注区（备注区用剩余空间，窗口可再手动拉大）
  if (request.mode === 'detail') {
    return { width: L.windowWidth, height: 368 };
  }

  if (request.mode === 'manage') {
    body = count === 0 ? 0 : count * L.manageRowHeight + (count - 1) * L.manageRowGap;
    body += (count === 0 ? 0 : L.manageAddGap) + L.manageAddHeight;
    return withMenuSpace({ width: L.windowWidth, height: body + L.panelPad * 2 + L.manageHeaderHeight + L.margin * 2 }, request);
  }

  body =
    Math.max(count === 0 ? L.emptyBlockHeight : count * L.rowHeight + (count - 1) * L.rowGap, L.boardMinBody) +
    L.boardHead;
  return withMenuSpace({ width: L.boardWidth, height: body + L.panelPad * 2 + L.headerHeight + L.margin * 2 }, request);
}

/** 菜单弹出时窗口若太矮，向下临时增高，保证菜单不被窗口边界裁切。 */
function withMenuSpace(size: { width: number; height: number }, request: LayoutRequest): { width: number; height: number } {
  if (!request.menuOpen) return size;
  const needed = LAYOUT.margin + LAYOUT.menuTop + LAYOUT.menuHeight + LAYOUT.menuBottomGap;
  return { width: size.width, height: Math.max(size.height, needed) };
}

export function initialBounds(size: { width: number; height: number }): Rectangle {
  const display = screen.getPrimaryDisplay();
  const area = display.workArea;
  return {
    x: area.x + area.width - size.width - LAYOUT.edgeOffset,
    y: area.y + LAYOUT.edgeOffset,
    width: size.width,
    height: Math.min(size.height, area.height - LAYOUT.edgeOffset * 2),
  };
}

function intersects(bounds: Rectangle, area: Rectangle): boolean {
  const overlapX = Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x);
  const overlapY = Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y);
  return overlapX > 64 && overlapY > 64;
}

export function isVisibleOnAnyDisplay(bounds: Rectangle): boolean {
  return screen.getAllDisplays().some((display) => intersects(bounds, display.workArea));
}

export function restorePlacement(size: { width: number; height: number }, placement?: WindowPlacement): Rectangle {
  if (!placement) return initialBounds(size);

  const bounds: Rectangle = { x: placement.x, y: placement.y, width: size.width, height: size.height };
  if (!isVisibleOnAnyDisplay(bounds)) return initialBounds(size);

  const area = screen.getDisplayMatching(bounds).workArea;
  let x = clamp(bounds.x, area.x - 24, area.x + area.width - 96);
  // 窗口从旧版窄栏升级到看板宽度后，右边缘可能跑出屏幕：优先保证整窗可见
  if (x + size.width > area.x + area.width - 8) {
    x = Math.max(area.x + 8, area.x + area.width - size.width - 8);
  }
  return {
    x,
    y: clamp(bounds.y, area.y - 24, area.y + area.height - 96),
    width: size.width,
    height: Math.min(size.height, area.height - LAYOUT.edgeOffset * 2),
  };
}

/** 按新的内容尺寸调整窗口，同时让窗口保持在工作区内。 */
export function applyLayout(win: BrowserWindow, request: LayoutRequest): Rectangle {
  const target = computeWindowSize(request);
  const current = win.getBounds();
  const area = screen.getDisplayMatching(current).workArea;
  const height = Math.min(target.height, area.height - LAYOUT.edgeOffset * 2);

  let x = current.x;
  let y = current.y;

  // 宽度固定，保持右边缘不变（面板从右上角展开）
  const right = current.x + current.width;
  x = Math.round(right - target.width);
  x = clamp(x, area.x + LAYOUT.minVisibleGap, area.x + area.width - target.width - LAYOUT.minVisibleGap);

  if (y + height > area.y + area.height - LAYOUT.minVisibleGap) {
    y = area.y + area.height - height - LAYOUT.minVisibleGap;
  }
  if (y < area.y + LAYOUT.minVisibleGap) y = area.y + LAYOUT.minVisibleGap;

  const bounds: Rectangle = { x, y, width: target.width, height };
  win.setBounds(bounds);
  return bounds;
}

/** 显示器变化后，如果窗口已经不可见，则拉回主显示器右上角。 */
export function ensureVisible(win: BrowserWindow): void {
  const bounds = win.getBounds();
  if (isVisibleOnAnyDisplay(bounds)) return;
  const size = { width: bounds.width, height: bounds.height };
  win.setBounds(initialBounds(size));
}
