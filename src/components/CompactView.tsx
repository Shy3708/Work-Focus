import type { WorkItem } from '../../shared/types';
import { WidgetHeader } from './WidgetHeader';
import { StatusOrb } from './StatusOrb';

interface Props {
  items: WorkItem[];
  activeItems: WorkItem[];
  pinned: boolean;
  menuOpen: boolean;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  onExpand: () => void;
  onOpenMenu: () => void;
  /** 整个窗口收回托盘图标。 */
  onMinimize: () => void;
}

export function CompactView({
  items,
  activeItems,
  pinned,
  menuOpen,
  onToggle,
  onOpen,
  onExpand,
  onOpenMenu,
  onMinimize,
}: Props) {
  const shown = activeItems.slice(0, 2);
  const overflow = activeItems.length - shown.length;

  return (
    <>
      <WidgetHeader
        variant="compact"
        activeCount={activeItems.length}
        total={items.length}
        pinned={pinned}
        menuOpen={menuOpen}
        onTogglePin={() => undefined}
        onCollapse={onExpand}
        onOpenMenu={onOpenMenu}
        onMinimize={onMinimize}
      />
      <div className="compact-body">
        {shown.length === 0 ? (
          <div className="compact-empty">
            <span className="compact-empty-text">当前没有推进中的事项</span>
            <button type="button" className="compact-empty-action" onClick={onExpand}>
              展开查看全部
            </button>
          </div>
        ) : (
          <>
            <div className="compact-list">
              {shown.map((item) => (
                <div
                  key={item.id}
                  className={`compact-row is-active ${item.category === 'life' ? 'cat-life' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpen(item.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onOpen(item.id);
                    }
                  }}
                  aria-label={`${item.title}，正在推进，点击打开备注`}
                  title="点击打开备注"
                >
                  <button
                    type="button"
                    className="compact-orb"
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggle(item.id);
                    }}
                    title="点击熄灭"
                    aria-label={`${item.title}，正在推进，点击熄灭`}
                  >
                    <StatusOrb status={item.status} category={item.category} size="compact" />
                  </button>
                  <span className="compact-row-title" title={item.title}>
                    {item.title}
                  </span>
                </div>
              ))}
            </div>
            {overflow > 0 ? <div className="compact-more">+{overflow} 项进行中</div> : null}
          </>
        )}
      </div>
    </>
  );
}
