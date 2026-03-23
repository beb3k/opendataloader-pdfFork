import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import type { ComposeOptions, JobRecord, StorageLike, UiApi } from "./lib/types";

vi.mock("./components/BoundingBoxPreview", () => ({
  default: ({
    sourceFile,
    jsonUrl,
    tabs,
    activeTab,
  }: {
    sourceFile: File | null;
    jsonUrl: string | null;
    activeTab: string;
    tabs: Array<{
      id: string;
      label: string;
      enabled: boolean;
      pageCopies?: Array<{ pageNumber: number; content: string }>;
    }>;
  }) => (
    <div data-testid="bbox-preview">
      <div>{sourceFile?.name ?? "no-source"}</div>
      <div>{jsonUrl ?? "no-json"}</div>
      <div data-testid="active-viewer-tab">{activeTab}</div>
      <div data-testid="viewer-tab-order">{tabs.map((tab) => tab.label).join("|")}</div>
      <div data-testid="viewer-enabled-tabs">
        {tabs.filter((tab) => tab.enabled).map((tab) => tab.id).join("|")}
      </div>
      <div data-testid="viewer-page-copies">
        {tabs
          .filter((tab) => tab.pageCopies?.length)
          .map(
            (tab) =>
              `${tab.id}:${tab.pageCopies
                ?.map((page) => `${page.pageNumber}:${page.content}`)
                .join("|")}`,
          )
          .join("||")}
      </div>
    </div>
  ),
}));

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
    readFileText: vi.fn(async (_jobId: string, _name: string) => "{}"),
    downloadFileUrl: (jobId, name) => `/jobs/${jobId}/files/${name}`,
    downloadBundleUrl: (jobId) => `/jobs/${jobId}/bundle`,
    ...overrides,
  };
}

function selectPdf(name = "sample.pdf", type = "application/pdf") {
  fireEvent.change(screen.getByLabelText(/browse files/i), {
    target: { files: [new File(["pdf"], name, { type })] },
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("App", () => {
  it("shows only the upload step on first render", () => {
    render(<App api={createApi()} storage={createMemoryStorage()} />);

    expect(screen.getByRole("heading", { name: /upload/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /options/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /results/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId("bbox-preview")).not.toBeInTheDocument();
  });

  it("reveals the options step after a file is selected", () => {
    render(<App api={createApi()} storage={createMemoryStorage()} />);

    selectPdf();

    expect(screen.getByRole("heading", { name: /options/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /results/i })).not.toBeInTheDocument();
  });

  it("validates a non-pdf upload before creating a job", async () => {
    render(<App api={createApi()} storage={createMemoryStorage()} />);

    selectPdf("notes.txt", "text/plain");
    fireEvent.click(screen.getByRole("button", { name: /create job/i }));

    expect(await screen.findByText(/only accepts a single pdf/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /results/i })).not.toBeInTheDocument();
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

    selectPdf();
    fireEvent.change(screen.getByLabelText(/page range/i), { target: { value: "1,3-4" } });
    fireEvent.click(screen.getByRole("button", { name: /^html$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^text$/i }));
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

  it("reveals the results step immediately after creating a job", async () => {
    const api = createApi({
      createJob: vi.fn(async (_file: File, _options: ComposeOptions): Promise<JobRecord> => ({
        id: "job-3",
        status: "queued",
        progress: 0,
        message: "Queued",
        sourceName: "sample.pdf",
        files: [],
      })),
    });

    render(<App api={api} storage={createMemoryStorage()} />);

    selectPdf();
    fireEvent.click(screen.getByRole("button", { name: /create job/i }));

    expect(await screen.findByRole("heading", { name: /results/i })).toBeInTheDocument();
    expect(screen.getByTestId("bbox-preview")).toBeInTheDocument();
  });

  it("remounts the upload input after start over so the same pdf can be selected again", async () => {
    const api = createApi();
    const file = new File(["pdf"], "sample.pdf", { type: "application/pdf" });

    render(<App api={api} storage={createMemoryStorage()} />);

    const firstInput = screen.getByLabelText(/browse files/i);
    fireEvent.change(firstInput, { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: /create job/i }));

    expect(await screen.findByRole("heading", { name: /results/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /start over/i }));

    expect(screen.queryByRole("heading", { name: /results/i })).not.toBeInTheDocument();
    expect(screen.getByText(/no file selected/i)).toBeInTheDocument();

    const secondInput = screen.getByLabelText(/browse files/i);
    expect(secondInput).not.toBe(firstInput);

    fireEvent.change(secondInput, { target: { files: [file] } });

    expect(screen.getByText("sample.pdf")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /options/i })).toBeInTheDocument();
  });

  it("lets the next job start immediately after start over", async () => {
    const createJob = vi.fn(async (_file: File, _options: ComposeOptions): Promise<JobRecord> => ({
      id: "job-1",
      status: "queued",
      progress: 0,
      message: "Queued",
      sourceName: "sample.pdf",
      files: [],
    }));
    const api = createApi({ createJob });

    render(<App api={api} storage={createMemoryStorage()} />);

    selectPdf();
    fireEvent.click(screen.getByRole("button", { name: /create job/i }));
    expect(await screen.findByRole("heading", { name: /results/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /start over/i }));
    expect(screen.queryByRole("heading", { name: /results/i })).not.toBeInTheDocument();

    selectPdf();
    fireEvent.click(screen.getByRole("button", { name: /create job/i }));

    expect(await screen.findByRole("heading", { name: /results/i })).toBeInTheDocument();
    expect(createJob).toHaveBeenCalledTimes(2);
  });

  it("persists the advanced drawer during the session", async () => {
    const storage = createMemoryStorage();

    const { rerender } = render(<App api={createApi()} storage={storage} />);

    selectPdf();
    fireEvent.click(screen.getByRole("button", { name: /show advanced options/i }));
    const dialog = await screen.findByRole("dialog", { name: /advanced options/i });
    expect(dialog).toBeInTheDocument();

    rerender(<App api={createApi()} storage={storage} />);
    expect(await screen.findByRole("dialog", { name: /advanced options/i })).toBeInTheDocument();
  });

  it("switches theme modes and keeps the choice in session storage", () => {
    const storage = createMemoryStorage();
    const view = render(<App api={createApi()} storage={storage} />);

    expect(document.querySelector(".shell")).toHaveAttribute("data-theme", "light");
    expect(screen.getByRole("button", { name: /light theme/i })).toHaveTextContent("\u2600");
    expect(screen.getByRole("button", { name: /dark theme/i })).toHaveTextContent("\u263e");

    fireEvent.click(screen.getByRole("button", { name: /dark theme/i }));
    expect(document.querySelector(".shell")).toHaveAttribute("data-theme", "dark");

    view.unmount();
    render(<App api={createApi()} storage={storage} />);
    expect(document.querySelector(".shell")).toHaveAttribute("data-theme", "dark");
  });

  it("closes the advanced drawer when clicking outside it", async () => {
    render(<App api={createApi()} storage={createMemoryStorage()} />);

    selectPdf();
    fireEvent.click(screen.getByRole("button", { name: /show advanced options/i }));
    expect(await screen.findByRole("dialog", { name: /advanced options/i })).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog", { name: /advanced options/i })).not.toBeInTheDocument();
  });

  it("renders the fixed viewer tab set and enables only available outputs", async () => {
    const completeJob: JobRecord = {
      id: "job-4",
      status: "complete",
      progress: 100,
      message: "Done",
      sourceName: "sample.pdf",
      files: [
        {
          name: "sample.json",
          kind: "json",
          preview: { kind: "json", content: '{"kids":[]}' },
        },
        {
          name: "sample.md",
          kind: "markdown",
          preview: { kind: "markdown", content: "# Title" },
        },
      ],
    };
    const api = createApi({
      createJob: vi.fn(async (_file: File, _options: ComposeOptions) => completeJob),
    });

    render(<App api={api} storage={createMemoryStorage()} />);

    selectPdf();
    fireEvent.click(screen.getByRole("button", { name: /create job/i }));

    expect(await screen.findByTestId("bbox-preview")).toHaveTextContent("sample.pdf");
    expect(screen.getByTestId("viewer-tab-order")).toHaveTextContent(
      "PDF|Annot|Preview|HTML|MD|JSON",
    );
    expect(screen.getByTestId("viewer-enabled-tabs")).toHaveTextContent(
      "pdf|annot|markdown|json",
    );
    await waitFor(() => {
      expect(screen.getByTestId("active-viewer-tab")).toHaveTextContent("annot");
    });
  });

  it("passes page-aware preview data through the viewer tabs", async () => {
    const completeJob: JobRecord = {
      id: "job-7",
      status: "complete",
      progress: 100,
      message: "Done",
      sourceName: "sample.pdf",
      files: [
        {
          name: "sample.md",
          kind: "markdown",
          preview: {
            kind: "markdown",
            content: "# Title",
            pages: [
              { pageNumber: 1, content: "Page 1 copy" },
              { pageNumber: 2, content: "Page 2 copy" },
            ],
          },
        },
      ],
    };
    const api = createApi({
      createJob: vi.fn(async (_file: File, _options: ComposeOptions) => completeJob),
    });

    render(<App api={api} storage={createMemoryStorage()} />);

    selectPdf();
    fireEvent.click(screen.getByRole("button", { name: /create job/i }));

    expect(await screen.findByTestId("viewer-page-copies")).toHaveTextContent(
      "markdown:1:Page 1 copy|2:Page 2 copy",
    );
  });

  it("keeps preview disabled when plain text output is absent", async () => {
    const completeJob: JobRecord = {
      id: "job-5",
      status: "complete",
      progress: 100,
      message: "Done",
      sourceName: "sample.pdf",
      files: [
        {
          name: "sample.json",
          kind: "json",
          preview: { kind: "json", content: '{"kids":[]}' },
        },
      ],
    };
    const api = createApi({
      createJob: vi.fn(async (_file: File, _options: ComposeOptions) => completeJob),
    });

    render(<App api={api} storage={createMemoryStorage()} />);

    selectPdf();
    fireEvent.click(screen.getByRole("button", { name: /create job/i }));

    expect(await screen.findByTestId("viewer-enabled-tabs")).toHaveTextContent("pdf|annot|json");
    expect(screen.getByTestId("viewer-enabled-tabs")).not.toHaveTextContent("preview");
  });

  it("shows the results viewer for an initial job without a source file", () => {
    const job: JobRecord = {
      id: "job-6",
      status: "complete",
      progress: 100,
      message: "Done",
      sourceName: "sample.pdf",
      files: [
        {
          name: "sample.json",
          kind: "json",
          preview: { kind: "json", content: '{"kids":[]}' },
        },
      ],
    };

    render(<App api={createApi()} storage={createMemoryStorage()} initialJob={job} />);

    expect(screen.getByRole("heading", { name: /results/i })).toBeInTheDocument();
    expect(screen.getByTestId("bbox-preview")).toHaveTextContent("no-source");
  });
});
