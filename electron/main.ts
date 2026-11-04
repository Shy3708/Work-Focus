import { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, screen } from 'electron';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { Store } from './store';
import { sanitizeLanes } from '../shared/lanes';
import {
  applyLayout,
  computeWindowSize,
  ensureVisible,
  restorePlacement,
} from './windowManager';
import type {
  AppSettings,
  LayoutRequest,
  ResizeEdge,
  ResizePayload,
  TrayMenuAction,
  ViewMode,
  WorkItem,
} from '../shared/types';
import { LIMITS } from '../shared/types';

let mainWindow: BrowserWindow | null = null;
let trayMenuWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let store: Store;
let isQuitting = false;
let moveSaveTimer: NodeJS.Timeout | null = null;
/** 当前窗口是否为「紧凑小卡片」尺寸；从紧凑展开时用来还原用户手动调过的看板尺寸。 */
let compactWindow = false;

/** 窗口最小尺寸：保证行内「阶段 / 设备」与「时间」输入框、备注区都还能用。 */
const MIN_WINDOW = { width: 500, height: 220 } as const;
/** 看板（标准视图）最小宽度：低于这个宽度三栏会换行、待办标题被压成「C…」，因此不允许再缩。 */
const BOARD_MIN_WIDTH = 1100;

interface ResizeSession {
  edge: ResizeEdge;
  start: Electron.Rectangle;
  cursor: { x: number; y: number };
}

let resizeSession: ResizeSession | null = null;

/**
 * 临时置顶状态：点击托盘图标把窗口提到最上层时开启，
 * 窗口一旦失去焦点（用户去看别的窗口）就自动回落。
 * 与 settings.alwaysOnTop（永久置顶）互不影响。
 */
let tempTopmost = false;
let tempTopmostTimer: NodeJS.Timeout | null = null;
const TEMP_TOPMOST_RECHECK_MS = 8000;
/** 窗口最近一次失焦的时间，用于区分“点击托盘导致失焦”与“被其它窗口长期遮挡”。 */
let lastBlurAt = 0;
const TRAY_BLUR_WINDOW_MS = 500;

const assetsDir = path.join(app.getAppPath(), 'assets');

function activeCount(items: WorkItem[]): number {
  return items.filter((item) => item.status === 'active').length;
}

function layoutForCurrentData(): LayoutRequest {
  const data = store.getData();
  return {
    mode: data.settings.viewMode,
    itemCount: data.items.length,
    activeCount: activeCount(data.items),
  };
}

function isTrustedSender(senderId: number): boolean {
  if (mainWindow !== null && mainWindow.webContents.id === senderId) return true;
  return trayMenuWindow !== null && trayMenuWindow.webContents.id === senderId;
}

function persistPlacement(bounds: Electron.Rectangle): void {
  const display = screen.getDisplayMatching(bounds);
  store.updatePlacement({ x: bounds.x, y: bounds.y, displayId: String(display.id) });
}

function createWindow(): void {
  const data = store.getData();
  const defaultSize = computeWindowSize(layoutForCurrentData());
  // 紧凑视图按内容自适应，不沿用用户手动调过的看板尺寸；切回标准视图时再还原
  const saved = data.settings.viewMode === 'standard' ? data.settings.windowSize : undefined;
  const area = screen.getPrimaryDisplay().workArea;
  // 看板视图下旧尺寸可能不足以容纳三栏，启动时直接放回看板默认宽度
  const viewMinWidth = data.settings.viewMode === 'standard' ? BOARD_MIN_WIDTH : MIN_WINDOW.width;
  const baseWidth = saved && saved.width >= viewMinWidth ? saved.width : defaultSize.width;
  const baseHeight = saved?.height ?? defaultSize.height;
  const size = {
    width: Math.round(Math.min(Math.max(baseWidth, MIN_WINDOW.width), area.width - 8)),
    height: Math.round(Math.min(Math.max(baseHeight, MIN_WINDOW.height), area.height - 8)),
  };
  const bounds = restorePlacement(size, data.settings.windowPlacement);

  // 尺寸被修正过就写回，避免每次启动都重复计算
  if (saved && (saved.width !== size.width || saved.height !== size.height)) {
    store.updateWindowSize(size);
  }

  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: MIN_WINDOW.width,
    minHeight: MIN_WINDOW.height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    // 透明无边框窗口的原生缩放热区在窗口最外沿（落在 12px 透明边距外），
    // 因此关闭原生缩放，改由渲染层的八向拖拽热区通过 IPC 调 setBounds 实现"像 Word 一样拖边缘改大小"。
    resizable: false,
    maximizable: false,
    minimizable: true,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    hasShadow: false,
    alwaysOnTop: data.settings.alwaysOnTop,
    title: 'Work Focus',
    icon: path.join(assetsDir, 'app-icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  });

  mainWindow.setMenu(null);
  if (data.settings.alwaysOnTop) {
    mainWindow.setAlwaysOnTop(true, 'floating');
  }

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.showInactive();
  });

  mainWindow.on('moved', () => {
    if (!mainWindow || isQuitting) return;
    if (moveSaveTimer) clearTimeout(moveSaveTimer);
    moveSaveTimer = setTimeout(() => {
      moveSaveTimer = null;
      if (mainWindow) persistPlacement(mainWindow.getBounds());
    }, 400);
  });

  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow?.hide();
    clearTempTopmost();
  });

  mainWindow.on('blur', () => {
    lastBlurAt = Date.now();
    // 临时置顶只在“用户还在看它”期间生效，切到别的窗口就回落
    clearTempTopmost();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/** 结束临时置顶；若用户没开永久置顶，窗口回到普通层。 */
function clearTempTopmost(): void {
  if (tempTopmostTimer) {
    clearTimeout(tempTopmostTimer);
    tempTopmostTimer = null;
  }
  if (!tempTopmost) return;
  tempTopmost = false;
  if (mainWindow && !store.getData().settings.alwaysOnTop) {
    mainWindow.setAlwaysOnTop(false);
  }
}

/**
 * 兜底回落：正常情况下窗口 blur 就会调 clearTempTopmost。
 * 少数情况下（例如 focus 被系统拒绝）不会触发 blur，这里在窗口失焦后兜底回落，
 * 避免组件长期压住其它窗口；用户仍在窗口内操作时继续等待。
 */
function scheduleTempTopmostRecheck(): void {
  if (!tempTopmost) return;
  if (tempTopmostTimer) clearTimeout(tempTopmostTimer);
  tempTopmostTimer = setTimeout(() => {
    tempTopmostTimer = null;
    if (!tempTopmost) return;
    if (mainWindow?.isFocused()) {
      scheduleTempTopmostRecheck();
      return;
    }
    clearTempTopmost();
  }, TEMP_TOPMOST_RECHECK_MS);
}

/**
 * 把组件提到最上层并聚焦。
 * 未开启永久置顶时使用“临时置顶”：只提升 z 序，失焦后自动回落，不写入 settings。
 */
function raiseToFront(): void {
  if (!mainWindow) return;
  ensureVisible(mainWindow);
  mainWindow.show();
  if (!store.getData().settings.alwaysOnTop) {
    tempTopmost = true;
    mainWindow.setAlwaysOnTop(true, 'floating');
    scheduleTempTopmostRecheck();
  }
  mainWindow.moveTop();
  mainWindow.focus();
}

function toggleWindow(): void {
  if (!mainWindow) {
    createWindow();
    return;
  }
  // 点击托盘本身可能会让组件短暂失焦：这种情况下再点仍是“收起”，避免永远收不起来
  const blurredByTray = Date.now() - lastBlurAt < TRAY_BLUR_WINDOW_MS;
  if (!mainWindow.isVisible()) {
    raiseToFront();
    return;
  }
  if (mainWindow.isFocused() || blurredByTray) {
    mainWindow.hide();
    clearTempTopmost();
    return;
  }
  // 已经显示但被别的窗口长期挡住：这次点击就是“提到最上层”
  raiseToFront();
}

/**
 * 托盘菜单不使用系统原生菜单。
 * 实测：在 Windows 11 上原生菜单（setContextMenu / popUpContextMenu / menu.popup）
 * 弹出后系统不会创建菜单窗口，Promise 一直挂起，用户右键只会看到"没有反应"。
 * 因此改为自绘的独立置顶小窗口：右键托盘图标时贴在上方弹出，点击别处自动关闭。
 */
function createTrayMenuWindow(): BrowserWindow {
  const menuWindow = new BrowserWindow({
    width: 212,
    height: 138,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    title: 'Work Focus 菜单',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  });
  menuWindow.setMenu(null);

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    void menuWindow.loadURL(`${devUrl}/tray-menu.html`);
  } else {
    void menuWindow.loadFile(path.join(app.getAppPath(), 'dist', 'tray-menu.html'));
  }

  menuWindow.on('blur', () => menuWindow.hide());
  menuWindow.on('closed', () => {
    trayMenuWindow = null;
  });
  return menuWindow;
}

function showTrayMenu(): void {
  if (!trayMenuWindow) trayMenuWindow = createTrayMenuWindow();
  const win = trayMenuWindow;
  const cursor = screen.getCursorScreenPoint();
  const area = screen.getDisplayNearestPoint(cursor).workArea;
  const [width, height] = win.getSize();
  let x = Math.round(cursor.x - width / 2);
  let y = Math.round(cursor.y - height - 10);
  if (y < area.y + 4) y = cursor.y + 10;
  x = Math.min(Math.max(x, area.x + 4), area.x + area.width - width - 4);
  y = Math.min(Math.max(y, area.y + 4), area.y + area.height - height - 4);
  win.setBounds({ x, y, width, height });
  win.show();
  win.focus();
}

function createTray(): void {
  const iconPath = path.join(assetsDir, 'tray-icon.ico');
  let image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) {
    image = nativeImage.createEmpty();
  }
  tray = new Tray(image);
  tray.setToolTip('Work Focus');
  tray.on('click', () => {
    toggleWindow();
  });
  tray.on('right-click', () => {
    showTrayMenu();
  });
}

/**
 * 开机自动启动：写入当前用户的 Run 项（仅打包版，避免开发模式被登记）。
 * 已有记录且指向当前 exe 时不重复写，避免每次开机都改一遍注册表。
 */
function enableAutoLaunch(): void {
  if (!app.isPackaged) return;
  const settings = app.getLoginItemSettings({ path: process.execPath });
  if (settings.openAtLogin && settings.executableWillLaunchAtLogin) return;
  app.setLoginItemSettings({ openAtLogin: true, path: process.execPath });
}

/**
 * 让托盘图标常驻右下角通知区（而不是折叠进溢出浮窗）。
 * Windows 11 把每个图标的显示/折叠状态存在 HKCU\Control Panel\NotifyIconSettings\<id> 的
 * IsPromoted 值里，Electron 没有对应 API，只能写这个键。首次运行时资源管理器才创建该键，
 * 因此这里轮询 12 秒等待键出现；若一直没出现则保持默认（折叠）行为，不报错。
 */
function promoteTrayIcon(): void {
  if (!app.isPackaged) return;
  const exe = process.execPath.replace(/'/g, "''");
  const script = `
$exe = '${exe}'
$root = 'HKCU:\\Control Panel\\NotifyIconSettings'
for ($i = 0; $i -lt 15; $i++) {
  $hit = $false
  Get-ChildItem $root -ErrorAction SilentlyContinue | ForEach-Object {
    $p = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
    if ($p.ExecutablePath -eq $exe) {
      $hit = $true
      if ($p.IsPromoted -ne 1) {
        New-ItemProperty -Path $_.PSPath -Name IsPromoted -PropertyType DWord -Value 1 -Force | Out-Null
      }
    }
  }
  if ($hit) { break }
  Start-Sleep -Milliseconds 800
}`;
  execFile(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script],
    { windowsHide: true },
    () => {
      // 提升失败（例如企业策略禁用该键）不影响应用运行，图标仍可在溢出浮窗中使用
    },
  );
}

function configureStartup(): void {
  enableAutoLaunch();
  promoteTrayIcon();
}

function setAlwaysOnTop(enabled: boolean): void {
  const next = { ...store.getData().settings, alwaysOnTop: enabled };
  store.setSettings(next);
  // 用户显式设置了置顶状态：临时置顶的标记与兜底定时器都作废
  if (tempTopmostTimer) {
    clearTimeout(tempTopmostTimer);
    tempTopmostTimer = null;
  }
  tempTopmost = false;
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(enabled, enabled ? 'floating' : 'normal');
  }
}

function quitApp(): void {
  isQuitting = true;
  store.flush();
  app.quit();
}

/**
 * 八向拖拽缩放：渲染层把屏幕坐标发过来，这里按"起始 bounds + 位移"计算新 bounds。
 * 屏幕坐标不随窗口移动而漂移，所以从左边/上边拖也稳定。
 */
function applyResize(payload: ResizePayload): void {
  if (!mainWindow) return;

  if (payload.phase === 'start') {
    resizeSession = {
      edge: payload.edge,
      start: mainWindow.getBounds(),
      cursor: { x: payload.screenX, y: payload.screenY },
    };
    return;
  }

  const session = resizeSession;
  if (!session) return;

  if (payload.phase === 'end') {
    resizeSession = null;
    const bounds = mainWindow.getBounds();
    persistPlacement(bounds);
    store.updateWindowSize({ width: bounds.width, height: bounds.height });
    return;
  }

  const { edge, start, cursor } = session;
  const viewMinWidth = store.getData().settings.viewMode === 'standard' ? BOARD_MIN_WIDTH : MIN_WINDOW.width;
  const dx = Math.round(payload.screenX - cursor.x);
  const dy = Math.round(payload.screenY - cursor.y);
  const area = screen.getDisplayMatching(start).workArea;

  let x = start.x;
  let y = start.y;
  let width = start.width;
  let height = start.height;

  if (edge.includes('e')) width = start.width + dx;
  if (edge.includes('w')) {
    width = start.width - dx;
    x = start.x + dx;
  }
  if (edge.includes('s')) height = start.height + dy;
  if (edge.includes('n')) {
    height = start.height - dy;
    y = start.y + dy;
  }

  if (width < viewMinWidth) {
    if (edge.includes('w')) x = start.x + start.width - viewMinWidth;
    width = viewMinWidth;
  }
  if (height < MIN_WINDOW.height) {
    if (edge.includes('n')) y = start.y + start.height - MIN_WINDOW.height;
    height = MIN_WINDOW.height;
  }
  width = Math.min(width, area.width);
  height = Math.min(height, area.height);

  mainWindow.setBounds({
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  });
}

function registerIpc(): void {
  ipcMain.handle('wf:get-app-data', (event) => {
    if (!isTrustedSender(event.sender.id)) throw new Error('untrusted sender');
    return store.getData();
  });

  ipcMain.handle('wf:save-items', (event, items: WorkItem[]) => {
    if (!isTrustedSender(event.sender.id)) throw new Error('untrusted sender');
    if (!Array.isArray(items) || items.length > LIMITS.maxItems) throw new Error('invalid items');
    store.setItems(items);
  });

  ipcMain.handle('wf:save-settings', (event, settings: AppSettings) => {
    if (!isTrustedSender(event.sender.id)) throw new Error('untrusted sender');
    const raw = settings as unknown as Record<string, unknown>;
    const viewMode: ViewMode = raw.viewMode === 'compact' ? 'compact' : 'standard';
    const alwaysOnTop = raw.alwaysOnTop === true;
    const merged: AppSettings = {
      viewMode,
      alwaysOnTop,
      lanes: sanitizeLanes(raw.lanes, store.getData().settings.lanes),
      inboxWidth:
        typeof raw.inboxWidth === 'number' ? raw.inboxWidth : store.getData().settings.inboxWidth,
      windowPlacement: store.getData().settings.windowPlacement,
      windowSize: store.getData().settings.windowSize,
    };
    store.setSettings(merged);
    if (mainWindow) mainWindow.setAlwaysOnTop(alwaysOnTop, alwaysOnTop ? 'floating' : 'normal');
  });

  ipcMain.handle('wf:set-always-on-top', (event, enabled: boolean) => {
    if (!isTrustedSender(event.sender.id)) throw new Error('untrusted sender');
    setAlwaysOnTop(enabled === true);
  });

  ipcMain.handle('wf:set-view-mode', (event, mode: ViewMode) => {
    if (!isTrustedSender(event.sender.id)) throw new Error('untrusted sender');
    const next = mode === 'compact' ? 'compact' : 'standard';
    store.setSettings({ ...store.getData().settings, viewMode: next });
    if (!mainWindow) return;

    // 收起时窗口贴合紧凑内容；用户手动调过的看板尺寸先留着，展开时还原
    if (next === 'compact') {
      applyLayout(mainWindow, layoutForCurrentData());
      persistPlacement(mainWindow.getBounds());
      return;
    }

    const saved = store.getData().settings.windowSize;
    // 看板的最小宽度放不进旧版窄窗口：清掉过窄的自定义尺寸，让窗口按内容展开
    if (saved && saved.width < BOARD_MIN_WIDTH) {
      store.setSettings({ ...store.getData().settings, windowSize: undefined });
      applyLayout(mainWindow, layoutForCurrentData());
      persistPlacement(mainWindow.getBounds());
      return;
    }
    if (saved) {
      const bounds = restorePlacement(saved, store.getData().settings.windowPlacement);
      mainWindow.setBounds(bounds);
      persistPlacement(bounds);
      return;
    }
    applyLayout(mainWindow, layoutForCurrentData());
    persistPlacement(mainWindow.getBounds());
  });

  ipcMain.handle('wf:request-layout', (event, request: LayoutRequest) => {
    if (!isTrustedSender(event.sender.id)) throw new Error('untrusted sender');
    if (!mainWindow) return;
    const mode: LayoutRequest['mode'] =
      request.mode === 'manage' ? 'manage' : request.mode === 'detail' ? 'detail' : request.mode === 'compact' ? 'compact' : 'standard';
    const layout: LayoutRequest = {
      mode,
      itemCount: Number(request.itemCount) || 0,
      activeCount: Number(request.activeCount) || 0,
      menuOpen: request.menuOpen === true,
    };

    if (mode === 'compact') {
      // 紧凑视图始终按内容收缩；用户手动调过的看板尺寸留在设置里，展开时还原
      compactWindow = true;
      applyLayout(mainWindow, layout);
      persistPlacement(mainWindow.getBounds());
      return;
    }

    if (compactWindow) {
      compactWindow = false;
      const saved = store.getData().settings.windowSize;
      if (saved && saved.width >= BOARD_MIN_WIDTH) {
        const bounds = restorePlacement(saved, store.getData().settings.windowPlacement);
        mainWindow.setBounds(bounds);
        persistPlacement(bounds);
      } else {
        applyLayout(mainWindow, layout);
        persistPlacement(mainWindow.getBounds());
      }
      return;
    }

    // 用户已经手动拖过边缘：窗口尺寸交给用户，不再按内容自动改大小。
    if (store.getData().settings.windowSize) return;
    applyLayout(mainWindow, layout);
    persistPlacement(mainWindow.getBounds());
  });

  ipcMain.handle('wf:resize-window', (event, payload: ResizePayload) => {
    if (!isTrustedSender(event.sender.id)) throw new Error('untrusted sender');
    applyResize(payload);
  });

  ipcMain.handle('wf:hide-widget', (event) => {
    if (!isTrustedSender(event.sender.id)) throw new Error('untrusted sender');
    mainWindow?.hide();
    clearTempTopmost();
  });

  ipcMain.handle('wf:tray-menu-state', (event) => {
    if (!isTrustedSender(event.sender.id)) throw new Error('untrusted sender');
    return {
      alwaysOnTop: store.getData().settings.alwaysOnTop,
      visible: mainWindow?.isVisible() ?? false,
    };
  });

  ipcMain.handle('wf:tray-menu-action', (event, action: TrayMenuAction) => {
    if (!isTrustedSender(event.sender.id)) throw new Error('untrusted sender');
    if (action === 'toggle-window') {
      toggleWindow();
    } else if (action === 'toggle-always-on-top') {
      setAlwaysOnTop(!store.getData().settings.alwaysOnTop);
    } else if (action === 'quit') {
      quitApp();
    }
    trayMenuWindow?.hide();
  });

  ipcMain.handle('wf:close-tray-menu', (event) => {
    if (!isTrustedSender(event.sender.id)) throw new Error('untrusted sender');
    trayMenuWindow?.hide();
  });

  ipcMain.handle('wf:quit-app', (event) => {
    if (!isTrustedSender(event.sender.id)) throw new Error('untrusted sender');
    quitApp();
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // 再次启动程序 = 用户想立刻看到组件，同样临时提到最上层
    raiseToFront();
  });

  app.setAppUserModelId('com.workfocus.frostpane');
  Menu.setApplicationMenu(null);

  app.whenReady().then(() => {
    store = new Store(app.getPath('userData'));
    const result = store.load();

    registerIpc();
    createWindow();
    createTray();
    configureStartup();

    screen.on('display-removed', () => mainWindow && ensureVisible(mainWindow));
    screen.on('display-added', () => mainWindow && ensureVisible(mainWindow));
    screen.on('display-metrics-changed', () => {
      if (!mainWindow) return;
      ensureVisible(mainWindow);
      // 用户手动调整过的尺寸保持不变，否则按内容重新布局
      if (!store.getData().settings.windowSize) applyLayout(mainWindow, layoutForCurrentData());
    });

    if (result.recovered) {
      void dialog.showMessageBox({
        type: 'warning',
        title: 'Work Focus · 数据恢复',
        message: '本地数据文件无法读取',
        detail: `原文件已备份到：\n${result.backupPath ?? '（备份失败）'}\n\n当前已载入示例数据，你可以继续使用。`,
        buttons: ['知道了'],
      });
    }
  });

  app.on('before-quit', () => {
    isQuitting = true;
    store?.flush();
  });

  app.on('window-all-closed', () => {
    // 组件常驻托盘，不因为窗口隐藏或关闭而退出。
  });

  app.on('activate', () => {
    if (!mainWindow) createWindow();
    mainWindow?.showInactive();
  });
}
