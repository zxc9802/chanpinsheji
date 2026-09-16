import { createUsageReporter, fileOutbox } from './openlux-usage.ts';
import { createD1Outbox, type UsageDatabase } from './usage-d1-outbox.ts';
import { getMainAppUrl } from './main-app-sso.ts';

export const usageReporter = createUsageReporter({
  tool: 'chanpinsheji',
  getMainAppUrl,
  async getOutbox() {
    const directory = process.env.USAGE_MONITOR_OUTBOX_DIR?.trim();
    if (directory) return fileOutbox(directory);
    // Workers has no persistent filesystem. Bind the existing optional DB in hosting configuration.
    const { env } = await import('cloudflare:workers');
    const database = (env as { DB?: UsageDatabase }).DB;
    if (!database) throw new Error('Persistent DB binding is required for usage reporting.');
    return createD1Outbox(database);
  },
});
