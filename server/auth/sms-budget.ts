import { sql } from "drizzle-orm";
export function smsBudgetWindows(now = new Date(), env: NodeJS.ProcessEnv = process.env) {
  const amount = (name: string, fallback: number) => {
    const value = env[name] === undefined ? fallback : Number(env[name]);
    if (!Number.isSafeInteger(value) || value < 0 || value > 1000000) throw Error("Invalid SMS spending limit configuration");
    return value;
  };
  const shifted = new Date(now.getTime() + 19800000), year = shifted.getUTCFullYear(), month = shifted.getUTCMonth(), day = shifted.getUTCDate();
  return [
    { key: "day:" + shifted.toISOString().slice(0, 10), max: amount("MTM_SMS_DAILY_LIMIT", 100), until: new Date(Date.UTC(year, month, day + 1) - 19800000) },
    { key: "month:" + shifted.toISOString().slice(0, 7), max: amount("MTM_SMS_MONTHLY_LIMIT", 1000), until: new Date(Date.UTC(year, month + 1, 1) - 19800000) },
  ];
}
/** Count attempts before calling the provider; ambiguous delivery never refunds a unit. */
export async function reserveSmsBudget(tx: any, keyFor: (key: string) => string, now = new Date(), env: NodeJS.ProcessEnv = process.env) {
  const windows = smsBudgetWindows(now, env).map(window => ({ ...window, bucket: keyFor("sms-budget:" + window.key) })).sort((a,b) => a.bucket.localeCompare(b.bucket));
  for (const window of windows) {
    await tx.execute(sql`INSERT INTO customer_auth_limits(bucket,hits,resets_at,last_at) VALUES(${window.bucket},0,${window.until},(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')) ON CONFLICT DO NOTHING`);
    const result = await tx.execute(sql`SELECT hits FROM customer_auth_limits WHERE bucket=${window.bucket} FOR UPDATE`);
    if (!result.rows[0] || result.rows[0].hits >= window.max) return false;
  }
  for (const window of windows) await tx.execute(sql`UPDATE customer_auth_limits SET hits=hits+1,last_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') WHERE bucket=${window.bucket}`);
  return true;
}
