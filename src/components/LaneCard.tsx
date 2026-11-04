import { useEffect, useRef, useState } from 'react';
import type {
  ChangeEvent as ReactChangeEvent,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import type { WorkItem } from '../../shared/types';
import { LIMITS } from '../../shared/types';
import { formatRemaining, resolveTimeCode } from '../../shared/time';
import { StatusOrb } from './StatusOrb';
import { ChevronRightIcon } from './icons';

type Field = 'title' | 'subtitle' | 'stage' | 'time' | 'timeText';

interface Props {
  item: WorkItem;
  now: number;
  dragging: boolean;
  dropTarget: boolean;
  /** 右键菜单「编辑标题」的自增信号。 */
  editTitleSeq: number;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  onRename: (id: string, patch: { title?: string; subtitle?: string }) => void;
  onStageChange: (id: string, stage: string) => void;
  onTimeChange: (id: string, time: string) => void;
  onTimeTextChange: (id: string, text: string) => void;
  /** 双击卡片空白处 → 退回待办区。 */
  onReturn: (id: string) => void;
  onContextMenu: (id: string, x: number, y: number) => void;
  onDragBegin: (id: string, clientX: number, clientY: number) => void;
}

/**
 * 办理栏里的紧凑卡片：
 * - 按住卡片拖动（超过 5px 才算拖动），可跨栏移动或拖回待办
 * - 点灯球熄灭 → 回到待办；点行尾箭头 → 进入详情
 * - 双击标题 / 副标题 / 阶段 / 时间就地编辑；双击卡片空白处 → 直接回到待办
 */
export function LaneCard({
  item,
  now,
  dragging,
  dropTarget,
  editTitleSeq,
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
  const press = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const [field, setField] = useState<Field | null>(null);
  const [draft, setDraft] = useState('');
  const escaped = useRef(false);

  const appliedEditSeq = useRef(0);
  useEffect(() => {
    if (editTitleSeq <= appliedEditSeq.current) return;
    appliedEditSeq.current = editTitleSeq;
    escaped.current = false;
    setDraft(item.title);
    setField('title');
  }, [editTitleSeq, item.title]);

  const active = item.status === 'active';
  const due = item.timeMode === 'custom' || !item.time ? null : resolveTimeCode(item.time, new Date(now));
  const remaining = due ? due.getTime() - now : null;
  const expired = remaining !== null && remaining <= 0;
  const timeLabel =
    item.timeMode === 'custom'
      ? item.timeText
      : remaining === null
        ? ''
        : expired
          ? '已到期'
          : formatRemaining(remaining).replace('还剩 ', '');

  const pressDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const target = event.target as Element;
    if (target.closest('button, input, textarea')) return;
    press.current = { x: event.clientX, y: event.clientY, moved: false };
  };

  const pressMove = (event: ReactPointerEvent<HTMLElement>) => {
    const state = press.current;
    if (!state || state.moved) return;
    if (Math.hypot(event.clientX - state.x, event.clientY - state.y) < 5) return;
    state.moved = true;
    // 越过拖动阈值后才捕获指针：按下即捕获会让双击事件改投到卡片，破坏双击文字编辑
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // 指针已失效时忽略
    }
    onDragBegin(item.id, event.clientX, event.clientY);
  };

  const pressUp = (event: ReactPointerEvent<HTMLElement>) => {
    press.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // 指针已释放时忽略
    }
  };

  const startField = (next: Field, value: string) => {
    escaped.current = false;
    setDraft(value);
    setField(next);
  };

  const commitField = () => {
    const current = field;
    if (!current) return;
    if (escaped.current) {
      escaped.current = false;
      setField(null);
      return;
    }
    const value = draft.trim();
    if (current === 'title') {
      if (value && value !== item.title) onRename(item.id, { title: value });
    } else if (current === 'subtitle') {
      if (value !== item.subtitle) onRename(item.id, { subtitle: value });
    } else if (current === 'stage') {
      if (value !== item.stage) onStageChange(item.id, value);
    } else if (current === 'time') {
      if (value !== item.time) onTimeChange(item.id, value);
    } else if (value !== item.timeText) {
      onTimeTextChange(item.id, value);
    }
    setField(null);
  };

  const editorProps = {
    className: 'lane-card-edit',
    value: draft,
    autoFocus: true,
    spellCheck: false,
    onPointerDown: (event: ReactPointerEvent<HTMLInputElement>) => event.stopPropagation(),
    onChange: (event: ReactChangeEvent<HTMLInputElement>) => setDraft(event.target.value),
    onKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => {
      event.stopPropagation();
      if (event.key === 'Enter') commitField();
      if (event.key === 'Escape') {
        escaped.current = true;
        setField(null);
      }
    },
    onBlur: commitField,
  };

  return (
    <article
      className={`lane-card cat-${item.category} ${active ? 'is-active' : ''} ${dragging ? 'is-dragging' : ''} ${
        dropTarget ? 'is-drop-target' : ''
      }`}
      data-item-id={item.id}
      onPointerDown={pressDown}
      onPointerMove={pressMove}
      onPointerUp={pressUp}
      onPointerCancel={pressUp}
      onDoubleClick={(event) => {
        if (field) return;
        const target = event.target as Element;
        // 文字 / 按钮 / 输入框各自处理，只有卡片空白处才回到待办
        if (target.closest('.lane-card-title, .lane-card-sub, .lane-chip, .lane-time, button, input')) return;
        onReturn(item.id);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onContextMenu(item.id, event.clientX, event.clientY);
      }}
      title={`${item.title} · 按住可拖动；双击文字编辑，双击空白处回到待办`}
    >
      <div className="lane-card-top">
        <button
          type="button"
          className="lane-card-orb"
          onClick={(event) => {
            event.stopPropagation();
            onToggle(item.id);
          }}
          title="点击熄灭并回到待办"
          aria-label={`${item.title}：点击熄灭并回到待办`}
        >
          <StatusOrb status={item.status} category={item.category} size="compact" />
        </button>
        {field === 'title' ? (
          <input {...editorProps} maxLength={LIMITS.titleMax} aria-label="编辑标题" />
        ) : (
          <span
            className="lane-card-title"
            onDoubleClick={(event) => {
              event.stopPropagation();
              startField('title', item.title);
            }}
            title={`${item.title}（双击编辑）`}
          >
            {item.title}
          </span>
        )}
        <button
          type="button"
          className="lane-card-open"
          onClick={(event) => {
            event.stopPropagation();
            onOpen(item.id);
          }}
          title="打开详情 / 备注"
          aria-label={`${item.title}：打开详情 / 备注`}
        >
          <ChevronRightIcon width={13} height={13} />
        </button>
      </div>

      {field === 'subtitle' ? (
        <input {...editorProps} className="lane-card-edit lane-card-edit--sub" maxLength={LIMITS.subtitleMax} aria-label="编辑副标题" />
      ) : item.subtitle ? (
        <span
          className="lane-card-sub"
          onDoubleClick={(event) => {
            event.stopPropagation();
            startField('subtitle', item.subtitle);
          }}
          title={`${item.subtitle}（双击编辑）`}
        >
          {item.subtitle}
        </span>
      ) : null}

      {field === 'stage' || field === 'time' || field === 'timeText' || item.stage || timeLabel ? (
        <div className="lane-card-foot">
          {field === 'stage' ? (
            <input {...editorProps} className="lane-card-edit lane-card-edit--chip" maxLength={LIMITS.stageMax} aria-label="编辑阶段 / 设备" />
          ) : item.stage ? (
            <span
              className="lane-chip"
              onDoubleClick={(event) => {
                event.stopPropagation();
                startField('stage', item.stage);
              }}
              title={`${item.stage}（双击编辑）`}
            >
              {item.stage}
            </span>
          ) : null}
          {field === 'time' ? (
            <input
              {...editorProps}
              className="lane-card-edit lane-card-edit--chip"
              maxLength={6}
              inputMode="numeric"
              aria-label="编辑时间码"
            />
          ) : field === 'timeText' ? (
            <input
              {...editorProps}
              className="lane-card-edit lane-card-edit--chip"
              maxLength={LIMITS.timeTextMax}
              aria-label="编辑正推内容"
            />
          ) : timeLabel ? (
            <span
              className={`lane-time ${expired ? 'is-due' : ''} ${item.timeMode === 'custom' ? 'is-custom' : ''}`}
              onDoubleClick={(event) => {
                event.stopPropagation();
                startField(item.timeMode === 'custom' ? 'timeText' : 'time', item.timeMode === 'custom' ? item.timeText : item.time);
              }}
              title="双击编辑时间"
            >
              {timeLabel}
            </span>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
