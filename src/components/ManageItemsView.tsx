import { useEffect, useRef, useState } from 'react';
import type { WorkItem } from '../../shared/types';
import { LIMITS } from '../../shared/types';
import { ArrowDownIcon, ArrowLeftIcon, ArrowUpIcon, CheckIcon, CloseIcon, PlusIcon, TrashIcon } from './icons';

interface Props {
  items: WorkItem[];
  addOpen: boolean;
  onStartAdd: () => void;
  onCancelAdd: () => void;
  onAdd: (title: string, subtitle: string) => boolean;
  onUpdate: (id: string, patch: { title?: string; subtitle?: string }) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onDone: () => void;
}

interface RowProps {
  item: WorkItem;
  isFirst: boolean;
  isLast: boolean;
  onUpdate: (id: string, patch: { title?: string; subtitle?: string }) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
}

function ManageRow({ item, isFirst, isLast, onUpdate, onDelete, onMove }: RowProps) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [titleDraft, setTitleDraft] = useState(item.title);
  const [subtitleDraft, setSubtitleDraft] = useState(item.subtitle);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setTitleDraft(item.title);
      setSubtitleDraft(item.subtitle);
      requestAnimationFrame(() => {
        titleRef.current?.focus();
        titleRef.current?.select();
      });
    }
  }, [editing, item.title, item.subtitle]);

  const save = () => {
    if (!titleDraft.trim()) return;
    onUpdate(item.id, { title: titleDraft, subtitle: subtitleDraft });
    setEditing(false);
  };

  if (confirming) {
    return (
      <div className="manage-row is-confirm">
        <span className="confirm-text">删除「{item.title}」？</span>
        <div className="manage-actions">
          <button type="button" className="mini-btn is-danger" onClick={() => onDelete(item.id)}>
            删除
          </button>
          <button type="button" className="mini-btn" onClick={() => setConfirming(false)}>
            取消
          </button>
        </div>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="manage-row is-editing">
        <div className="edit-fields">
          <input
            ref={titleRef}
            className="edit-input"
            value={titleDraft}
            maxLength={LIMITS.titleMax}
            placeholder="事项名称（必填）"
            onChange={(event) => setTitleDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') save();
              if (event.key === 'Escape') setEditing(false);
            }}
          />
          <input
            className="edit-input is-sub"
            value={subtitleDraft}
            maxLength={LIMITS.subtitleMax}
            placeholder="副标题（可留空）"
            onChange={(event) => setSubtitleDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') save();
              if (event.key === 'Escape') setEditing(false);
            }}
          />
        </div>
        <div className="manage-actions">
          <button
            type="button"
            className="mini-btn is-icon"
            onClick={save}
            disabled={!titleDraft.trim()}
            title="保存"
            aria-label="保存"
          >
            <CheckIcon width={14} height={14} />
          </button>
          <button
            type="button"
            className="mini-btn is-icon"
            onClick={() => setEditing(false)}
            title="取消"
            aria-label="取消"
          >
            <CloseIcon width={14} height={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="manage-row">
      <button
        type="button"
        className="manage-row-main"
        onClick={() => setEditing(true)}
        title="点击修改名称与副标题"
      >
        <span className="manage-row-title">{item.title}</span>
        <span className="manage-row-sub">{item.subtitle || '未填写副标题'}</span>
      </button>
      <div className="manage-actions">
        <button
          type="button"
          className="mini-btn is-icon"
          disabled={isFirst}
          onClick={() => onMove(item.id, -1)}
          title="上移"
          aria-label="上移"
        >
          <ArrowUpIcon width={14} height={14} />
        </button>
        <button
          type="button"
          className="mini-btn is-icon"
          disabled={isLast}
          onClick={() => onMove(item.id, 1)}
          title="下移"
          aria-label="下移"
        >
          <ArrowDownIcon width={14} height={14} />
        </button>
        <button
          type="button"
          className="mini-btn is-icon is-warn"
          onClick={() => setConfirming(true)}
          title="删除"
          aria-label="删除"
        >
          <TrashIcon width={14} height={14} />
        </button>
      </div>
    </div>
  );
}

function AddRow({ onAdd, onCancel }: { onAdd: Props['onAdd']; onCancel: () => void }) {
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [failed, setFailed] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const submit = () => {
    if (!title.trim()) {
      setFailed(true);
      return;
    }
    const ok = onAdd(title, subtitle);
    if (!ok) setFailed(true);
  };

  return (
    <div className="manage-row is-editing">
      <div className="edit-fields">
        <input
          ref={titleRef}
          className={`edit-input ${failed ? 'is-invalid' : ''}`}
          value={title}
          maxLength={LIMITS.titleMax}
          placeholder={failed ? '名称不能为空' : '新事项名称（必填）'}
          onChange={(event) => {
            setTitle(event.target.value);
            setFailed(false);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
            if (event.key === 'Escape') onCancel();
          }}
        />
        <input
          className="edit-input is-sub"
          value={subtitle}
          maxLength={LIMITS.subtitleMax}
          placeholder="副标题（可留空）"
          onChange={(event) => setSubtitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
            if (event.key === 'Escape') onCancel();
          }}
        />
      </div>
      <div className="manage-actions">
        <button
          type="button"
          className="mini-btn is-icon"
          onClick={submit}
          disabled={!title.trim()}
          title="保存"
          aria-label="保存"
        >
          <CheckIcon width={14} height={14} />
        </button>
        <button type="button" className="mini-btn is-icon" onClick={onCancel} title="取消" aria-label="取消">
          <CloseIcon width={14} height={14} />
        </button>
      </div>
    </div>
  );
}

export function ManageItemsView({
  items,
  addOpen,
  onStartAdd,
  onCancelAdd,
  onAdd,
  onUpdate,
  onDelete,
  onMove,
  onDone,
}: Props) {
  const full = items.length >= LIMITS.maxItems;

  return (
    <>
      <header className="widget-header manage-header">
        <div className="manage-head-left">
          <button type="button" className="header-btn" onClick={onDone} title="返回" aria-label="返回">
            <ArrowLeftIcon width={15} height={15} />
          </button>
          <span className="manage-title">管理事项</span>
        </div>
        <button type="button" className="text-btn" onClick={onDone}>
          完成
        </button>
      </header>
      <div className="manage-list">
        {items.map((item, index) => (
          <ManageRow
            key={item.id}
            item={item}
            isFirst={index === 0}
            isLast={index === items.length - 1}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onMove={onMove}
          />
        ))}
        {addOpen ? <AddRow onAdd={onAdd} onCancel={onCancelAdd} /> : null}
        <button
          type="button"
          className="add-item-btn"
          onClick={onStartAdd}
          disabled={full || addOpen}
          title={full ? `最多 ${LIMITS.maxItems} 项，先删除一项再添加` : '添加事项'}
        >
          <PlusIcon width={14} height={14} />
          <span>{full ? `已达上限（最多 ${LIMITS.maxItems} 项）` : '添加事项'}</span>
        </button>
      </div>
    </>
  );
}
