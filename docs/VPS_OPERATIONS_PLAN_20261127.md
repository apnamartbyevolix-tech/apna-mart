# Monthly VPS plan — 27 November 2026

## Decision

No purchase/migration in this local work. Keep Cloudflare frontend while validating one monthly VPS for two APIs/workers and separate PostgreSQL databases. Start evaluation around 4vCPU/16GB RAM or a nearby suitable plan, with no Ollama. This is trial sizing, not verified capacity for 200 shops/200 shoppers. Shared CPU, storage and region matter. One VPS is a common failure domain for both apps/database.

Contabo is a budget candidate; its public Cloud VPS tiers include 12GB/24GB rather than a directly matching16GB tier. Compare its24GB choice with a Hetzner16GB option using actual monthly checkout totals and a suitable region. Promotional long-term prices are not a verified one-month bill. Include tax, region, setup, disk, backup, traffic and cancellation. Do not prepay a long term before a trial.

Primary sources checked: [Contabo VPS](https://contabo.com/en-us/vps/), [monthly setup-fee explanation](https://help.contabo.com/en/support/solutions/articles/103000398194-why-is-there-a-setup-fee-on-my-core-vps-4-storage-vps-10-order-), [Hetzner Cloud](https://www.hetzner.com/cloud/), [Singapore region](https://www.hetzner.com/de/cloud-singapore/). Recheck at purchase; no purchase made.

## Deployment shape

Cloudflare frontend → protected HTTPS reverse proxy → separate Galla/Mart services. PostgreSQL accepts private/loopback traffic only, with separate least-privilege databases/roles and migration credentials. Preserve Galla tenant RLS and fictional reviewer isolation. Peer traffic keeps TLS and pinned service identities; private values never become frontend variables. Do not blindly copy Render's trusted-proxy hop count onto a different network.

## Controls

- Edge rate/body/WAF policies plus origin restrictions; an exposed origin defeats edge-only protection. Trust actual proxy sources only.
- Non-root services with memory/CPU/process bounds, bounded restart policy and log retention. Size combined database pools and monitor waits, query/lock deadlines, disk and memory.
- Mart defaults: publicIP1,200/minute, global6,000/minute,256 active requests, eight large/chunked uploads,10,000 rate buckets, tRPC batch10, JSON3MB/urlencoded64KB. Service routes remain authenticated. Process counters reset on restart; replicas require a shared edge policy. Shared mobile NAT may require tuning.
- Persistent OTP defaults100/day and1,000/month per app. Simulated/reviewer flows must not send live SMS. Reserve before sending; ambiguous failures consume a slot. Choose limits using actual provider rates and signup demand. Count ceilings are not an exact money cap.
- Optional cached location lookup: fixed provider, deadlines, rate limit and1,000/process/day default. No continuous background GPS.
- Workers back off on idle/errors and stop automatic order retries at eight. Recovery retains original keys. Galla publishing UI stops after ten visible refresh attempts. No launch AI or paid graph extraction.
- Billing alerts do not stop execution unless the provider explicitly enforces a hard cap. Monitor traffic, failed work, queue age, database growth and provider requests; document an incident shutoff procedure.

## Backups and acceptance

Encrypt scheduled database backups and keep an offsite copy with restricted access. Restore into a separate test database regularly. A same-provider server snapshot is not a complete offsite database strategy. Set retention/recovery objectives from business needs; no recovery-time guarantee was invented.

The local fictional dump restored with31 public-table count/content-digest matches. Production backup/restore approval remains separate. Never restore fixtures into production or drop additive columns to roll back code. Reconcile accepted order/cash/invoice/stock IDs before any retry.

Before traffic switch, run representative hot-SKU checkout, catalogue publication, owner fulfillment, server restart, queue exhaustion, provider failure and long soak. Measure resource use, p50/p95, locks, pool waits and errors against agreed thresholds. Current600 local read checks are smoke evidence only. Verify TLS renewal, real firewall, backups, redacted logs, notifications and privacy declarations. Keep the former service/database available for a planned rollback window.
