import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import BoundingBoxPreview, { type ViewerTab, type ViewerTabDefinition } from "./BoundingBoxPreview";

const getDocumentMock = vi.fn();
const globalWorkerOptions = { workerSrc: "" };
const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
const originalDomMatrix = globalThis.DOMMatrix;
const SAME_CANVAS_ERROR =
  "Cannot use the same canvas during multiple render() operations. Use different canvas or ensure previous operations were cancelled or completed";

let renderMode: "resolved" | "guarded" | "pending" = "resolved";
let pendingRenderTasks: MockRenderTask[] = [];

vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({
  default: "pdf-worker.js",
}));

vi.mock("pdfjs-dist", () => ({
  getDocument: getDocumentMock,
  GlobalWorkerOptions: globalWorkerOptions,
}));

const mockDocument = {
  numPages: 3,
  getPage: vi.fn(async (pageNumber: number) => createMockPage(pageNumber)),
  destroy: vi.fn(async () => undefined),
};

describe("BoundingBoxPreview", () => {
  beforeEach(() => {
    getDocumentMock.mockReset();
    getDocumentMock.mockReturnValue({
      promise: Promise.resolve(mockDocument),
    });

    renderMode = "resolved";
    pendingRenderTasks = [];
    activeCanvasTasks.clear();
    mockDocument.getPage.mockClear();
    mockDocument.destroy.mockClear();
    mockDocument.numPages = 3;

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () => ({}) as CanvasRenderingContext2D,
    );

    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get() {
        return 640;
      },
    });

    globalThis.fetch = vi.fn(async () => createJsonResponse()) as unknown as typeof fetch;
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn(async () => undefined),
      },
    });
    globalThis.DOMMatrix = class {
      static fromMatrix() {
        return new this();
      }

      multiplySelf() {
        return this;
      }

      preMultiplySelf() {
        return this;
      }

      translateSelf() {
        return this;
      }

      scaleSelf() {
        return this;
      }

      rotateSelf() {
        return this;
      }

      invertSelf() {
        return this;
      }
    } as unknown as typeof DOMMatrix;
  });

  afterEach(() => {
    vi.restoreAllMocks();

    if (originalClientWidth) {
      Object.defineProperty(HTMLElement.prototype, "clientWidth", originalClientWidth);
    }

    globalThis.DOMMatrix = originalDomMatrix;
  });

  it("renders page thumbnails with page numbers and lets the user jump pages", async () => {
    render(<Harness />);

    expect(await screen.findByRole("button", { name: /go to page 1/i })).toBeInTheDocument();
    expect(screen.getByText("Page 1")).toBeInTheDocument();
    expect(screen.getByText("Page 2")).toBeInTheDocument();

    await waitFor(() => {
      const frame = document.querySelector(".bbox-page-thumb-frame");
      expect(frame).toHaveStyle({ width: "132px", height: "198px" });
    });

    fireEvent.click(screen.getByRole("button", { name: /go to page 2/i }));
    expect(await screen.findByText(/page 2 of 3/i)).toBeInTheDocument();
  });

  it("keeps the thumbnail frame size stable on text tabs", async () => {
    render(<Harness />);

    const thumbButton = await screen.findByRole("button", { name: /go to page 1/i });

    await waitFor(() => {
      const frame = document.querySelector(".bbox-page-thumb-frame");
      expect(frame).toHaveStyle({ width: "132px", height: "198px" });
    });

    fireEvent.click(screen.getByRole("tab", { name: /^preview$/i }));
    expect(thumbButton).toBeInTheDocument();

    await waitFor(() => {
      const frame = document.querySelector(".bbox-page-thumb-frame");
      expect(frame).toHaveStyle({ width: "132px", height: "198px" });
    });
  });

  it("updates zoom and rotation controls for document tabs", async () => {
    render(<Harness />);

    await screen.findByText(/page 1 of 3/i);
    await waitFor(() => {
      expect(document.querySelector(".bbox-canvas-frame")).not.toBeNull();
    });
    const zoomInButton = screen.getByRole("button", { name: /zoom in/i });
    const rotateClockwiseButton = screen.getByRole("button", { name: /rotate clockwise/i });

    fireEvent.click(zoomInButton);

    await waitFor(() => {
      const next = document.querySelector(".bbox-canvas-frame");
      expect(next).toHaveAttribute("style");
      expect(next?.getAttribute("style")).toContain("width: 768px");
    });

    fireEvent.click(rotateClockwiseButton);

    await waitFor(() => {
      const transform = document.querySelector(".bbox-canvas-transform");
      expect(transform?.getAttribute("style")).toContain("rotate(90deg)");
    });
  });

  it("restores the pdf canvas after leaving annot and returning", async () => {
    render(<Harness />);

    await screen.findByText(/page 1 of 3/i);
    await waitFor(() => {
      expect(document.querySelector(".bbox-canvas-frame")).not.toBeNull();
      expect(document.querySelectorAll(".bbox-rect")).toHaveLength(1);
    });

    fireEvent.click(screen.getByRole("tab", { name: /^preview$/i }));
    await waitFor(() => {
      expect(screen.getByText(/plain text preview/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("tab", { name: /^annot$/i }));
    await waitFor(() => {
      expect(document.querySelector(".bbox-pdf-canvas")).not.toBeNull();
      expect(document.querySelectorAll(".bbox-rect")).toHaveLength(1);
    });
  });

  it("hides the page rail when the toggle is pressed", async () => {
    render(<Harness />);

    await screen.findByText(/page 1 of 3/i);
    fireEvent.click(screen.getByRole("button", { name: /hide pages/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/results viewer/i)).toHaveClass("is-sidebar-collapsed");
      expect(screen.queryByLabelText(/pdf page thumbnails/i)).not.toBeInTheDocument();
    });
  });

  it("shows copy for text tabs and formats json content", async () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("tab", { name: /^json$/i }));
    expect(await screen.findByText(/"title": "Title"/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy current content/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /^html$/i }));
    expect(screen.queryByRole("button", { name: /copy current content/i })).not.toBeInTheDocument();
  });

  it("copies only the active page when a page preview endpoint is available", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/preview?page=2")) {
        return {
          ok: true,
          json: async () => ({
            kind: "text",
            content: "Page 2 copy",
          }),
        } as Response;
      }

      return createJsonResponse() as Response;
    }) as unknown as typeof fetch;

    render(
      <Harness
        tabs={createTabs({
          preview: {
            pagePreviewHref: "/jobs/job-1/files/sample.txt/preview",
          },
        })}
      />,
    );

    await screen.findByText(/page 1 of 3/i);
    fireEvent.click(screen.getByRole("button", { name: /go to page 2/i }));
    fireEvent.click(screen.getByRole("tab", { name: /^preview$/i }));
    fireEvent.click(screen.getByRole("button", { name: /copy current content/i }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("Page 2 copy");
    });
  });

  it("keeps unavailable tabs visible but disabled", () => {
    render(
      <Harness
        tabs={createTabs({
          preview: { enabled: false, loading: true, content: null },
          html: { enabled: false, loading: false, content: null },
        })}
      />,
    );

    expect(screen.getByRole("tab", { name: /^preview$/i })).toBeDisabled();
    expect(screen.getByRole("tab", { name: /^html$/i })).toBeDisabled();
  });

  it("shows inline error state when the overlay cannot load", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      text: async () => "",
    })) as unknown as typeof fetch;

    render(<Harness />);

    fireEvent.click(screen.getByRole("tab", { name: /^annot$/i }));
    expect(await screen.findByText(/could not load the bounding boxes/i)).toBeInTheDocument();
  });

  it("re-enters the document view without a same-canvas error while the first render is still active", async () => {
    mockDocument.numPages = 1;
    renderMode = "guarded";

    render(<Harness />);

    expect(await screen.findByRole("button", { name: /go to page 1/i })).toBeInTheDocument();

    await waitFor(() => {
      const frame = document.querySelector(".bbox-page-thumb-frame");
      expect(frame).toHaveStyle({ width: "132px", height: "198px" });
    });

    fireEvent.click(screen.getByRole("tab", { name: /^preview$/i }));
    expect(await screen.findByText(/plain text preview/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /^annot$/i }));
    expect(await screen.findByText(/page 1 of 1/i)).toBeInTheDocument();
    expect(screen.queryByText(SAME_CANVAS_ERROR)).not.toBeInTheDocument();
  });

  it("cancels active page and thumbnail renders when the viewer unmounts", async () => {
    mockDocument.numPages = 2;
    renderMode = "pending";

    const view = render(<Harness />);

    await waitFor(() => {
      expect(pendingRenderTasks).toHaveLength(3);
    });

    view.unmount();

    expect(pendingRenderTasks.every((task) => task.cancel.mock.calls.length === 1)).toBe(true);
  });
});

function Harness({
  tabs = createTabs(),
}: {
  tabs?: ViewerTabDefinition[];
}) {
  const [activeTab, setActiveTab] = useState<ViewerTab>("annot");
  const [sourceFile] = useState(() => createPdfFile());

  return (
    <BoundingBoxPreview
      sourceFile={sourceFile}
      jsonUrl="/jobs/job-1/files/sample.json"
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    />
  );
}

function createTabs(
  overrides: Partial<Record<ViewerTab, Partial<ViewerTabDefinition>>> = {},
): ViewerTabDefinition[] {
  const defaults: Record<ViewerTab, ViewerTabDefinition> = {
    pdf: {
      id: "pdf",
      label: "PDF",
      enabled: true,
      loading: false,
      panelType: "pdf",
      content: null,
      copyText: null,
      downloadHref: "blob:pdf",
      downloadName: "sample.pdf",
      dataUrl: null,
    },
    annot: {
      id: "annot",
      label: "Annot",
      enabled: true,
      loading: false,
      panelType: "annot",
      content: null,
      copyText: null,
      downloadHref: null,
      downloadName: null,
      dataUrl: "/jobs/job-1/files/sample.json",
    },
    preview: {
      id: "preview",
      label: "Preview",
      enabled: true,
      loading: false,
      panelType: "text",
      content: "Plain text preview",
      copyText: "Plain text preview",
      downloadHref: "/jobs/job-1/files/sample.txt",
      downloadName: "sample.txt",
      dataUrl: null,
    },
    html: {
      id: "html",
      label: "HTML",
      enabled: true,
      loading: false,
      panelType: "html",
      content: "<h1>Title</h1>",
      copyText: null,
      downloadHref: "/jobs/job-1/files/sample.html",
      downloadName: "sample.html",
      dataUrl: null,
    },
    markdown: {
      id: "markdown",
      label: "MD",
      enabled: true,
      loading: false,
      panelType: "text",
      content: "# Title",
      copyText: "# Title",
      downloadHref: "/jobs/job-1/files/sample.md",
      downloadName: "sample.md",
      dataUrl: null,
    },
    json: {
      id: "json",
      label: "JSON",
      enabled: true,
      loading: false,
      panelType: "json",
      content: '{"title":"Title"}',
      copyText: '{"title":"Title"}',
      downloadHref: "/jobs/job-1/files/sample.json",
      downloadName: "sample.json",
      dataUrl: null,
    },
  };

  return (Object.keys(defaults) as ViewerTab[]).map((id) => ({
    ...defaults[id],
    ...overrides[id],
  }));
}

function createPdfFile(): File {
  const file = new File(["pdf-bytes"], "sample.pdf", { type: "application/pdf" });

  Object.defineProperty(file, "arrayBuffer", {
    configurable: true,
    value: vi.fn(async () => new Uint8Array([1, 2, 3]).buffer),
  });

  return file;
}

function createJsonResponse(): Pick<Response, "ok" | "text"> {
  return {
    ok: true,
    text: async () =>
      JSON.stringify({
        "number of pages": 3,
        kids: [
          {
            type: "heading",
            "page number": 1,
            "bounding box": [10, 20, 40, 50],
            content: "Heading",
          },
          {
            type: "table",
            "page number": 2,
            "bounding box": [50, 60, 150, 160],
          },
        ],
      }),
  };
}

function createMockPage(pageNumber: number) {
  const baseWidth = pageNumber === 2 ? 220 : 200;
  const baseHeight = 300;

  return {
    getViewport({ scale }: { scale: number }) {
      return {
        width: baseWidth * scale,
        height: baseHeight * scale,
      };
    },
    render({ canvas }: { canvas: HTMLCanvasElement }) {
      return createRenderTask(canvas);
    },
  };
}

interface MockRenderTask {
  promise: Promise<void>;
  cancel: ReturnType<typeof vi.fn>;
}

function createRenderTask(canvas: HTMLCanvasElement): MockRenderTask {
  if (renderMode === "guarded") {
    return createGuardedRenderTask(canvas);
  }

  if (renderMode === "pending") {
    const task = createPendingRenderTask();
    pendingRenderTasks.push(task);
    return task;
  }

  return createResolvedRenderTask();
}

function createResolvedRenderTask(): MockRenderTask {
  return {
    promise: Promise.resolve(),
    cancel: vi.fn(),
  };
}

function createPendingRenderTask(): MockRenderTask {
  let rejectPromise: ((reason?: unknown) => void) | null = null;
  const promise = new Promise<void>((_resolve, reject) => {
    rejectPromise = reject;
  });

  return {
    promise,
    cancel: vi.fn(() => {
      rejectPromise?.(createCancelledError());
    }),
  };
}

const activeCanvasTasks = new Map<HTMLCanvasElement, MockRenderTask>();

function createGuardedRenderTask(canvas: HTMLCanvasElement): MockRenderTask {
  if (activeCanvasTasks.has(canvas)) {
    return {
      promise: Promise.reject(new Error(SAME_CANVAS_ERROR)),
      cancel: vi.fn(),
    };
  }

  let rejectPromise: ((reason?: unknown) => void) | null = null;

  const promise = new Promise<void>((_resolve, reject) => {
    rejectPromise = reject;
  });

  const task: MockRenderTask = {
    promise,
    cancel: vi.fn(() => {
      if (activeCanvasTasks.get(canvas) !== task) {
        return;
      }

      activeCanvasTasks.delete(canvas);
      rejectPromise?.(createCancelledError());
    }),
  };

  activeCanvasTasks.set(canvas, task);

  return task;
}

function createCancelledError(): Error {
  const error = new Error("render cancelled");
  error.name = "RenderingCancelledException";
  return error;
}
