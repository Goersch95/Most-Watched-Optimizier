import { NextResponse } from 'next/server';
import { getAllChecks, getArchives, getLastPollRun, getLastUpload, getPendingIds } from '@/lib/indexing-checker-gsc/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    checks: getAllChecks(),
    lastUpload: getLastUpload(),
    lastPollRun: getLastPollRun(),
    pendingIds: getPendingIds(),
    archives: getArchives(),
  });
}
