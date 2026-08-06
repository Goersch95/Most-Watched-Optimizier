export type CsvRow = {
  productCode: string;
  title: string;
  catchUpRaw: string;
  geoRaw: string;
};

export type EpgEntry = {
  vin: string;
  vodRightsStart: string | null;
  vodRightsEnd: string | null;
  geoblocking: string[];
};

export type CatchUpBucket = '7' | '30' | 'unbegrenzt';

export type MismatchReason = 'catchup' | 'geo';

export type ComparisonRow = {
  productCode: string;
  title: string;
  catchUpRaw: string;
  geoRaw: string;
  apiCatchUpDays: number | null;
  apiGeoblocking: string[];
  mismatches: MismatchReason[];
};

export type LegalCheckResult = {
  mismatches: ComparisonRow[];
  catchUpBuckets: Record<CatchUpBucket, ComparisonRow[]>;
  unparseable: { productCode: string; title: string; catchUpRaw: string; geoRaw: string; reason: string }[];
  notInApi: number;
  totalRows: number;
};
