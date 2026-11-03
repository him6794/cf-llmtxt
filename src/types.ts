export interface Env {
  LLM_BUCKET: R2Bucket;
  AI?: any;
  DEFAULT_MODE?: string;
  ADMIN_PATH?: string;
  WORKER_NAME?: string;
  CF_API_TOKEN?: string;
  CF_ZONE_ID?: string;
  CF_ACCOUNT_ID?: string;
  ADMIN_TOKEN?: string;
}

export interface ZoneRouteStatus {
  zoneId: string;
  zoneName: string;
  routesBound: string[];
  subdomainsCount: number;
}

export type IndexingMode = 'auto' | 'manual';
export type RenderMode = 'auto' | 'ssr' | 'spa';

export interface DomainEntry {
  hostname: string;
  enabled: boolean; 
  renderMode: RenderMode;
  status: 'cached' | 'uncached' | 'generating' | 'error';
  lastUpdated?: string;
  lastAttemptedAt?: string;
  pageCount?: number;
  usedAI?: boolean;
  detectedSpa?: boolean;
  source?: 'dns' | 'manual' | 'traffic';
  lastError?: string;
  customTitle?: string;
  customDescription?: string;

  contentHash?: string;
}

export interface SystemConfig {
  mode: IndexingMode;
  defaultRenderMode: RenderMode;
  maxPagesPerDomain: number;
  cacheTtlSeconds: number;

  autoRefreshHours?: number;
  aiModel: string;
  aiPrompt?: string;
  enableSpaFallback: boolean;
  cfZoneId?: string;
  cfAccountId?: string;
  cfApiToken?: string;
  zones?: ZoneRouteStatus[];
  domains: Record<string, DomainEntry>;
  updatedAt: string;
}

export interface ExternalLinkItem {
  title: string;
  url: string;
}

export interface CrawledPage {
  url: string;
  path: string;
  title: string;
  description: string;
  headings: string[];
  content: string;
  markdown?: string;
  externalLinks?: ExternalLinkItem[];
  summary?: string;
  isSpaRendered?: boolean;
}

export interface GenerationResult {
  hostname: string;
  llmsTxt: string;
  llmsFullTxt: string;
  pageCount: number;
  usedAI: boolean;
  detectedSpa: boolean;
  generatedAt: string;
}
