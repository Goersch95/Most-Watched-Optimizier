export type AssetRow = {
  assetId: string;
  viewCount: number;
};

export type ContentType = 'show' | 'clip' | 'unknown';

export type EnrichedRow = AssetRow & {
  title: string;
  contentType: ContentType;
};

export type UploadResult = {
  shows: EnrichedRow[];
  clips: EnrichedRow[];
  unknown: EnrichedRow[];
  cmsConnected: boolean;
};
