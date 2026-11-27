import type { Express } from "express";
export function cachedReadiness(check: () => Promise<void>, now = Date.now) {
  let until = 0,
    ready = false,
    pending: Promise<boolean> | undefined;
  return () => {
    if (now() < until) return Promise.resolve(ready);
    if (pending) return pending;
    pending = check()
      .then(
        () => {
          ready = true;
        },
        () => {
          ready = false;
        }
      )
      .then(() => {
        until = now() + (ready ? 15000 : 3000);
        pending = undefined;
        return ready;
      });
    return pending;
  };
}
export function registerHealth(app: Express, check: () => Promise<void>) {
  const ready = cachedReadiness(check);
  app.get("/api/health/live", (_req, res) => {
    res.set("Cache-Control", "no-store").json({ status: "ok" });
  });
  for (const path of ["/api/health", "/api/health/ready"])
    app.get(path, async (_req, res) => {
      const ok = await ready();
      res
        .set("Cache-Control", "no-store")
        .status(ok ? 200 : 503)
        .json({ status: ok ? "ok" : "unavailable" });
    });
}
