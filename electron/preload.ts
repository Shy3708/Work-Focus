import { contextBridge, ipcRenderer } from 'electron';
import type {
  AppSettings,
  LayoutRequest,
  ResizePayload,
  TrayMenuAction,
  ViewMode,
  WorkFocusBridge,
  WorkItem,
} from '../shared/types';

const bridge: WorkFocusBridge = {
  getAppData: () => ipcRenderer.invoke('wf:get-app-data'),
  saveItems: (items: WorkItem[]) => ipcRenderer.invoke('wf:save-items', items),
  saveSettings: (settings: AppSettings) => ipcRenderer.invoke('wf:save-settings', settings),
  setAlwaysOnTop: (enabled: boolean) => ipcRenderer.invoke('wf:set-always-on-top', enabled),
  setViewMode: (mode: ViewMode) => ipcRenderer.invoke('wf:set-view-mode', mode),
  requestLayout: (request: LayoutRequest) => ipcRenderer.invoke('wf:request-layout', request),
  resizeWindow: (payload: ResizePayload) => ipcRenderer.invoke('wf:resize-window', payload),
  hideWidget: () => ipcRenderer.invoke('wf:hide-widget'),
  quitApp: () => ipcRenderer.invoke('wf:quit-app'),
  getTrayMenuState: () => ipcRenderer.invoke('wf:tray-menu-state'),
  trayMenuAction: (action: TrayMenuAction) => ipcRenderer.invoke('wf:tray-menu-action', action),
  closeTrayMenu: () => ipcRenderer.invoke('wf:close-tray-menu'),
};

contextBridge.exposeInMainWorld('workFocus', bridge);
