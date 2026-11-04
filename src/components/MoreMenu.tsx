import { useEffect, useRef } from 'react';
import type { ViewMode } from '../../shared/types';
import { CheckIcon } from './icons';

interface Props {
  viewMode: ViewMode;
  pinned: boolean;
  onManage: () => void;
  onToggleMode: () => void;
  onTogglePin: () => void;
  onHide: () => void;
  onQuit: () => void;
  onClose: () => void;
}

export function MoreMenu({ viewMode, pinned, onManage, onToggleMode, onTogglePin, onHide, onQuit, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (ref.current && target && ref.current.contains(target)) return;
      if (target && target.closest('.header-btn')) return;
      onClose();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  return (
    <div className="more-menu" ref={ref} role="menu">
      <button type="button" className="menu-item" role="menuitem" onClick={onManage}>
        <span>管理事项</span>
      </button>
      <button type="button" className="menu-item" role="menuitem" onClick={onToggleMode}>
        <span>{viewMode === 'compact' ? '标准模式' : '紧凑模式'}</span>
      </button>
      <button type="button" className="menu-item" role="menuitem" onClick={onTogglePin}>
        <span>始终置顶</span>
        {pinned ? <CheckIcon width={14} height={14} className="menu-check" /> : null}
      </button>
      <button type="button" className="menu-item" role="menuitem" onClick={onHide}>
        <span>隐藏组件</span>
      </button>
      <div className="menu-sep" />
      <button type="button" className="menu-item is-danger" role="menuitem" onClick={onQuit}>
        <span>退出应用</span>
      </button>
    </div>
  );
}
