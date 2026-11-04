import { useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { ResizeEdge } from '../../shared/types';

const EDGES: ResizeEdge[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];

/**
 * 窗口八向缩放热区。透明无边框窗口的原生缩放在窗口最外沿（12px 透明边距之外，
 * 用户看不到也抓不住），所以这里把热区贴在玻璃面板边缘，由主进程按屏幕坐标改窗口大小。
 */
export function ResizeHandles() {
  const active = useRef<ResizeEdge | null>(null);

  const send = (
    edge: ResizeEdge,
    phase: 'start' | 'move' | 'end',
    event: ReactPointerEvent<HTMLDivElement>,
  ): void => {
    void window.workFocus.resizeWindow({ edge, phase, screenX: event.screenX, screenY: event.screenY });
  };

  const handleProps = (edge: ResizeEdge) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      active.current = edge;
      event.currentTarget.setPointerCapture(event.pointerId);
      send(edge, 'start', event);
    },
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => {
      if (active.current !== edge) return;
      send(edge, 'move', event);
    },
    onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => {
      if (active.current !== edge) return;
      active.current = null;
      send(edge, 'end', event);
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // 指针已释放时忽略
      }
    },
    onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => {
      if (active.current !== edge) return;
      active.current = null;
      send(edge, 'end', event);
    },
  });

  return (
    <div className="resize-layer" aria-hidden="true">
      {EDGES.map((edge) => (
        <div key={edge} className={`resize-handle resize-${edge}`} {...handleProps(edge)} />
      ))}
    </div>
  );
}
