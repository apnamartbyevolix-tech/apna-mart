import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { databaseConnectionConfig } from "./marketplace/database-config";
import { isReviewDemo, reviewDemoConfig } from "./auth/review-demo-context";
import { sql } from "drizzle-orm";

let _db: ReturnType<typeof drizzle> | null = null;
let reviewDb: Promise<ReturnType<typeof drizzle>> | undefined;

async function getReviewDb() {
  if (!reviewDb) reviewDb = (async () => {
    const config = reviewDemoConfig();
    if (!config) throw Error("Review database is disabled");
    const pool = new Pool(config.connection);
    const db = drizzle(pool);
    try {
      const marker = await db.execute(sql`SELECT purpose FROM review_demo_identity WHERE id=1`);
      if (marker.rows[0]?.purpose !== "fictional-review-only-v1") throw Error("Invalid review database");
      return db;
    } catch {
      await pool.end();
      throw Error("The isolated review database is unavailable");
    }
  })().catch(error => { reviewDb = undefined; throw error; });
  return reviewDb;
}

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (isReviewDemo()) return getReviewDb();
  if (!_db && process.env.DATABASE_URL) {
    // Validate before pool creation; an isolation failure must not fall back to a raw URL.
    const connection = databaseConnectionConfig(process.env.DATABASE_URL);
    try {
      _db = drizzle(new Pool(connection));
    } catch (error) {
      console.warn("[Database] Failed to initialize the connection pool");
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    throw new Error("Database is not available");
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (
      user.openId === ENV.ownerOpenId ||
      Boolean(ENV.adminEmail && user.email?.trim().toLowerCase() === ENV.adminEmail)
    ) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onConflictDoUpdate({ target: [users.openId],
      set: updateSet,
    }).returning({ insertId: users.id });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// TODO: add feature queries here as your schema grows.
