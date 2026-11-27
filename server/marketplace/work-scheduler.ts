const listeners = new Set<() => void>();
export const notifyOrderWork = () => { for (const listener of listeners) listener(); };
export const MAX_ORDER_SYNC_ATTEMPTS = 8;
export const orderRetryDelay = (attempt: number) => Math.min(900000, 10000 * 2 ** Math.min(7, Math.max(0, attempt)));

export function startOrderWorker(work: () => Promise<{ count: number; nextAt?: number }>) {
  let timer: ReturnType<typeof setTimeout> | undefined, stopped = false, running = false, idle = 0, wakePending = false;
  const schedule = (delay: number) => { if (stopped) return; if (timer) clearTimeout(timer); timer = setTimeout(tick, Math.max(1000, delay)); timer.unref(); };
  const wake = () => { idle = 0; if (running) wakePending = true; else schedule(1000); };
  const tick = async () => {
    if (stopped || running) return;
    running = true; let nextAt = 0;
    try { const result = await work(); idle = result.count ? 0 : Math.min(5, idle + 1); nextAt = result.nextAt || 0; }
    catch { idle = Math.min(5, idle + 1); console.warn("Order synchronization deferred; persisted retries are retained."); }
    finally {
      running = false;
      const delay = [2000,15000,30000,60000,300000,900000][idle];
      schedule(wakePending ? 1000 : Math.min(delay, nextAt > Date.now() ? nextAt - Date.now() : 900000)); wakePending = false;
    }
  };
  listeners.add(wake); schedule(2000);
  return () => { stopped = true; listeners.delete(wake); if (timer) clearTimeout(timer); };
}
