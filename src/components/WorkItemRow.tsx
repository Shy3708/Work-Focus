import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { WorkItem } from '../../shared/types';
import { LIMITS } from '../../shared/types';
import { formatRemaining, formatTimeCode, normalizeTimeCode, resolveTimeCode } from '../../shared/time';
import { StatusOrb } from './StatusOrb';
import { ChevronRightIcon } from './icons';

type EditField = 'title' | 'subtitle' | 'stage' | 'time' | 'timeText';

interface Props {
  item: WorkItem;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  onRename: (id: string, patch: { title?: string; subtitle?: string }) => void;
  onStageChange: (id: string, stage: string) => void;
  onTimeChange: (id: string, time: string) => void;
  /** 正推模式下的自定义内容。 */
  onTimeTextChange: (id: string, text: string) => void;
  /** 右键菜单「编辑标题」的自增信号：>0 且变化时进入行内编辑。 */
  editTitleSeq: number;
  /** 右键打开该行的菜单（置顶等）。 */
  onContextMenu: (id: string, x: number, y: number) => void;
  /** 进入 / 退出行内编辑：编辑期间暂停自动排序，避免边打字边跳。 */
  onEditingChange: (active: boolean) => void;
  /** 当前时间戳（App 每 30 秒刷新一次），用于计算剩余进度。 */
  now: number;
  /** 拖动开始时把 id 与指针位置交给 App：幽灵卡片、落点与落位动画由 App 统一处理。 */
  onDragBegin: (id: string, clientX: number, clientY: number) => void;
  onDragEnd: () => void;
  dragging: boolean;
  dropTarget: boolean;
}

/**
 * 一行任务：
 * - 点击右侧箭头 → 打开该事项的备注页（点击其他区域不会进入）
 * - 双击标题 / 副标题 → 就地编辑（Enter 保存、Esc 取消）
 * - 点左侧灯球 → 切换亮 / 灭
 * - 按住左侧灯球拖动 → 调整上下顺序（位移超过 5px 才算拖动，否则按点击处理）
 * - 阶段/时间填好后显示为标签，点标签即进入编辑
 */
export function WorkItemRow({
  item,
  onToggle,
  onOpen,
  onRename,
  onStageChange,
  onTimeChange,
  onTimeTextChange,
  editTitleSeq,
  onContextMenu,
  onEditingChange,
  now,
  onDragBegin,
  onDragEnd,
  dragging,
  dropTarget,
}: Props) {
  const active = item.status === 'active';
  const drag = useRef<{ x: number; y: number; moved: boolean; toggle: boolean } | null>(null);
  const [editing, setEditing] = useState<EditField | null>(null);
  const [draft, setDraft] = useState('');
  const escaped = useRef(false);

  // 右键菜单选了「编辑标题」：直接在本行进入标题编辑
  const appliedEditSeq = useRef(0);
  useEffect(() => {
    if (editTitleSeq <= appliedEditSeq.current) return;
    appliedEditSeq.current = editTitleSeq;
    escaped.current = false;
    setDraft(item.title);
    setEditing('title');
  }, [editTitleSeq, item.title]);

  // 剩余进度：从"创建时间"到"截止时间"这段区间里，现在还剩下多少
  // 正推模式不做倒计时，时间格里只显示用户自定义的内容
  const manual = item.timeMode === 'custom';
  const due = !manual && item.time ? resolveTimeCode(item.time, new Date(now)) : null;
  const remaining = due ? due.getTime() - now : 0;
  const createdTs = Date.parse(item.createdAt);
  const total = due
    ? Math.max(due.getTime() - (Number.isFinite(createdTs) ? createdTs : now), 60 * 60 * 1000)
    : 0;
  const ratio = due ? Math.min(Math.max(remaining / total, 0), 1) : 0;
  const expired = Boolean(due) && remaining <= 0;
  // 过期时整条变红；剩余极少时保底 3%，避免看起来像没填
  const fillPercent = expired ? 100 : due ? Math.max(Math.round(ratio * 100), 3) : 0;
  // 冷 → 暖：富余时保持蓝色，越接近截止越快转暖，最终到红（205 → 355）
  const hue = Math.round(205 + 150 * Math.pow(1 - ratio, 1.6));

  // 编辑状态变化时通知 App 冻结 / 恢复自动排序（回调走 ref，避免每次渲染重新绑定）
  const editingCallback = useRef(onEditingChange);
  editingCallback.current = onEditingChange;
  useEffect(() => {
    if (editing === null) return;
    editingCallback.current(true);
    return () => editingCallback.current(false);
  }, [editing]);

  const begin = (event: ReactPointerEvent<HTMLElement>): void => {
    if (event.button !== 0) return;
    const target = event.target as Element;
    // 按钮 / 输入框不参与拖动，避免抢掉点击与编辑（灯球本身仍可作为拖动抓手）
    if (target.closest('button:not(.orb-hit), input, textarea')) return;
    event.stopPropagation();
    drag.current = { x: event.clientX, y: event.clientY, moved: false, toggle: false };
  };

  /** 灯球按下：捕获指针，保证松手时还能收到 pointerup 完成点击。 */
  const beginOrb = (event: ReactPointerEvent<HTMLElement>): void => {
    begin(event);
    if (!drag.current) return;
    drag.current.toggle = true;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const move = (event: ReactPointerEvent<HTMLElement>): void => {
    const state = drag.current;
    if (!state || state.moved) return;
    if (Math.hypot(event.clientX - state.x, event.clientY - state.y) < 5) return;
    state.moved = true;
    // 真正开始拖动后才捕获指针：按下即捕获会让双击事件改投到行容器，破坏双击编辑
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // 指针已失效时忽略
    }
    onDragBegin(item.id, event.clientX, event.clientY);
  };

  const finish = (event: ReactPointerEvent<HTMLElement>): void => {
    const state = drag.current;
    drag.current = null;
    if (!state) return;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // 指针已释放时忽略
    }
    // 拖动中的 pointerup 会冒泡到 window，由 App 统一收尾（落位动画）
    if (!state.moved && state.toggle) onToggle(item.id);
  };

  const cancel = (event: ReactPointerEvent<HTMLElement>): void => {
    const state = drag.current;
    drag.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // 指针已释放时忽略
    }
    if (state?.moved) onDragEnd();
  };

  const handleTextDoubleClick = (event: React.MouseEvent<HTMLSpanElement>) => {
    const fieldEl = (event.target as Element).closest('[data-field]');
    const field = fieldEl?.getAttribute('data-field') === 'subtitle' ? 'subtitle' : 'title';
    escaped.current = false;
    setDraft(item[field]);
    setEditing(field);
  };

  const commitText = () => {
    if (editing !== 'title' && editing !== 'subtitle') return;
    if (escaped.current) {
      escaped.current = false;
      setEditing(null);
      return;
    }
    const value = draft.trim();
    if (value && value !== item[editing]) {
      onRename(item.id, editing === 'title' ? { title: value } : { subtitle: value });
    }
    setEditing(null);
  };

  const textKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === 'Enter') {
      commitText();
    } else if (event.key === 'Escape') {
      escaped.current = true;
      setEditing(null);
    }
  };

  return (
    <div
      className={`item-row cat-${item.category} ${active ? 'is-active' : ''} ${item.pinned ? 'is-pinned' : ''} ${
        dragging ? 'is-dragging' : ''
      } ${dropTarget ? 'is-drop-target' : ''}`}
      data-item-id={item.id}
      role="button"
      tabIndex={0}
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={cancel}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onContextMenu(item.id, event.clientX, event.clientY);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(item.id);
        }
      }}
      aria-label={`${item.title}，${active ? '正在推进' : '暂未推进'}，标签：${item.category === 'work' ? '工作' : '生活'}，按住卡片可拖入办理栏，点击右侧箭头打开备注，双击标题可编辑`}
    >
      <button
        type="button"
        className="orb-hit"
        onPointerDown={beginOrb}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={cancel}
        onClick={(event) => event.stopPropagation()}
        title="点击切换状态，按住左侧拖入右侧办理栏"
        aria-pressed={active}
        aria-label={`${item.title}：${active ? '正在推进' : '暂未推进'}，点击切换`}
      >
        <StatusOrb status={item.status} category={item.category} />
      </button>

      <span className="row-text" onDoubleClick={handleTextDoubleClick}>
        {editing === 'title' ? (
          <input
            className="row-edit"
            type="text"
            value={draft}
            autoFocus
            maxLength={LIMITS.titleMax}
            spellCheck={false}
            aria-label="编辑标题"
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={textKeyDown}
            onBlur={commitText}
          />
        ) : (
          <span className="row-title" data-field="title" title={`${item.title}（双击编辑）`}>
            {item.title}
          </span>
        )}
        {editing === 'subtitle' ? (
          <input
            className="row-edit is-sub"
            type="text"
            value={draft}
            autoFocus
            maxLength={LIMITS.subtitleMax}
            spellCheck={false}
            aria-label="编辑副标题"
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={textKeyDown}
            onBlur={commitText}
          />
        ) : item.subtitle ? (
          <span className="row-sub" data-field="subtitle" title={`${item.subtitle}（双击编辑）`}>
            {item.subtitle}
          </span>
        ) : null}
      </span>

      {manual ? null : editing === 'stage' ? (
        <input
          className="row-stage"
          type="text"
          value={item.stage}
          autoFocus
          placeholder="阶段 / 设备"
          maxLength={LIMITS.stageMax}
          spellCheck={false}
          title="填写当前阶段 / 运行设备"
          aria-label={`${item.title} 当前阶段与运行设备`}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Enter' || event.key === 'Escape') setEditing(null);
          }}
          onBlur={() => setEditing(null)}
          onChange={(event) => onStageChange(item.id, event.target.value)}
        />
      ) : (
        <button
          type="button"
          className={`row-tag ${item.stage ? '' : 'is-empty'}`}
          title={item.stage ? `${item.stage}（点击修改）` : '点击填写阶段 / 设备'}
          aria-label={`${item.title} 当前阶段与运行设备：${item.stage || '未填写'}`}
          onClick={(event) => {
            event.stopPropagation();
            setEditing('stage');
          }}
        >
          {item.stage || '阶段 / 设备'}
        </button>
      )}

      {/* 正推模式：阶段格与时间格合并成一个宽格，只放自定义内容 */}
      <span className={`time-col ${manual ? 'is-merged' : ''}`}>
        {manual ? (
          editing === 'timeText' ? (
            <input
              className="row-time is-custom"
              type="text"
              value={item.timeText}
              autoFocus
              placeholder="正推内容"
              maxLength={LIMITS.timeTextMax}
              spellCheck={false}
              title="正推模式：输入任意自定义内容，例如「第 3 周」「持续中」"
              aria-label={`${item.title} 的正推内容`}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === 'Enter' || event.key === 'Escape') setEditing(null);
              }}
              onBlur={() => setEditing(null)}
              onChange={(event) => onTimeTextChange(item.id, event.target.value)}
            />
          ) : (
            <button
              type="button"
              className={`row-tag row-tag-time is-custom ${item.timeText ? '' : 'is-empty'}`}
              title={
                item.timeText
                  ? `${item.timeText}（正推模式，点击修改；右键可切回倒计时）`
                  : '正推模式：点击输入自定义内容；右键可切回倒计时'
              }
              aria-label={`${item.title} 的正推内容：${item.timeText || '未填写'}`}
              onClick={(event) => {
                event.stopPropagation();
                setEditing('timeText');
              }}
            >
              {item.timeText || '正推 · 自定义内容'}
            </button>
          )
        ) : editing === 'time' ? (
          <input
            className="row-time"
            type="text"
            inputMode="numeric"
            value={item.time}
            autoFocus
            placeholder="时间"
            spellCheck={false}
            title="输入 6 位数字：月月日日时时，例如 110202 → 11月2日2点"
            aria-label={`${item.title} 的时间`}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Enter' || event.key === 'Escape') setEditing(null);
            }}
            onBlur={() => setEditing(null)}
            onChange={(event) => {
              const digits = normalizeTimeCode(event.target.value);
              // 过滤掉非数字后同步回 DOM，避免受控值未变化时框内残留字母
              if (event.target.value !== digits) event.target.value = digits;
              onTimeChange(item.id, digits);
            }}
          />
        ) : (
          <button
            type="button"
            className={`row-tag row-tag-time ${item.time ? '' : 'is-empty'} ${expired ? 'is-due' : ''}`}
            title={
              item.time
                ? expired
                  ? `${formatTimeCode(item.time)}（已到期）`
                  : `${formatTimeCode(item.time)}（点击修改，输入 6 位数字）`
                : '点击填写时间，如 110202'
            }
            aria-label={`${item.title} 的时间：${item.time ? formatTimeCode(item.time) : '未填写'}`}
            onClick={(event) => {
              event.stopPropagation();
              setEditing('time');
            }}
          >
            {item.time ? formatTimeCode(item.time) : '时间'}
          </button>
        )}
        {/* 剩余进度：右侧保留、左端随时间向右吃掉；颜色由蓝转红，到期整条变红并呼吸。
            正推模式没有截止时间，不显示进度条 */}
        {manual ? null : (
          <span
            className={`row-progress ${expired ? 'is-over' : ''}`}
            title={due ? `${formatRemaining(remaining)}（截止 ${formatTimeCode(item.time)}）` : ''}
            aria-hidden="true"
          >
            <span
              className="row-progress-fill"
              style={
                expired
                  ? { width: '100%' }
                  : {
                      width: `${fillPercent}%`,
                      background: `linear-gradient(90deg, hsl(${hue} 92% 74%), hsl(${hue} 88% 58%))`,
                    }
              }
            />
          </span>
        )}
      </span>

      <button
        type="button"
        className="row-open"
        onClick={(event) => {
          event.stopPropagation();
          onOpen(item.id);
        }}
        title="打开详情 / 备注"
        aria-label={`${item.title}：打开详情 / 备注`}
      >
        <ChevronRightIcon width={15} height={15} />
      </button>
    </div>
  );
}
