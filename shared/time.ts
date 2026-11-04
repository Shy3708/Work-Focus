/**
 * 时间码：6 位数字 MMDDHH，例如 110202 → 11月2日2点、123118 → 12月31日18点。
 * 只存原始数字串，展示时再格式化成中文。
 */
export const TIME_CODE_LENGTH = 6;

/** 只保留数字并截到 6 位。 */
export function normalizeTimeCode(input: string): string {
  return input.replace(/\D/g, '').slice(0, TIME_CODE_LENGTH);
}

export function parseTimeCode(input: string): { month: number; day: number; hour: number } | null {
  const code = normalizeTimeCode(input);
  if (code.length !== TIME_CODE_LENGTH) return null;
  const month = Number(code.slice(0, 2));
  const day = Number(code.slice(2, 4));
  const hour = Number(code.slice(4, 6));
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23) return null;
  return { month, day, hour };
}

/** 合法时展示为「11月2日2点」，位数不足或数值越界时原样展示输入的数字。 */
export function formatTimeCode(input: string): string {
  const parsed = parseTimeCode(input);
  if (!parsed) return normalizeTimeCode(input);
  return `${parsed.month}月${parsed.day}日${parsed.hour}点`;
}

/** 时间码里没有年份：按当前年推断，若已过去很久则视为明年，避免截止时间落在过去。 */
export function resolveTimeCode(input: string, now: Date = new Date()): Date | null {
  const parsed = parseTimeCode(input);
  if (!parsed) return null;
  const due = new Date(now.getFullYear(), parsed.month - 1, parsed.day, parsed.hour, 0, 0, 0);
  if (due.getTime() < now.getTime() - 180 * 24 * 60 * 60 * 1000) {
    due.setFullYear(now.getFullYear() + 1);
  }
  return due;
}

/** 剩余时长的口语化文案，用于进度条的悬停提示。 */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return '已过期';
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `还剩 ${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `还剩 ${hours} 小时`;
  const days = Math.floor(hours / 24);
  return `还剩 ${days} 天`;
}
