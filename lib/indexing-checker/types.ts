export type IndexingStatus = 'pending' | 'live' | 'found';

export type IndexingCheckRow = {
  id: string;
  url: string;
  t1_publish: string;
  t1_live_confirmed: string | null;
  t2_indexed: string | null;
  delta_minutes: number | null;
  weekday: string;
  slot: string;
  status: IndexingStatus;
  poll_count: number;
  next_poll_at: string;
  created_at: string;
};
