import { NextResponse } from 'next/server';
import { getAllChecks } from '@/lib/indexing-checker/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ checks: getAllChecks() });
}
