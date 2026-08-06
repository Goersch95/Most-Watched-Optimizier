export type CsvRow = {
  productCode: string;
  title: string;
  catchUpRaw: string;
  geoRaw: string;
};

export type EpgEntry = {
  vin: string;
  assetId: string | null;
  vodRightsStart: string | null;
  vodRightsEnd: string | null;
  geoblocking: string[];
  producedBy: string | null;
};

export type CatchUpBucket = '7' | '30' | 'unbegrenzt';

export type MismatchReason = 'catchup' | 'geo';

export type ComparisonRow = {
  productCode: string;
  assetId: string | null;
  title: string;
  label: string | null;
  titleShort: string | null;
  producedBy: string | null;
  catchUpRaw: string;
  geoRaw: string;
  apiCatchUpDays: number | null;
  apiGeoblocking: string[];
  mismatches: MismatchReason[];
};

export type UnparseableRow = {
  productCode: string;
  assetId: string | null;
  title: string;
  label: string | null;
  titleShort: string | null;
  producedBy: string | null;
  catchUpRaw: string;
  geoRaw: string;
  reason: string;
};

export type LegalCheckResult = {
  mismatches: ComparisonRow[];
  catchUpBuckets: Record<CatchUpBucket, ComparisonRow[]>;
  unparseable: UnparseableRow[];
  notInApi: number;
  outsideDateRange: number;
  totalRows: number;
};
