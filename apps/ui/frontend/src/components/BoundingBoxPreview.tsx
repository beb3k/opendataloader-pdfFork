import { useEffect, useMemo, useRef, useState } from "react";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  parseOverlayDocument,
  projectBoundingBox,
  type OverlayCategory,
} from "../lib/boundingBoxes";

const CATEGORY_LABELS: Record<OverlayCategory, string> = {
  text: "Text",
  table: "Table",
};

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 2.4;
const ZOOM_STEP = 0.2;
const THUMBNAIL_WIDTH = 132;

export type ViewerTab = "pdf" | "annot" | "preview" | "html" | "markdown" | "json";

export interface ViewerTabDefinition {
  id: ViewerTab;
  label: string;
  enabled: boolean;
  loading: boolean;
  panelType: "pdf" | "annot" | "text" | "html" | "json";
  content: string | null;
  copyText: string | null;
  downloadHref: string | null;
  downloadName: string | null;
  dataUrl: string | null;
}

interface BoundingBoxPreviewProps {
  sourceFile: File | null;
  jsonUrl: string | null;
  tabs: ViewerTabDefinition[];
  activeTab: ViewerTab;
  onTabChange: (tab: ViewerTab) => void;
}

interface RenderedPage {
  baseWidth: number;
  baseHeight: number;
  displayWidth: number;
  displayHeight: number;
  scale: number;
}

interface ThumbnailSize {
  baseWidth: number;
  baseHeight: number;
  displayWidth: number;
  displayHeight: number;
}

interface ThumbnailButtonProps {
  isActive: boolean;
  onSelect: () => void;
  pageNumber: number;
  pdfDocument: PDFDocumentProxy;
  rotation: number;
}

export default function BoundingBoxPreview({
  sourceFile,
  jsonUrl,
  tabs,
  activeTab,
  onTabChange,
}: BoundingBoxPreviewProps) {
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeDefinition = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];
  const isDocumentTab = activeDefinition?.panelType === "pdf" || activeDefinition?.panelType === "annot";

  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [viewerWidth, setViewerWidth] = useState(0);
  const [renderedPage, setRenderedPage] = useState<RenderedPage | null>(null);
  const [pdfState, setPdfState] = useState<"loading" | "ready" | "error" | "idle">("idle");
  const [pdfErrorMessage, setPdfErrorMessage] = useState<string | null>(null);
  const [overlayErrorMessage, setOverlayErrorMessage] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [visibleCategories, setVisibleCategories] = useState<Record<OverlayCategory, boolean>>({
    text: true,
    table: true,
  });
  const [overlayDocument, setOverlayDocument] = useState(() => parseOverlayDocument('{"kids":[]}'));

  useEffect(() => {
    const element = viewerRef.current;
    if (!element) {
      return;
    }

    const updateWidth = () => {
      setViewerWidth(Math.max(0, Math.floor(element.clientWidth)));
    };

    updateWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth);
      return () => {
        window.removeEventListener("resize", updateWidth);
      };
    }

    const observer = new ResizeObserver(() => {
      updateWidth();
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let nextDocument: PDFDocumentProxy | null = null;

    setRenderedPage(null);
    setCurrentPage(1);
    setZoomLevel(1);
    setRotation(0);
    setPdfErrorMessage(null);

    async function loadPdf() {
      if (!sourceFile) {
        setPdfState("idle");
        setPdfDocument((current) => {
          void current?.destroy();
          return null;
        });
        setPageCount(1);
        return;
      }

      setPdfState("loading");

      try {
        const [{ getDocument, GlobalWorkerOptions }, pdfBytes] = await Promise.all([
          import("pdfjs-dist"),
          sourceFile.arrayBuffer(),
        ]);

        GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        const loadingTask = getDocument({ data: new Uint8Array(pdfBytes) });
        nextDocument = await loadingTask.promise;

        if (cancelled) {
          await nextDocument.destroy();
          return;
        }

        setPdfDocument((current) => {
          void current?.destroy();
          return nextDocument;
        });
        setPageCount(Math.max(nextDocument.numPages, 1));
        setPdfState("ready");
      } catch (error) {
        if (cancelled) {
          return;
        }

        setPdfDocument((current) => {
          void current?.destroy();
          return null;
        });
        setPageCount(1);
        setPdfErrorMessage(
          error instanceof Error ? error.message : "Could not load the PDF viewer.",
        );
        setPdfState("error");
      }
    }

    void loadPdf();

    return () => {
      cancelled = true;
      void nextDocument?.destroy();
    };
  }, [sourceFile]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    setOverlayErrorMessage(null);
    setOverlayDocument(parseOverlayDocument('{"kids":[]}'));

    async function loadOverlay() {
      if (!jsonUrl) {
        return;
      }

      try {
        const response = await fetch(jsonUrl, { signal: controller.signal });

        if (!response.ok) {
          throw new Error("Could not load the bounding boxes.");
        }

        const content = await response.text();

        if (cancelled) {
          return;
        }

        setOverlayDocument(parseOverlayDocument(content));
      } catch (error) {
        if (cancelled || controller.signal.aborted) {
          return;
        }

        setOverlayErrorMessage(
          error instanceof Error ? error.message : "Could not load the bounding boxes.",
        );
      }
    }

    void loadOverlay();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [jsonUrl]);

  useEffect(() => {
    if (!pdfDocument || !canvasRef.current || !viewerWidth) {
      return;
    }

    const activeCanvas = canvasRef.current;
    const activeDocument = pdfDocument;
    let cancelled = false;

    async function renderPage() {
      try {
        const page = await activeDocument.getPage(currentPage);
        const baseViewport = page.getViewport({ scale: 1 });
        const fitWidth = usesVerticalLayout(rotation) ? baseViewport.height : baseViewport.width;
        const scale = (viewerWidth / fitWidth) * zoomLevel;
        const viewport = page.getViewport({ scale });
        const context = activeCanvas.getContext("2d");

        if (!context) {
          throw new Error("Canvas rendering is not available in this browser.");
        }

        const pixelRatio = window.devicePixelRatio || 1;
        activeCanvas.width = Math.ceil(viewport.width * pixelRatio);
        activeCanvas.height = Math.ceil(viewport.height * pixelRatio);
        activeCanvas.style.width = `${viewport.width}px`;
        activeCanvas.style.height = `${viewport.height}px`;

        const displaySize = getDisplaySize(viewport.width, viewport.height, rotation);
        setRenderedPage({
          baseWidth: viewport.width,
          baseHeight: viewport.height,
          displayWidth: displaySize.width,
          displayHeight: displaySize.height,
          scale,
        });

        const renderTask = page.render({
          canvas: activeCanvas,
          canvasContext: context,
          transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
          viewport,
        });
        await renderTask.promise;

        if (cancelled) {
          return;
        }
        setPdfErrorMessage(null);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setPdfErrorMessage(
          error instanceof Error ? error.message : "Could not render the current PDF page.",
        );
        setPdfState("error");
      }
    }

    setRenderedPage(null);
    void renderPage();

    return () => {
      cancelled = true;
    };
  }, [currentPage, pdfDocument, rotation, viewerWidth, zoomLevel]);

  useEffect(() => {
    setCurrentPage((current) => Math.min(current, pageCount));
  }, [pageCount]);

  useEffect(() => {
    setCopyFeedback(null);
  }, [activeTab]);

  const pageBoxes = useMemo(() => {
    const boxes = overlayDocument.boxesByPage.get(currentPage) ?? [];
    return boxes.filter((box) => visibleCategories[box.category]);
  }, [currentPage, overlayDocument.boxesByPage, visibleCategories]);

  const pageNumbers = useMemo(
    () => Array.from({ length: pageCount }, (_, index) => index + 1),
    [pageCount],
  );

  const canGoToPreviousPage = currentPage > 1 && pdfState === "ready";
  const canGoToNextPage = currentPage < pageCount && pdfState === "ready";
  const canZoomOut = pdfState === "ready" && zoomLevel > MIN_ZOOM;
  const canZoomIn = pdfState === "ready" && zoomLevel < MAX_ZOOM;
  const canUseViewerControls = pdfState === "ready";
  const canCopy = Boolean(activeDefinition?.copyText);
  const showDownload = Boolean(activeDefinition?.downloadHref && activeDefinition?.downloadName);
  const showOverlay = activeDefinition?.panelType === "annot";

  function toggleCategory(category: OverlayCategory) {
    setVisibleCategories((current) => ({
      ...current,
      [category]: !current[category],
    }));
  }

  function zoomIn() {
    setZoomLevel((current) => clampZoom(current + ZOOM_STEP));
  }

  function zoomOut() {
    setZoomLevel((current) => clampZoom(current - ZOOM_STEP));
  }

  function rotateClockwise() {
    setRotation((current) => normalizeRotation(current + 90));
  }

  function rotateCounterClockwise() {
    setRotation((current) => normalizeRotation(current - 90));
  }

  async function copyCurrentPanel() {
    if (!activeDefinition?.copyText || !navigator.clipboard?.writeText) {
      return;
    }

    await navigator.clipboard.writeText(formatPanelContent(activeDefinition));
    setCopyFeedback("Copied");
    window.setTimeout(() => {
      setCopyFeedback(null);
    }, 1600);
  }

  return (
    <section
      className={`bbox-viewer-card ${isSidebarOpen ? "" : "is-sidebar-collapsed"}`.trim()}
      aria-label="Results viewer"
    >
      {isSidebarOpen ? (
        <aside className="bbox-rail" aria-label="PDF page thumbnails">
          <div className="bbox-rail-header">
            <strong>Pages</strong>
            <span>{sourceFile ? `${pageCount} pages` : "Waiting for a PDF"}</span>
          </div>

          {pdfDocument ? (
            <div className="bbox-page-list">
              {pageNumbers.map((pageNumber) => (
                <ThumbnailButton
                  key={pageNumber}
                  isActive={pageNumber === currentPage}
                  onSelect={() => setCurrentPage(pageNumber)}
                  pageNumber={pageNumber}
                  pdfDocument={pdfDocument}
                  rotation={rotation}
                />
              ))}
            </div>
          ) : (
            <div className="bbox-rail-empty">
              <p>{sourceFile ? "Loading page thumbnails..." : "Upload a PDF to see page thumbnails."}</p>
            </div>
          )}
        </aside>
      ) : null}

      <div className="bbox-main-panel">
        <div className="bbox-tabs-row">
          <div className="bbox-tabs" role="tablist" aria-label="Viewer tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                className={`bbox-tab ${activeTab === tab.id ? "is-active" : ""}`.trim()}
                onClick={() => onTabChange(tab.id)}
                disabled={!tab.enabled}
                title={tab.loading ? `${tab.label} is still loading` : tab.label}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {showDownload ? (
            <a
              className="bbox-icon-button"
              href={activeDefinition.downloadHref ?? undefined}
              download={activeDefinition.downloadName ?? undefined}
              aria-label={`Download ${activeDefinition.label}`}
              title={`Download ${activeDefinition.label}`}
            >
              {"\u2193"}
            </a>
          ) : (
            <button
              type="button"
              className="bbox-icon-button"
              disabled
              aria-label={`Download ${activeDefinition?.label ?? "current tab"}`}
              title={`Download ${activeDefinition?.label ?? "current tab"}`}
            >
              {"\u2193"}
            </button>
          )}
        </div>

        <div className="bbox-tab-panel">
          {canCopy ? (
            <button
              type="button"
              className="bbox-copy-button"
              onClick={() => {
                void copyCurrentPanel();
              }}
              aria-label={copyFeedback ?? "Copy current content"}
              title={copyFeedback ?? "Copy current content"}
            >
              {"\u29c9"}
            </button>
          ) : null}

          {isDocumentTab ? (
            <>
              <div className="bbox-panel-toolbar">
                <div className="bbox-page-controls" role="group" aria-label="PDF page navigation">
                  <SymbolButton
                    symbol={"\u2190"}
                    label="Previous page"
                    onClick={() => setCurrentPage((current) => Math.max(1, current - 1))}
                    disabled={!canGoToPreviousPage}
                  />
                  <span>
                    Page {currentPage} of {pageCount}
                  </span>
                  <SymbolButton
                    symbol={"\u2192"}
                    label="Next page"
                    onClick={() => setCurrentPage((current) => Math.min(pageCount, current + 1))}
                    disabled={!canGoToNextPage}
                  />
                </div>

                <div className="bbox-view-controls" role="group" aria-label="Viewer controls">
                  <SymbolButton
                    symbol={"\u2630"}
                    label={isSidebarOpen ? "Hide pages" : "Show pages"}
                    onClick={() => setIsSidebarOpen((current) => !current)}
                    disabled={!canUseViewerControls}
                    pressed={isSidebarOpen}
                  />
                  <SymbolButton
                    symbol={"\u2212"}
                    label="Zoom out"
                    onClick={zoomOut}
                    disabled={!canZoomOut}
                  />
                  <SymbolButton
                    symbol="+"
                    label="Zoom in"
                    onClick={zoomIn}
                    disabled={!canZoomIn}
                  />
                  <SymbolButton
                    symbol={"\u21ba"}
                    label="Rotate counter clockwise"
                    onClick={rotateCounterClockwise}
                    disabled={!canUseViewerControls}
                  />
                  <SymbolButton
                    symbol={"\u21bb"}
                    label="Rotate clockwise"
                    onClick={rotateClockwise}
                    disabled={!canUseViewerControls}
                  />
                </div>

                {showOverlay ? (
                  <div className="bbox-legend">
                    {(Object.keys(CATEGORY_LABELS) as OverlayCategory[]).map((category) => (
                      <button
                        key={category}
                        type="button"
                        className={`bbox-chip ${visibleCategories[category] ? `is-${category}` : "is-muted"}`}
                        aria-pressed={visibleCategories[category]}
                        onClick={() => toggleCategory(category)}
                      >
                        {CATEGORY_LABELS[category]} ({overlayDocument.counts[category]})
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className={`bbox-document-shell ${isSidebarOpen ? "" : "is-rail-hidden"}`.trim()}>
                <div ref={viewerRef} className="bbox-document-stage">
                  {pdfState === "error" ? (
                    <div className="bbox-empty-panel">
                      <p>{pdfErrorMessage ?? "Could not load the PDF viewer."}</p>
                    </div>
                  ) : (
                    <div
                      className={`bbox-stage-shell ${renderedPage ? "is-ready" : "is-loading"}`.trim()}
                    >
                      <div
                        className="bbox-canvas-frame"
                        style={
                          renderedPage
                            ? {
                                width: `${renderedPage.displayWidth}px`,
                                height: `${renderedPage.displayHeight}px`,
                              }
                            : undefined
                        }
                      >
                        <div
                          className="bbox-canvas-transform"
                          style={
                            renderedPage
                              ? {
                                  width: `${renderedPage.baseWidth}px`,
                                  height: `${renderedPage.baseHeight}px`,
                                  transform: getRotationTransform(
                                    rotation,
                                    renderedPage.baseWidth,
                                    renderedPage.baseHeight,
                                  ),
                                }
                              : undefined
                          }
                        >
                          <canvas ref={canvasRef} className="bbox-pdf-canvas" />

                          {renderedPage && showOverlay ? (
                            <div className="bbox-overlay-layer" aria-hidden="true">
                              {pageBoxes.map((box) => {
                                const projected = projectBoundingBox(
                                  box.bbox,
                                  renderedPage.baseHeight,
                                  renderedPage.scale,
                                );

                                return (
                                  <div
                                    key={box.id}
                                    className={`bbox-rect is-${box.category}`}
                                    style={{
                                      left: `${projected.left}px`,
                                      top: `${projected.top}px`,
                                      width: `${projected.width}px`,
                                      height: `${projected.height}px`,
                                    }}
                                    title={`${box.semanticType}: ${box.label}`}
                                  />
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      {!renderedPage ? (
                        <div className="bbox-loading">
                          <p>{sourceFile ? "Loading viewer..." : "Upload a PDF to open the viewer."}</p>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>

                <div className="bbox-panel-footer">
                  {overlayErrorMessage && showOverlay ? (
                    <p>{overlayErrorMessage}</p>
                  ) : showOverlay ? (
                    <p>{pageBoxes.length} visible boxes on this page.</p>
                  ) : (
                    <p>Plain PDF view.</p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <PanelContent tab={activeDefinition} />
          )}
        </div>
      </div>
    </section>
  );
}

function PanelContent({ tab }: { tab: ViewerTabDefinition | undefined }) {
  if (!tab) {
    return (
      <div className="bbox-empty-panel">
        <p>No tab is selected.</p>
      </div>
    );
  }

  if (tab.loading) {
    return (
      <div className="bbox-empty-panel">
        <p>{tab.label} is still loading.</p>
      </div>
    );
  }

  if (!tab.enabled) {
    return (
      <div className="bbox-empty-panel">
        <p>{tab.label} is not available for this job.</p>
      </div>
    );
  }

  if (tab.panelType === "html") {
    return <iframe title={tab.label} className="bbox-html-panel" srcDoc={tab.content ?? ""} sandbox="" />;
  }

  if (tab.panelType === "json" || tab.panelType === "text") {
    return <pre className="bbox-text-panel">{formatPanelContent(tab)}</pre>;
  }

  return (
    <div className="bbox-empty-panel">
      <p>{tab.label} is not available right now.</p>
    </div>
  );
}

function SymbolButton({
  symbol,
  label,
  onClick,
  disabled,
  pressed,
}: {
  symbol: string;
  label: string;
  onClick: () => void;
  disabled: boolean;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      className={`secondary-button symbol-button ${pressed ? "is-active" : ""}`.trim()}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
    >
      {symbol}
    </button>
  );
}

function ThumbnailButton({
  isActive,
  onSelect,
  pageNumber,
  pdfDocument,
  rotation,
}: ThumbnailButtonProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [thumbnailSize, setThumbnailSize] = useState<ThumbnailSize | null>(null);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    let cancelled = false;

    async function renderThumbnail() {
      try {
        const activeCanvas = canvasRef.current;
        if (!activeCanvas) {
          return;
        }

        const page = await pdfDocument.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const fitWidth = usesVerticalLayout(rotation) ? baseViewport.height : baseViewport.width;
        const scale = THUMBNAIL_WIDTH / fitWidth;
        const viewport = page.getViewport({ scale });
        const context = activeCanvas.getContext("2d");

        if (!context) {
          return;
        }

        const pixelRatio = window.devicePixelRatio || 1;
        activeCanvas.width = Math.ceil(viewport.width * pixelRatio);
        activeCanvas.height = Math.ceil(viewport.height * pixelRatio);
        activeCanvas.style.width = `${viewport.width}px`;
        activeCanvas.style.height = `${viewport.height}px`;

        const renderTask = page.render({
          canvas: activeCanvas,
          canvasContext: context,
          transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
          viewport,
        });
        await renderTask.promise;

        if (cancelled) {
          return;
        }

        const displaySize = getDisplaySize(viewport.width, viewport.height, rotation);

        setThumbnailSize({
          baseWidth: viewport.width,
          baseHeight: viewport.height,
          displayWidth: displaySize.width,
          displayHeight: displaySize.height,
        });
      } catch {
        if (cancelled) {
          return;
        }

        setThumbnailSize(null);
      }
    }

    void renderThumbnail();

    return () => {
      cancelled = true;
    };
  }, [pageNumber, pdfDocument, rotation]);

  return (
    <button
      type="button"
      className={`bbox-page-thumb ${isActive ? "is-active" : ""}`}
      onClick={onSelect}
      aria-label={`Go to page ${pageNumber}`}
    >
      <span
        className="bbox-page-thumb-frame"
        style={
          thumbnailSize
            ? {
                width: `${thumbnailSize.displayWidth}px`,
                height: `${thumbnailSize.displayHeight}px`,
              }
            : undefined
        }
      >
        <span
          className="bbox-page-thumb-transform"
          style={
            thumbnailSize
              ? {
                  width: `${thumbnailSize.baseWidth}px`,
                  height: `${thumbnailSize.baseHeight}px`,
                  transform: getRotationTransform(
                    rotation,
                    thumbnailSize.baseWidth,
                    thumbnailSize.baseHeight,
                  ),
                }
              : undefined
          }
        >
          <canvas ref={canvasRef} className="bbox-page-thumb-canvas" />
        </span>
      </span>
      <span className="bbox-page-thumb-number">Page {pageNumber}</span>
    </button>
  );
}

function formatPanelContent(tab: ViewerTabDefinition): string {
  if (tab.panelType !== "json") {
    return tab.content ?? "";
  }

  try {
    return JSON.stringify(JSON.parse(tab.content ?? "{}"), null, 2);
  } catch {
    return tab.content ?? "";
  }
}

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value.toFixed(2))));
}

function normalizeRotation(value: number): number {
  const normalized = value % 360;

  if (normalized < 0) {
    return normalized + 360;
  }

  return normalized;
}

function usesVerticalLayout(rotation: number): boolean {
  const normalized = normalizeRotation(rotation);
  return normalized === 90 || normalized === 270;
}

function getDisplaySize(width: number, height: number, rotation: number): {
  width: number;
  height: number;
} {
  if (!usesVerticalLayout(rotation)) {
    return { width, height };
  }

  return {
    width: height,
    height: width,
  };
}

function getRotationTransform(rotation: number, width: number, height: number): string {
  const normalized = normalizeRotation(rotation);

  if (normalized === 90) {
    return `translate(${height}px, 0px) rotate(90deg)`;
  }

  if (normalized === 180) {
    return `translate(${width}px, ${height}px) rotate(180deg)`;
  }

  if (normalized === 270) {
    return `translate(0px, ${width}px) rotate(270deg)`;
  }

  return "none";
}
