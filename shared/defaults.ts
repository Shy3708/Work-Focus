import type { AppData, WorkItem } from './types';
import { createDefaultLanes } from './lanes';

/** 示例项目卡片：首次启动时的引导数据，不包含任何个人信息。 */
function timeCode(daysFromNow: number, hour: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}${day}${String(hour).padStart(2, '0')}`;
}

export function createDefaultData(): AppData {
  const now = new Date().toISOString();

  const sample = (
    id: string,
    title: string,
    subtitle: string,
    stage: string,
    extra: Partial<WorkItem>,
  ): WorkItem => ({
    id,
    title,
    subtitle,
    stage,
    time: '',
    timeMode: 'countdown',
    timeText: '',
    pinned: false,
    category: 'work',
    laneId: null,
    note: '',
    status: 'inactive',
    order: 0,
    createdAt: now,
    updatedAt: now,
    ...extra,
  });

  const items: WorkItem[] = [
    sample('sample-1', '官网首页改版', '首页视觉与文案升级', '方案评审', {
      time: timeCode(3, 18),
      status: 'active',
      pinned: true,
    }),
    sample('sample-2', '用户反馈整理', '汇总本周各渠道反馈', '需求确认', {
      time: timeCode(1, 20),
      status: 'active',
    }),
    sample('sample-3', '周报整理', '整理项目进展与风险', '撰写中', {}),
    sample('sample-4', '周末徒步', '规划路线与装备', '路线规划', {
      category: 'life',
      timeMode: 'custom',
      timeText: '本周六出发',
    }),
    sample('sample-5', '接口联调', '登录与数据接口对接', '联调中', {
      laneId: 'lane-self',
      status: 'active',
      time: timeCode(2, 14),
    }),
    sample('sample-6', '健身计划', '每周三次力量训练', '训练中', {
      laneId: 'lane-self',
      status: 'active',
      category: 'life',
      timeMode: 'custom',
      timeText: '每周 3 次',
    }),
    sample('sample-7', '视觉素材', '等待设计稿交付', '等待设计稿', {
      laneId: 'lane-other',
      status: 'active',
      time: timeCode(5, 12),
    }),
    sample('sample-8', '合同审核', '等待法务反馈', '法务审核', {
      laneId: 'lane-wait',
      status: 'active',
    }),
  ];

  return {
    schemaVersion: 1,
    items: items.map((item, index) => ({ ...item, order: index })),
    settings: {
      viewMode: 'standard',
      alwaysOnTop: false,
      lanes: createDefaultLanes(),
    },
  };
}
