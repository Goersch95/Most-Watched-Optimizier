import { NextResponse } from 'next/server';
import { getAllChecks, getLastPollRun, getLastUpload } from '@/lib/indexing-checker/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    checks: getAllChecks(),
    lastUpload: getLastUpload(),
    lastPollRun: getLastPollRun(),
  });
}
