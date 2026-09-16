if (!process.env.USAGE_MONITOR_OUTBOX_DIR) throw new Error('Set the same persistent USAGE_MONITOR_OUTBOX_DIR as the Node server.');
import { createUsageReporter } from '../lib/openlux-usage.ts';
await createUsageReporter({
  tool: 'chanpinsheji',
  getMainAppUrl: () => process.env.MAIN_APP_URL?.trim() || 'https://www.qycm.top',
}).flush();
