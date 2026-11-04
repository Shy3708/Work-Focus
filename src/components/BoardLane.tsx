import { useEffect, useRef, useState } from 'react';
import type { Lane, WorkItem } from '../../shared/types';
import { LIMITS } from '../../shared/types';
import { LaneCard } from './LaneCard';

interface Props {
  lane: Lane;
  /** 用户拖动分隔条后固定的宽度（px）。 */
  flexBasis?: number;
  items: WorkItem[];
  now: number;
  dropActive: boolean;
  landed: boolean;
  dropItemId: string | null;
  draggingId: string | null;
  editTitleRequest: { id: string; seq: number } | null;
  onRenameLane: (id: string, name: string) => void;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  onRename: (id: string, patch: { title?: string; subtitle?: string }) => void;
  onStageChange: (id: string, stage: string) => void;
  onTimeChange: (id: string, time: string) => void;
  onTimeTextChange: (id: string, text: string) => void;
  /** 双击卡片空白处退回待办区。 */
  onReturn: (id: string) => void;
  onContextMenu: (id: string, x: number, y: number) => void;
  onDragBegin: (id: string, clientX: number, clientY: number) => void;
}

/** 一列办理栏：栏名双击可改；卡片可拖入、拖出、栏内排序。 */
export function BoardLane({
  lane,
  flexBasis,
  items,
  now,
  dropActive,
  landed,
  dropItemId,
  draggingId,
  editTitleRequest,
  onRenameLane,
  onToggle,
  onOpen,
  onRename,
  onStageChange,
  onTimeChange,
  onTimeTextChange,
  onReturn,
  onContextMenu,
  onDragBegin,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(lane.name);
  const escaped = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) return;
    setDraft(lane.name);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [editing, lane.name]);

  const commit = () => {
    if (escaped.current) {
      escaped.current = false;
      setEditing(false);
      return;
    }
    const value = Array.from(draft.trim()).slice(0, LIMITS.laneNameMax).join('');
    if (value && value !== lane.name) onRenameLane(lane.id, value);
    setEditing(false);
  };

  return (
    <section
      className={`lane ${dropActive ? 'is-drop-active' : ''} ${landed ? 'is-landed' : ''}`}
      data-lane-id={lane.id}
      style={flexBasis ? { flexBasis: `${flexBasis}px` } : undefined}
    >
      <header className="lane-head">
        <span className="lane-dot" aria-hidden="true" />
        {editing ? (
          <input
            ref={inputRef}
            className="lane-name-edit"
            value={draft}
            maxLength={LIMITS.laneNameMax}
            spellCheck={false}
            aria-label="编辑办理栏名称"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Enter') commit();
              if (event.key === 'Escape') {
                escaped.current = true;
                setEditing(false);
              }
            }}
            onBlur={commit}
          />
        ) : (
          <span
            className="lane-name"
            onDoubleClick={() => {
              escaped.current = false;
              setEditing(true);
            }}
            title={`${lane.name}（双击修改栏名）`}
          >
            {lane.name}
          </span>
        )}
        <span className="lane-count">{items.length}</span>
      </header>

      <div className="lane-cards" data-lane-cards data-scroll>
        {items.length === 0 ? (
          <div className="lane-empty">
            <span className="lane-empty-title">拖入卡片</span>
            <span className="lane-empty-desc">从左侧待办拖过来</span>
          </div>
        ) : (
          items.map((item) => (
            <LaneCard
              key={item.id}
              item={item}
              now={now}
              dragging={draggingId === item.id}
              dropTarget={dropItemId === item.id}
              editTitleSeq={editTitleRequest?.id === item.id ? editTitleRequest.seq : 0}
              onToggle={onToggle}
              onOpen={onOpen}
              onRename={onRename}
              onStageChange={onStageChange}
              onTimeChange={onTimeChange}
              onTimeTextChange={onTimeTextChange}
              onReturn={onReturn}
              onContextMenu={onContextMenu}
              onDragBegin={onDragBegin}
            />
          ))
        )}
      </div>
    </section>
  );
}
