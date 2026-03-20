export type OutputFormat = "markdown" | "json" | "html" | "text" | "pdf";
export type MarkdownStyle = "plain" | "html" | "images";
export type TableMethod = "default" | "cluster";
export type ReadingOrder = "off" | "xycut";
export type ImageOutput = "off" | "embedded" | "external";
export type ImageFormat = "png" | "jpeg";
export type HybridMode = "auto" | "full";
export type PreviewKind = "markdown" | "json" | "html" | "text";
export type JobStatus = "queued" | "running" | "complete" | "failed";

export interface HybridSettings {
  enabled: boolean;
  engine: "docling-fast";
  mode: HybridMode;
  url: string;
  timeoutMs: string;
  fallback: boolean;
}

export interface ComposeOptions {
  formats: OutputFormat[];
  markdownStyle: MarkdownStyle;
  pageRange: string;
  sanitize: boolean;
  keepLineBreaks: boolean;
  includeHeaderFooter: boolean;
  useStructTree: boolean;
  tableMethod: TableMethod;
  readingOrder: ReadingOrder;
  imageOutput: ImageOutput;
  imageFormat: ImageFormat;
  hybrid: HybridSettings;
}

export interface PreviewPayload {
  kind: PreviewKind;
  content: string;
}

export interface JobFile {
  name: string;
  kind: "markdown" | "json" | "html" | "text" | "pdf" | "image" | "other";
  sizeLabel?: string;
  preview?: PreviewPayload;
}

export interface JobRecord {
  id: string;
  status: JobStatus;
  progress: number;
  message: string;
  sourceName: string;
  files: JobFile[];
}

export interface UiApi {
  createJob(file: File, options: ComposeOptions): Promise<JobRecord>;
  getJob(id: string): Promise<JobRecord>;
  readFileText(jobId: string, name: string): Promise<string>;
  downloadFileUrl(jobId: string, name: string): string;
  downloadBundleUrl(jobId: string): string;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
