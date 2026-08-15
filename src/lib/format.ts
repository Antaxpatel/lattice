export function n(v: unknown, fallback = 0): number {
  const x = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(x) ? x : fallback;
}

export function fmtNum(v: unknown, digits = 1): string {
  const x = n(v);
  if (Math.abs(x) >= 1000) return x.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return x.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export function fmtGb(v: unknown, digits = 2): string {
  return `${fmtNum(v, digits)} GB`;
}

export function fmtTps(v: unknown): string {
  const x = n(v);
  if (x < 0.1) return '<0.1 tok/s';
  if (x >= 100) return `${Math.round(x)} tok/s`;
  return `${x.toFixed(1)} tok/s`;
}

export function fmtParams(b: unknown): string {
  const x = n(b);
  if (x >= 100) return `${x.toFixed(0)}B`;
  if (x >= 10) return `${x.toFixed(1)}B`;
  return `${x.toFixed(2)}B`.replace(/\.00B$/, 'B');
}

export function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const s = Math.max(1, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
