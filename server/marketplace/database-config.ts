import type { PoolConfig } from "pg";
export type LocalDatabasePurpose = "development" | "integration";
function parse(rawUrl: string | undefined) {
  if (!rawUrl) throw new Error("DATABASE_URL is missing or empty.");
  let u: URL;
  try { u = new URL(rawUrl); } catch { throw new Error("Malformed database connection URL."); }
  if (!["postgres:", "postgresql:"].includes(u.protocol)) throw new Error("Invalid database protocol; expected PostgreSQL.");
  if (u.hash) throw new Error("Database URL fragments are not permitted.");
  let database: string, user: string, password: string;
  try {
    database=decodeURIComponent(u.pathname.slice(1)); user=decodeURIComponent(u.username); password=decodeURIComponent(u.password);
  } catch { throw new Error("Malformed database URL encoding."); }
  if (!/^[a-zA-Z0-9_]+$/.test(database)) throw new Error("Database name is not permitted.");
  const port=u.port ? Number(u.port) : 5432;
  if (!Number.isInteger(port)||port<1||port>65535) throw new Error("Invalid database port.");
  return { u, host: u.hostname === "[::1]" ? "::1" : u.hostname, port, database, user, password };
}
export function parseLocalDatabaseConfig(rawUrl: string | undefined, purpose: LocalDatabasePurpose): PoolConfig & { host:string; port:number; database:string } {
  const {u,...config}=parse(rawUrl);
  if (!["localhost","127.0.0.1","::1"].includes(config.host)) throw new Error("Host is not permitted for destructive integration tests or development authentication.");
  const prefix=purpose==='integration' ? /^mtm_e2e_[a-zA-Z0-9_]+_test$/ : /^mtm_(?:dev|local|test|e2e)_[a-zA-Z0-9_]+$/;
  if(!prefix.test(config.database)) throw new Error("Database is not permitted; integration requires mtm_e2e_*_test and development requires an isolated mtm_dev_*, mtm_local_*, mtm_test_* or mtm_e2e_* namespace.");
  if ([...u.searchParams].length) throw new Error("Database URL options are forbidden for local authentication or tests.");
  return {...config, ssl:false, max:5, idleTimeoutMillis:10000, options:'-c timezone=UTC'};
}
export function databaseConnectionConfig(rawUrl: string, env: NodeJS.ProcessEnv=process.env): PoolConfig {
  const testing=env.MTM_RUN_ISOLATED_DB_TESTS==='1';
  const development=env.MTM_ENABLE_DEV_AUTH==='1'||env.ALLOW_STANDALONE_DEV_LOGIN==='1';
  if(testing||development){
    if(env.NODE_ENV==='production'||env.PUBLIC_PREVIEW) throw new Error("Local authentication and isolated database tests are forbidden in production or public preview.");
    return parseLocalDatabaseConfig(rawUrl,testing?'integration':'development');
  }
  const {u,...config}=parse(rawUrl);
  for(const [key,value] of u.searchParams){
    if(!((key==='sslmode'&&['require','verify-ca','verify-full'].includes(value))||(key==='channel_binding'&&value==='require')))
      throw new Error("Database URL options cannot override secure connection settings.");
  }
  return {...config,ssl:{rejectUnauthorized:true},max:5,idleTimeoutMillis:10000,connectionTimeoutMillis:20000,options:'-c timezone=UTC'};
}