export interface SourceDefinition {
  id: string;
  url: string;
  publisher: string;
  topic: string;
  adapter: 'polygon' | 'dork' | 'ign';
}

export interface Heading { id: string; text: string; level: number }
export interface SearchSection { headingId: string; heading: string; text: string }
export interface ReaderGuide {
  id: string;
  title: string;
  publisher: string;
  topic: string;
  sourceUrl: string;
  capturedAt: string;
  author?: string;
  publishedAt?: string;
  html: string;
  text: string;
  headings: Heading[];
  sections: SearchSection[];
  warnings: string[];
}
export interface LibraryData { guides: ReaderGuide[]; sources: SourceDefinition[] }
export interface AssetRecord {
  url: string;
  finalUrl?: string;
  path?: string;
  sha256?: string;
  mediaType?: string;
  error?: string;
}
export interface CaptureManifest {
  schemaVersion: 1;
  source: SourceDefinition;
  captureId: string;
  requestedUrl: string;
  finalUrl: string;
  capturedAt: string;
  method: 'fetch' | 'browser' | 'html';
  inputPath?: string;
  status: number | null;
  extractionVersion: string;
  rawSha256: string;
  guideSha256: string;
  assets: AssetRecord[];
  warnings: string[];
}
