import type { UsageOutbox } from './openlux-usage.ts';

type Statement = {
  bind: (...values: unknown[]) => Statement;
  run: () => Promise<unknown>;
  all: () => Promise<{ results?: Array<{ event_key: string; body: string }> }>;
};
export type UsageDatabase = { prepare: (sql: string) => Statement };

export function createD1Outbox(database: UsageDatabase): UsageOutbox {
  return {
    async initialize() {
      await database.prepare('CREATE TABLE IF NOT EXISTS usage_monitor_outbox (event_key TEXT PRIMARY KEY, body TEXT NOT NULL, created_at INTEGER NOT NULL)').run();
    },
    async write(key, body) {
      await database.prepare('INSERT OR REPLACE INTO usage_monitor_outbox (event_key, body, created_at) VALUES (?, ?, ?)').bind(key, body, Date.now()).run();
    },
    async list(limit) {
      const rows = await database.prepare('SELECT event_key, body FROM usage_monitor_outbox ORDER BY created_at, event_key LIMIT ?').bind(limit).all();
      return (rows.results ?? []).map(row => ({ key: row.event_key, body: row.body }));
    },
    async remove(key) {
      await database.prepare('DELETE FROM usage_monitor_outbox WHERE event_key = ?').bind(key).run();
    },
  };
}
