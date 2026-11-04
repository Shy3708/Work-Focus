import { useEffect, useState } from 'react';
import type { TimeMode, WorkCategory } from '../../shared/types';
import { PinIcon } from './icons';

interface Props {
  x: number;
  y: number;
  title: string;
  pinned: boolean;
  category: WorkCategory;
  timeMode: TimeMode;
  onEdit: () => void;
  onTogglePin: () => void;
  onToggleCategory: () => void;
  onToggleTimeMode: () => void;
  onDelete: () => void;
  onClose: () => void;
}

const MENU_WIDTH = 148;
const MENU_HEIGHT = 188;

const CATEGORY_LABEL: Record<WorkCategory, string> = {
  work: '工作',
  life: '生活',
};

const CATEGORY_SWITCH_LABEL: Record<WorkCategory, string> = {
  work: '切换为生活',
  life: '切换为工作',
};

const TIME_MODE_LABEL: Record<TimeMode, string> = {
  countdown: '倒计时',
  custom: '正推',
};

const TIME_MODE_SWITCH_LABEL: Record<TimeMode, string> = {
  countdown: '切换为正推',
  custom: '切换为倒计时',
};

/** 事件行的右键菜单：编辑标题 + 置顶 + 时间格模式 + 切换标签 + 删除事项。 */
export function RowMenu({
  x,
  y,
  title,
  pinned,
  category,
  timeMode,
  onEdit,
  onTogglePin,
  onToggleCategory,
  onToggleTimeMode,
  onDelete,
  onClose,
}: Props) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    const onDown = (event: MouseEvent): void => {
      const target = event.target;
      if (target instanceof Element && target.closest('.row-menu')) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    // 延后绑定，避免本次右键事件本身立刻把菜单关掉
    const timer = window.setTimeout(() => {
      window.addEventListener('mousedown', onDown);
      window.addEventListener('blur', onClose);
    }, 0);
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const left = Math.max(8, Math.min(x, window.innerWidth - MENU_WIDTH - 8));
  const top = Math.max(8, Math.min(y, window.innerHeight - MENU_HEIGHT - 8));

  // 标签圆点颜色：work = 蓝（--blue-core 附近），life = 淡绿
  const dotColor = category === 'work' ? 'rgba(105, 171, 227, 0.95)' : 'rgba(105, 227, 171, 0.95)';

  return (
    <div className="row-menu" style={{ left, top }} onContextMenu={(event) => event.preventDefault()}>
      {confirmingDelete ? (
        <>
          <div className="menu-confirm" title={title}>
            删除「{title}」？
          </div>
          <div className="menu-confirm-actions">
            <button type="button" className="menu-confirm-btn is-danger" onClick={onDelete} autoFocus>
              删除
            </button>
            <button type="button" className="menu-confirm-btn" onClick={() => setConfirmingDelete(false)}>
              取消
            </button>
          </div>
        </>
      ) : (
        <>
          <button type="button" className="menu-item" onClick={onEdit} autoFocus title="在当前页面直接修改标题">
            <span>编辑标题</span>
          </button>
          <button type="button" className="menu-item" onClick={onTogglePin}>
            <span>{pinned ? '取消置顶' : '置顶'}</span>
            <PinIcon filled={pinned} width={12} height={12} />
          </button>
          <button
            type="button"
            className="menu-item"
            onClick={onToggleTimeMode}
            title={`当前时间格：${TIME_MODE_LABEL[timeMode]}（倒计时 / 正推 二选一）`}
          >
            <span>{TIME_MODE_SWITCH_LABEL[timeMode]}</span>
            <span className="menu-hint">{TIME_MODE_LABEL[timeMode]}</span>
          </button>
          <div className="menu-sep" />
          <button type="button" className="menu-item" onClick={onToggleCategory} title={`当前：${CATEGORY_LABEL[category]}`}>
            <span>{CATEGORY_SWITCH_LABEL[category]}</span>
            <span className={`cat-dot cat-dot--${category}`} aria-hidden="true" style={{ background: dotColor }} />
          </button>
          <div className="menu-sep" />
          <button
            type="button"
            className="menu-item is-danger"
            onClick={() => setConfirmingDelete(true)}
            title="删除该事项（会再确认一次）"
          >
            <span>删除事项</span>
          </button>
        </>
      )}
    </div>
  );
}
