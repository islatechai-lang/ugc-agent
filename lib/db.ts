import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL!;
const authToken = process.env.TURSO_AUTH_TOKEN!;

export const db = createClient({
  url,
  authToken,
});

export const initDb = async () => {
  // Users table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT,
      profile_pic_url TEXT,
      phone TEXT UNIQUE,
      credits INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Ensure users table columns exist for existing tables
  try {
    await db.execute(`ALTER TABLE users ADD COLUMN username TEXT`);
  } catch (e) { /* Column likely already exists */ }
  try {
    await db.execute(`ALTER TABLE users ADD COLUMN profile_pic_url TEXT`);
  } catch (e) { /* Column likely already exists */ }
  try {
    await db.execute(`ALTER TABLE users ADD COLUMN phone TEXT`);
  } catch (e) { /* Column likely already exists */ }
  try {
    await db.execute(`ALTER TABLE users ADD COLUMN credits INTEGER DEFAULT 1`);
  } catch (e) { /* Column likely already exists */ }

  // GCash Payments table for manual & AI-reviewed receipt submissions
  await db.execute(`
    CREATE TABLE IF NOT EXISTS gcash_payments (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      package_id TEXT,
      credits INTEGER,
      amount_php REAL,
      receipt_url TEXT,
      status TEXT DEFAULT 'pending',
      ai_decision TEXT,
      ai_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `);

  // Campaigns table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      vibe TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      master_video_url TEXT,
      status TEXT,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `);

  try {
    await db.execute(`ALTER TABLE campaigns ADD COLUMN user_id TEXT`);
  } catch (e) { /* Column likely already exists */ }
  try {
    await db.execute(`ALTER TABLE campaigns ADD COLUMN master_video_url TEXT`);
  } catch (e) { /* Column likely already exists */ }
  try {
    await db.execute(`ALTER TABLE campaigns ADD COLUMN status TEXT`);
  } catch (e) { /* Column likely already exists */ }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS shots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id TEXT,
      type TEXT,
      script TEXT,
      image_prompt TEXT,
      video_prompt TEXT,
      status TEXT,
      video_url TEXT,
      ref_image TEXT,
      FOREIGN KEY (campaign_id) REFERENCES campaigns (id)
    )
  `);

  try {
    await db.execute(`ALTER TABLE shots ADD COLUMN ref_image TEXT`);
  } catch (e) { /* Column likely already exists */ }

  // System Stats table for Daily Quota
  await db.execute(`
    CREATE TABLE IF NOT EXISTS system_stats (
      date TEXT PRIMARY KEY,
      fast_usage INTEGER DEFAULT 0,
      preview_usage INTEGER DEFAULT 0
    )
  `);
};
