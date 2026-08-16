export function debounce<T extends (...args: any[]) => void>(fn: T, ms = 300): T {
  let t: number | null = null;
  return ((...args: any[]) => {
    if (t) window.clearTimeout(t);
    t = window.setTimeout(() => fn(...args), ms);
  }) as T;
}

/** 等待事件（如 echarts-ready / load）后执行，避免竞态 */
export function afterEvent(name: string, fn: () => void, timeoutMs = 5000): void {
  const done = () => {
    window.removeEventListener(name, done);
    fn();
  };
  window.addEventListener(name, done);
  window.setTimeout(() => {
    window.removeEventListener(name, done);
    fn();
  }, timeoutMs);
}

/** 图表注册表：页面切换时统一 resize */
const chartInsts = new Set<any>();
export function regChart(inst: any): void {
  chartInsts.add(inst);
}
export function resizeCharts(): void {
  chartInsts.forEach((c) => {
    try {
      c.resize();
    } catch {
      /* noop */
    }
  });
}

export function fmt(n: number | undefined | null, digits = 0): string {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toFixed(digits);
}