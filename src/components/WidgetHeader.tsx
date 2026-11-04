import { EllipsisIcon, ExpandIcon, MinimizeIcon, MinusIcon, PinIcon } from './icons';

interface Props {
  variant: 'standard' | 'compact';
  activeCount: number;
  total: number;
  pinned: boolean;
  menuOpen: boolean;
  onTogglePin: () => void;
  onCollapse: () => void;
  onOpenMenu: () => void;
  /** 整个窗口收回托盘图标。 */
  onMinimize: () => void;
}

export function WidgetHeader({
  variant,
  activeCount,
  total,
  pinned,
  menuOpen,
  onTogglePin,
  onCollapse,
  onOpenMenu,
  onMinimize,
}: Props) {
  const compact = variant === 'compact';
  return (
    <header className="widget-header">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <div className="brand-text">
          <span className="brand-title">Work Focus</span>
          {compact ? (
            <span className="brand-sub brand-count">
              {activeCount} / {total} 进行中
            </span>
          ) : (
            <span className="brand-sub brand-count">
              {activeCount} 项进行中 · {total} 项事项
            </span>
          )}
        </div>
      </div>
      <div className="header-actions">
        {compact ? null : (
          <button
            type="button"
            className={`header-btn ${pinned ? 'is-active' : ''}`}
            onClick={onTogglePin}
            title={pinned ? '取消置顶' : '始终置顶'}
            aria-label={pinned ? '取消置顶' : '始终置顶'}
            aria-pressed={pinned}
          >
            <PinIcon filled={pinned} width={15} height={15} />
          </button>
        )}
        <button
          type="button"
          className="header-btn"
          onClick={onCollapse}
          title={compact ? '展开标准视图' : '折叠为紧凑模式'}
          aria-label={compact ? '展开标准视图' : '折叠为紧凑模式'}
        >
          {compact ? <ExpandIcon width={15} height={15} /> : <MinusIcon width={15} height={15} />}
        </button>
        <button
          type="button"
          className={`header-btn ${menuOpen ? 'is-active' : ''}`}
          onClick={onOpenMenu}
          title="更多操作"
          aria-label="更多操作"
          aria-expanded={menuOpen}
        >
          <EllipsisIcon width={15} height={15} />
        </button>
        <button
          type="button"
          className="header-btn"
          onClick={onMinimize}
          title="最小化到托盘"
          aria-label="最小化到托盘"
        >
          <MinimizeIcon width={15} height={15} />
        </button>
      </div>
    </header>
  );
}
