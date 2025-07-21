// src/db/index.ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';

// Ensure data directory exists
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// SQLite connection
const sqlite = new Database(path.join(dataDir, 'terminplaner.db'));

// Enable foreign keys and performance optimizations
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('synchronous = NORMAL');
sqlite.pragma('cache_size = 1000000');
sqlite.pragma('temp_store = memory');

// Drizzle instance
export const db = drizzle(sqlite, { schema });

// Database initialization
export async function initializeDatabase(): Promise<void> {
  try {
    console.log('🗄️ Initializing database...');
    
    // Check if database has any tables
    const tables = sqlite.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `).all();
    
    if (tables.length === 0) {
      console.log('📋 Creating database schema...');
      createTables();
    }
    
    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}

// Create tables
function createTables(): void {
  const createTablesSQL = `
    -- Servers Table
    CREATE TABLE IF NOT EXISTS servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_activity_at INTEGER NOT NULL
    );

    -- Server Users Table
    CREATE TABLE IF NOT EXISTS server_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      display_name TEXT,
      first_seen_at INTEGER NOT NULL,
      last_active_at INTEGER NOT NULL,
      total_invites INTEGER NOT NULL DEFAULT 0,
      total_responses INTEGER NOT NULL DEFAULT 0,
      avg_response_time_seconds INTEGER,
      UNIQUE(server_id, user_id)
    );

    -- Events Table
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      parsed_date INTEGER,
      relative_date TEXT,
      comment TEXT,
      channel_id TEXT NOT NULL,
      message_id TEXT,
      organizer_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at INTEGER NOT NULL,
      closed_at INTEGER,
      cancelled_at INTEGER,
      cancellation_reason TEXT
    );

    -- Participants Table
    CREATE TABLE IF NOT EXISTS participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      server_user_id INTEGER NOT NULL REFERENCES server_users(id) ON DELETE CASCADE,
      invited_at INTEGER NOT NULL,
      current_status TEXT NOT NULL DEFAULT 'PENDING',
      alternative_time TEXT,
      UNIQUE(event_id, server_user_id)
    );

    -- Response History Table
    CREATE TABLE IF NOT EXISTS response_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      old_status TEXT,
      new_status TEXT NOT NULL,
      changed_at INTEGER NOT NULL,
      response_time_seconds INTEGER,
      alternative_time TEXT
    );

    -- Event Audit Logs Table
    CREATE TABLE IF NOT EXISTS event_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      performed_by TEXT NOT NULL,
      performed_at INTEGER NOT NULL,
      details TEXT
    );

    -- Indexes for performance
    CREATE INDEX IF NOT EXISTS server_users_server_id_last_active_idx ON server_users(server_id, last_active_at);
    CREATE INDEX IF NOT EXISTS server_users_user_id_idx ON server_users(user_id);
    CREATE INDEX IF NOT EXISTS events_server_id_created_at_idx ON events(server_id, created_at);
    CREATE INDEX IF NOT EXISTS events_server_id_status_idx ON events(server_id, status);
    CREATE INDEX IF NOT EXISTS events_parsed_date_idx ON events(parsed_date);
    CREATE INDEX IF NOT EXISTS events_organizer_id_idx ON events(organizer_id);
    CREATE INDEX IF NOT EXISTS participants_event_id_current_status_idx ON participants(event_id, current_status);
    CREATE INDEX IF NOT EXISTS response_history_participant_id_changed_at_idx ON response_history(participant_id, changed_at);
    CREATE INDEX IF NOT EXISTS response_history_changed_at_idx ON response_history(changed_at);
    CREATE INDEX IF NOT EXISTS event_audit_logs_event_id_performed_at_idx ON event_audit_logs(event_id, performed_at);
    CREATE INDEX IF NOT EXISTS event_audit_logs_performed_by_idx ON event_audit_logs(performed_by);
    CREATE INDEX IF NOT EXISTS event_audit_logs_performed_at_idx ON event_audit_logs(performed_at);
  `;

  // Execute all SQL statements
  sqlite.exec(createTablesSQL);
}

// Test database connection
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    const result = sqlite.prepare('SELECT 1 as test').get();
    console.log('✅ Database connection successful');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
}

// Graceful shutdown
process.on('beforeExit', () => {
  sqlite.close();
});

process.on('SIGINT', () => {
  sqlite.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  sqlite.close();
  process.exit(0);
});

// Export schema for use in other files
export * from './schema';
export { sqlite };