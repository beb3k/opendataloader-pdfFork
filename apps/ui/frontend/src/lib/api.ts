import type { ComposeOptions, JobRecord, UiApi } from "./types";

const DEFAULT_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    let message = text || `Request failed with ${response.status}`;
    try {
      const payload = JSON.parse(text) as { detail?: string };
      message = payload.detail || message;
    } catch {
      // Fall back to the raw response text when the server did not return JSON.
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

function encodePathSegments(value: string): string {
  return value
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function createBrowserApi(baseUrl: string = DEFAULT_BASE_URL): UiApi {
  return {
    async createJob(file: File, options: ComposeOptions): Promise<JobRecord> {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("options", JSON.stringify(options));

      const response = await fetch(`${baseUrl}/jobs`, {
        method: "POST",
        body: formData,
      });

      return readJson<JobRecord>(response);
    },
    async getJob(id: string): Promise<JobRecord> {
      const response = await fetch(`${baseUrl}/jobs/${encodeURIComponent(id)}`);
      return readJson<JobRecord>(response);
    },
    async readFileText(jobId: string, name: string): Promise<string> {
      const response = await fetch(
        `${baseUrl}/jobs/${encodeURIComponent(jobId)}/files/${encodePathSegments(name)}`,
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Request failed with ${response.status}`);
      }

      return response.text();
    },
    downloadFileUrl(jobId: string, name: string): string {
      return `${baseUrl}/jobs/${encodeURIComponent(jobId)}/files/${encodePathSegments(name)}`;
    },
    downloadBundleUrl(jobId: string): string {
      return `${baseUrl}/jobs/${encodeURIComponent(jobId)}/bundle`;
    },
  };
}
