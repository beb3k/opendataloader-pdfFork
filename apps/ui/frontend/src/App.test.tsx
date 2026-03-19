import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import type { ComposeOptions, JobRecord, StorageLike, UiApi } from "./lib/types";

function createMemoryStorage(initial: Record<string, string> = {}): StorageLike {
  const map = new Map(Object.entries(initial));

  return {
    getItem(key) {
      return map.get(key) ?? null;
    },
    setItem(key, value) {
      map.set(key, value);
    },
    removeItem(key) {
      map.delete(key);
    },
  };
}

function createApi(overrides: Partial<UiApi> = {}): UiApi {
  const queuedJob: JobRecord = {
    id: "job-1",
    status: "queued",
    progress: 0,
    message: "Queued",
    sourceName: "sample.pdf",
    files: [],
  };
  const completeJob: JobRecord = {
    id: "job-1",
    status: "complete",
    progress: 100,
    message: "Complete",
    sourceName: "sample.pdf",
    files: [],
  };

  return {
    createJob: vi.fn(async (_file: File, _options: ComposeOptions) => queuedJob),
    getJob: vi.fn(async (_id: string) => completeJob),
    downloadFileUrl: (jobId, name) => `/jobs/${jobId}/files/${name}`,
    downloadBundleUrl: (jobId) => `/jobs/${jobId}/bundle`,
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("App", () => {
  it("does not render the extra hero card", () => {
    render(<App api={createApi()} storage={createMemoryStorage()} />);

    expect(screen.queryByText(/local mode/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/default path/i)).not.toBeInTheDocument();
  });

  it("validates file uploads before creating a job", async () => {
    const api = createApi();

    render(<App api={api} storage={createMemoryStorage()} />);

    fireEvent.click(screen.getByRole("button", { name: /create job/i }));
    expect(await screen.findByText(/choose a pdf before starting a job/i)).toBeInTheDocument();

    const input = screen.getByLabelText(/browse files/i) as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["not pdf"], "notes.txt", { type: "text/plain" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: /create job/i }));

    expect(await screen.findByText(/only accepts a single pdf/i)).toBeInTheDocument();
  });

  it("submits the selected option state", async () => {
    const createJob = vi.fn(async (_file: File, _options: ComposeOptions): Promise<JobRecord> => ({
      id: "job-2",
      status: "queued",
      progress: 0,
      message: "Queued",
      sourceName: "sample.pdf",
      files: [],
    }));
    const api = createApi({ createJob });

    render(<App api={api} storage={createMemoryStorage()} />);

    const input = screen.getByLabelText(/browse files/i) as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["pdf"], "sample.pdf", { type: "application/pdf" })] },
    });

    fireEvent.change(screen.getByLabelText(/page range/i), { target: { value: "1,3-4" } });
    fireEvent.click(screen.getByRole("button", { name: /html/i }));
    fireEvent.click(screen.getByRole("button", { name: /text/i }));
    fireEvent.click(screen.getByRole("button", { name: /create job/i }));

    expect(createJob).toHaveBeenCalledTimes(1);
    const options = createJob.mock.calls[0]?.[1];
    expect(options).toBeDefined();
    if (!options) {
      throw new Error("Expected createJob to receive options");
    }
    expect(options.pageRange).toBe("1,3-4");
    expect(options.formats).toEqual(expect.arrayContaining(["markdown", "json", "html", "text"]));
  });

  it("persists the advanced drawer during the session", async () => {
    const storage = createMemoryStorage();

    const { rerender } = render(<App api={createApi()} storage={storage} />);

    fireEvent.click(screen.getByRole("button", { name: /show advanced options/i }));
    const dialog = await screen.findByRole("dialog", { name: /advanced options/i });
    expect(dialog).toBeInTheDocument();
    const toggleButton = screen.getByRole("button", { name: /hide advanced options/i });
    const optionsCard = toggleButton.closest(".options-card");
    const advancedPanel = dialog.closest(".advanced-panel-shell");
    expect(optionsCard).not.toContainElement(dialog);
    expect(optionsCard?.nextElementSibling).toBe(advancedPanel);

    rerender(<App api={createApi()} storage={storage} />);
    expect(await screen.findByRole("dialog", { name: /advanced options/i })).toBeInTheDocument();
  });

  it("closes the advanced drawer when clicking outside it", async () => {
    render(<App api={createApi()} storage={createMemoryStorage()} />);

    fireEvent.click(screen.getByRole("button", { name: /show advanced options/i }));
    expect(await screen.findByRole("dialog", { name: /advanced options/i })).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog", { name: /advanced options/i })).not.toBeInTheDocument();
  });

  it("renders previews and downloads for returned outputs", () => {
    const longPdfName =
      "sample-document-with-a-very-long-name-that-should-stay-inside-the-download-card-boundary.pdf";
    const job: JobRecord = {
      id: "job-3",
      status: "complete",
      progress: 100,
      message: "Done",
      sourceName: "sample.pdf",
      files: [
        {
          name: "sample.md",
          kind: "markdown",
          preview: { kind: "markdown", content: "# Title" },
        },
        {
          name: "sample.json",
          kind: "json",
          preview: { kind: "json", content: '{"title":"Title"}' },
        },
        {
          name: "sample.html",
          kind: "html",
          preview: { kind: "html", content: "<h1>Title</h1>" },
        },
        {
          name: "sample.txt",
          kind: "text",
          preview: { kind: "text", content: "Title" },
        },
        {
          name: longPdfName,
          kind: "pdf",
        },
      ],
    };

    render(<App api={createApi()} storage={createMemoryStorage()} initialJob={job} />);

    expect(screen.getByRole("tab", { name: /markdown/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /json/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /html/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /text/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /download all outputs/i })).toHaveAttribute(
      "href",
      "/jobs/job-3/bundle",
    );
    expect(screen.getByRole("link", { name: /sample\.md/i })).toHaveAttribute(
      "href",
      "/jobs/job-3/files/sample.md",
    );
    expect(screen.getByText(longPdfName)).toBeInTheDocument();
  });
});
