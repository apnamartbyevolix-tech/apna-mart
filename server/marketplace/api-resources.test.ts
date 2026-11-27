import { describe, expect, it } from "vitest";
import express from "express";
import { createServer } from "node:http";
import { createApiGuard } from "./api-resources";
describe("application ingress ceilings", () => {
  it("limits a shared IP, ignores spoofed forwarding headers and keeps liveness available", async () => {
    let time = 1000;
    const app = express(); app.use(createApiGuard({ now: () => time, perIp: 2, perMinute: 10 })); app.get("/api/check", (_req,res) => res.json({ ok: true })); app.get("/api/health/live", (_req,res) => res.sendStatus(200));
    const server = createServer(app); await new Promise<void>(resolve => server.listen(0,"127.0.0.1",resolve));
    const origin = `http://127.0.0.1:${(server.address() as any).port}`;
    try {
      expect((await fetch(origin+"/api/check")).status).toBe(200);
      expect((await fetch(origin+"/api/check",{headers:{"X-Forwarded-For":"198.51.100.1"}})).status).toBe(200);
      expect((await fetch(origin+"/api/check",{headers:{"X-Forwarded-For":"198.51.100.2"}})).status).toBe(429);
      expect((await fetch(origin+"/api/health/live")).status).toBe(200);
      time += 60001; const next = await fetch(origin+"/api/check"); expect(next.status).toBe(200); expect(next.headers.get("x-content-type-options")).toBe("nosniff");
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });
  it("bounds active work and releases completed requests", async () => {
    let finish: (()=>void) | undefined, started: (()=>void) | undefined;
    const ready = new Promise<void>(resolve => started=resolve);
    const app = express();app.use(createApiGuard({ active: 1 }));app.get("/api/slow",(_req,res)=>{ finish=()=>res.json({ok:true});started!(); });app.get("/api/check",(_req,res)=>res.json({ok:true}));
    const server=createServer(app);await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const origin=`http://127.0.0.1:${(server.address() as any).port}`;
    try { const first=fetch(origin+"/api/slow");await ready;expect((await fetch(origin+"/api/check")).status).toBe(503);finish!();finish=undefined;expect((await first).status).toBe(200);expect((await fetch(origin+"/api/check")).status).toBe(200); }
    finally { finish?.();await new Promise<void>(resolve=>server.close(()=>resolve())); }
  });
});
