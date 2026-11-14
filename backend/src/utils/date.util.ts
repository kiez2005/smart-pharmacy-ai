/**
 * Kiểm tra chuỗi ngày ISO `YYYY-MM-DD` có phải ngày lịch hợp lệ và chưa hết hạn (>= hôm nay).
 */
export function isValidFutureIsoDate(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false;

  const [yStr, mStr, dStr] = trimmed.split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  const day = Number(dStr);
  const utc = new Date(Date.UTC(year, month - 1, day));

  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() + 1 !== month ||
    utc.getUTCDate() !== day
  ) {
    return false;
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  return trimmed >= todayIso;
}
