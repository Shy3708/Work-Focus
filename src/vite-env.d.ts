/// <reference types="vite/client" />
import type { WorkFocusBridge } from '../shared/types';

declare global {
  interface Window {
    workFocus: WorkFocusBridge;
  }
}

export {};
