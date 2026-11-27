import type { RequestHandler } from "express";

/** Process ceilings complement deployment-level edge and origin protection. */
export function createApiGuard(options: { now?: () => number; perIp?: number; perMinute?: number; active?: number; uploads?: number } = {}): RequestHandler {
  const now = options.now || Date.now, perIp = options.perIp ?? 1200, perMinute = options.perMinute ?? 6000;
  const windows = new Map<string, { count: number; until: number }>();
  let global = { count: 0, until: 0 }, active = 0, uploads = 0;
  return (req, res, next) => {
    res.set({ "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin", "X-Frame-Options": "DENY", "Permissions-Policy": "geolocation=(self), camera=(), microphone=()" });
    if (!req.path.startsWith("/api/") || req.path === "/api/health/live") { next(); return; }
    const at = now(), ip = req.ip || req.socket.remoteAddress || "unknown";
    const reject = () => { res.set("Retry-After", "60").status(429).json({ message: "Too many requests. Please wait a moment and try again." }); };
    if (global.until <= at) { global = { count: 0, until: at + 60000 }; for (const [key, row] of windows) if (row.until <= at) windows.delete(key); }
    if (++global.count > perMinute) { reject(); return; }
    let row = windows.get(ip);
    if (!row || row.until <= at) {
      if (!row && windows.size >= 10000) { reject(); return; }
      row = { count: 0, until: at + 60000 }; windows.set(ip, row);
    }
    if (++row.count > (req.path.startsWith("/api/internal/") ? perMinute : perIp)) { reject(); return; }
    const upload = !!req.headers["transfer-encoding"] || Number(req.headers["content-length"] || 0) > 131072;
    if (active >= (options.active ?? 256) || upload && uploads >= (options.uploads ?? 8)) {
      res.set("Retry-After", "2").status(503).json({ message: "The service is busy. Your existing orders are safe. Please try again shortly." }); return;
    }
    active++; if (upload) uploads++;
    let complete = false;
    const release = () => { if (complete) return; complete = true; active--; if (upload) uploads--; };
    res.once("finish", release); res.once("close", release); next();
  };
}
