import { usageReporter } from '@/lib/usage-monitor';

export async function POST(request: Request) {
  const secret = process.env.USAGE_MONITOR_INTERNAL_SECRET?.trim();
  if (!secret || request.headers.get('x-usage-secret') !== secret) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await usageReporter.flush();
  return Response.json({ attempted: true });
}
