import type { WorkCategory, WorkItem } from '../../shared/types';
import { LIMITS } from '../../shared/types';
import { StatusOrb } from './StatusOrb';

interface Props {
  item: WorkItem;
  onBack: () => void;
  onToggle: (id: string) => void;
  onChangeNote: (id: string, note: string) => void;
  onToggleCategory: (id: string) => void;
}

const CATEGORY_LABEL: Record<WorkCategory, string> = {
  work: '工作',
  life: '生活',
};

const CATEGORY_HINT: Record<WorkCategory, string> = {
  work: '当前标签：工作（蓝色系），点击切换为生活',
  life: '当前标签：生活（淡绿色系），点击切换为工作',
};

/** 单个事项的详情 / 便签页：标题 + 亮灭状态 + 标签 + 自动保存的备注。 */
export function ItemDetailView({ item, onBack, onToggle, onChangeNote, onToggleCategory }: Props) {
  const active = item.status === 'active';
  const noteLength = Array.from(item.note).length;
  const dotColor = item.category === 'work' ? 'rgba(105, 171, 227, 0.95)' : 'rgba(105, 227, 171, 0.95)';

  return (
    <>
      <header className="detail-header">
        <button type="button" className="detail-back" onClick={onBack} title="返回列表" aria-label="返回列表">
          ←
        </button>
        <span className="detail-title" title={item.title}>
          {item.title}
        </span>
        <button
          type="button"
          className={`detail-category ${item.category === 'life' ? 'is-life' : ''}`}
          onClick={() => onToggleCategory(item.id)}
          title={CATEGORY_HINT[item.category]}
          aria-label={CATEGORY_HINT[item.category]}
        >
          <span className="cat-dot" aria-hidden="true" style={{ background: dotColor }} />
          <span>{CATEGORY_LABEL[item.category]}</span>
        </button>
        <button
          type="button"
          className={`detail-status ${active ? 'is-active' : ''} ${item.category === 'life' ? 'cat-life' : ''}`}
          onClick={() => onToggle(item.id)}
          title="切换进行中 / 未开始"
          aria-pressed={active}
        >
          <StatusOrb status={item.status} category={item.category} size="compact" />
          <span>{active ? '进行中' : '未开始'}</span>
        </button>
      </header>

      {item.subtitle ? (
        <div className="detail-sub" title={item.subtitle}>
          {item.subtitle}
        </div>
      ) : null}

      <textarea
        className="detail-note"
        value={item.note}
        onChange={(event) => onChangeNote(item.id, event.target.value)}
        placeholder="写点备注、进度、下一步…（自动保存）"
        maxLength={LIMITS.noteMax}
        spellCheck={false}
        autoFocus
      />

      <div className="detail-foot">
        {noteLength} / {LIMITS.noteMax}
      </div>
    </>
  );
}
