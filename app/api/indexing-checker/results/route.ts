import { NextResponse } from 'next/server';
import {
  getAllChecks,
  getArchives,
  getLastPollRun,
  getLastUpload,
  getPendingIds,
  getPollRunHistory,
} from '@/lib/indexing-checker/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    checks: getAllChecks(),
    lastUpload: getLastUpload(),
    lastPollRun: getLastPollRun(),
    pollRunHistory: getPollRunHistory(),
    pendingIds: getPendingIds(),
    archives: getArchives(),
  });
}
