import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import {
  parseOverlayDocument,
  projectBoundingBox,
  type OverlayCategory,
} from "../lib/boundingBoxes";
import type { PreviewPagePayload } from "../lib/types";

const CATEGORY_LABELS: Record<OverlayCategory, string> = {
  text: "Text",
  table: "Table",
};

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 2.4;
const ZOOM_STEP = 0.2;
const THUMBNAIL_WIDTH = 132;
const PAGE_EDGE_MARGIN = 48;

export type ViewerTab = "pdf" | "annot" | "preview" | "html" | "markdown" | "json";

export interface ViewerTabDefinition {
  id: ViewerTab;
  label: string;
  enabled: boolean;
  loading: boolean;
  panelType: "pdf" | "annot" | "text" | "html" | "json";
  content: string | null;
  copyText: string | null;
  pageCopies?: PreviewPagePayload[];
  pagePreviewHref?: string | null;
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
}

interface CanvasRenderTask {
  promise: Promise<unknown>;
  cancel: () => void;
}

interface PagePanelState {
  status: "idle" | "loading" | "ready" | "error";
  content: string | null;
  errorMessage: string | null;
}

interface HandDragState {
  pointerId: number;
  startX: number;
  startY: number;
  panX: number;
  panY: number;
}

interface ViewerSize {
  width: number;
  height: number;
}

interface PanOffset {
  x: number;
  y: number;
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
  const handDragRef = useRef<HandDragState | null>(null);
  const activeDefinition = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];
  const isDocumentTab = activeDefinition?.panelType === "pdf" || activeDefinition?.panelType === "annot";

  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [viewerSize, setViewerSize] = useState<ViewerSize>({ width: 0, height: 0 });
  const [renderedPage, setRenderedPage] = useState<RenderedPage | null>(null);
  const [pdfState, setPdfState] = useState<"loading" | "ready" | "error" | "idle">("idle");
  const [pdfErrorMessage, setPdfErrorMessage] = useState<string | null>(null);
  const [overlayErrorMessage, setOverlayErrorMessage] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [panOffset, setPanOffset] = useState<PanOffset>({ x: 0, y: 0 });
  const [isHandToolOn, setIsHandToolOn] = useState(false);
  const [isHandDragging, setIsHandDragging] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [pageInputValue, setPageInputValue] = useState("1");
  const [pageInputError, setPageInputError] = useState<string | null>(null);
  const [pagePanelState, setPagePanelState] = useState<PagePanelState>({
    status: "idle",
    content: null,
    errorMessage: null,
  });
  const [visibleCategories, setVisibleCategories] = useState<Record<OverlayCategory, boolean>>({
    text: true,
    table: true,
  });
  const [overlayDocument, setOverlayDocument] = useState(() => parseOverlayDocument('{"kids":[]}'));

  useLayoutEffect(() => {
    if (!isDocumentTab) {
      return;
    }

    const element = viewerRef.current;
    if (!element) {
      return;
    }

    const updateViewerSize = () => {
      setViewerSize({
        width: Math.max(0, Math.floor(element.clientWidth)),
        height: Math.max(0, Math.floor(element.clientHeight)),
      });
    };

    updateViewerSize();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateViewerSize);
      return () => {
        window.removeEventListener("resize", updateViewerSize);
      };
    }

    const observer = new ResizeObserver(() => {
      updateViewerSize();
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [isDocumentTab]);

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
    if (!isDocumentTab || !pdfDocument || !canvasRef.current || !viewerSize.width) {
      return;
    }

    const activeCanvas = canvasRef.current;
    const activeDocument = pdfDocument;
    let cancelled = false;
    let renderTask: CanvasRenderTask | null = null;

    async function renderPage() {
      try {
        const page = await activeDocument.getPage(currentPage);
        if (cancelled) {
          return;
        }

        const baseViewport = page.getViewport({ scale: 1 });
        const fitWidth = usesVerticalLayout(rotation) ? baseViewport.height : baseViewport.width;
        const scale = (viewerSize.width / fitWidth) * zoomLevel;
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

        renderTask = page.render({
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
        if (cancelled || isRenderCancelled(error)) {
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
      renderTask?.cancel();
      clearCanvas(activeCanvas);
    };
  }, [currentPage, isDocumentTab, pdfDocument, rotation, viewerSize.width, zoomLevel]);

  useEffect(() => {
    setCurrentPage((current) => Math.min(current, pageCount));
  }, [pageCount]);

  useEffect(() => {
    setPageInputValue(String(currentPage));
    setPageInputError(null);
  }, [currentPage]);

  useEffect(() => {
    if (isDocumentTab) {
      return;
    }

    handDragRef.current = null;
    setIsHandDragging(false);
    setIsHandToolOn(false);
    setPanOffset({ x: 0, y: 0 });
  }, [isDocumentTab]);

  useEffect(() => {
    setPanOffset({ x: 0, y: 0 });
  }, [currentPage, rotation]);

  useEffect(() => {
    if (!renderedPage || !viewerSize.width || !viewerSize.height) {
      setPanOffset({ x: 0, y: 0 });
      return;
    }

    const bounds = getPanBounds(renderedPage, viewerSize);
    setPanOffset((current) => ({
      x: clampPan(current.x, bounds.minX, bounds.maxX),
      y: clampPan(current.y, bounds.minY, bounds.maxY),
    }));
  }, [renderedPage, viewerSize]);

  useEffect(() => {
    setCopyFeedback(null);
  }, [activeTab]);

  useEffect(() => {
    if (!activeDefinition || isDocumentTab) {
      setPagePanelState({
        status: "idle",
        content: null,
        errorMessage: null,
      });
      return;
    }

    if (!activeDefinition.enabled) {
      setPagePanelState({
        status: "ready",
        content: null,
        errorMessage: null,
      });
      return;
    }

    const inlineContent = findPageCopy(activeDefinition.pageCopies, currentPage);
    if (inlineContent !== null) {
      setPagePanelState({
        status: "ready",
        content: inlineContent,
        errorMessage: null,
      });
      return;
    }

    if (!activeDefinition.pagePreviewHref) {
      setPagePanelState({
        status: "ready",
        content: activeDefinition.content,
        errorMessage: null,
      });
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    setPagePanelState({
      status: "loading",
      content: null,
      errorMessage: null,
    });

    async function loadPagePanel() {
      try {
        const content = await fetchPagePanelContent(
          activeDefinition.pagePreviewHref ?? null,
          currentPage,
          controller.signal,
        );

        if (cancelled) {
          return;
        }

        setPagePanelState({
          status: "ready",
          content,
          errorMessage: null,
        });
      } catch (error) {
        if (cancelled || controller.signal.aborted) {
          return;
        }

        setPagePanelState({
          status: "error",
          content: null,
          errorMessage:
            error instanceof Error ? error.message : `Could not load page ${currentPage}.`,
        });
      }
    }

    void loadPagePanel();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeDefinition, currentPage, isDocumentTab]);

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
  const isPageAwareTab = Boolean(activeDefinition);
  const canUseHandTool = canUseViewerControls;
  const handToolLabel = canUseHandTool
    ? isHandToolOn
      ? "Turn off hand tool"
      : "Turn on hand tool"
    : "Wait for the page to load";
  const isCopyablePanel = activeDefinition?.panelType === "text" || activeDefinition?.panelType === "json";
  const canCopy = Boolean(
    isCopyablePanel &&
      pagePanelState.status !== "error" &&
      (activeDefinition?.copyText ||
        activeDefinition?.pageCopies?.length ||
        activeDefinition?.pagePreviewHref),
  );
  const showDownload = Boolean(activeDefinition?.downloadHref && activeDefinition?.downloadName);
  const showOverlay = activeDefinition?.panelType === "annot";
  const activePanelContent = pagePanelState.content ?? activeDefinition?.content ?? null;
  const framePosition = getFramePosition(renderedPage, viewerSize, panOffset);

  function toggleCategory(category: OverlayCategory) {
    setVisibleCategories((current) => ({
      ...current,
      [category]: !current[category],
    }));
  }

  function goToPage(pageNumber: number) {
    const nextPage = clampPageNumber(pageNumber, pageCount);
    setCurrentPage(nextPage);
  }

  function handlePageInputChange(value: string) {
    const nextValue = value.replace(/\D/g, "");
    setPageInputValue(nextValue);
    setPageInputError(null);
  }

  function commitPageInput() {
    const trimmedValue = pageInputValue.trim();
    if (!trimmedValue) {
      setPageInputError(`Enter a page from 1 to ${pageCount}.`);
      setPageInputValue(String(currentPage));
      return;
    }

    const requestedPage = Number(trimmedValue);
    if (!Number.isInteger(requestedPage) || requestedPage < 1 || requestedPage > pageCount) {
      setPageInputError(`Enter a page from 1 to ${pageCount}.`);
      setPageInputValue(String(currentPage));
      return;
    }

    setPageInputError(null);
    goToPage(requestedPage);
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

  function toggleHandTool() {
    if (!canUseHandTool) {
      return;
    }

    handDragRef.current = null;
    setIsHandDragging(false);
    setIsHandToolOn((current) => !current);
  }

  function stopHandDrag(pointerId?: number) {
    const dragState = handDragRef.current;
    if (!dragState) {
      return;
    }

    if (pointerId !== undefined && dragState.pointerId !== pointerId) {
      return;
    }

    handDragRef.current = null;
    setIsHandDragging(false);
    viewerRef.current?.releasePointerCapture?.(dragState.pointerId);
  }

  function handleStagePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!isHandToolOn || !renderedPage) {
      return;
    }

    if (event.button > 0) {
      return;
    }

    const viewer = viewerRef.current;
    if (!viewer) {
      return;
    }

    const pointerPosition = getPointerPosition(event);
    handDragRef.current = {
      pointerId: event.pointerId,
      startX: pointerPosition.x,
      startY: pointerPosition.y,
      panX: panOffset.x,
      panY: panOffset.y,
    };
    setIsHandDragging(true);
    viewer.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function handleStagePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const dragState = handDragRef.current;
    const viewer = viewerRef.current;

    if (!dragState || !viewer) {
      return;
    }

    if (dragState.pointerId !== event.pointerId) {
      return;
    }

    const pointerPosition = getPointerPosition(event);
    const deltaX = pointerPosition.x - dragState.startX;
    const deltaY = pointerPosition.y - dragState.startY;
    const bounds = getPanBounds(renderedPage, viewerSize);

    setPanOffset({
      x: clampPan(dragState.panX + deltaX, bounds.minX, bounds.maxX),
      y: clampPan(dragState.panY + deltaY, bounds.minY, bounds.maxY),
    });
    event.preventDefault();
  }

  async function copyCurrentPanel() {
    if (!activeDefinition || !navigator.clipboard?.writeText) {
      return;
    }

    const pageCopy = pagePanelState.content ?? (await resolvePageCopyText(activeDefinition, currentPage));
    const nextCopyText = pageCopy ?? activeDefinition.copyText;
    if (!nextCopyText) {
      return;
    }

    await navigator.clipboard.writeText(formatPanelContent(activeDefinition, nextCopyText));
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
          {isPageAwareTab ? (
            <div className="bbox-panel-toolbar">
              <div className="bbox-page-controls" role="group" aria-label="PDF page navigation">
                <SymbolButton
                  symbol={"\u2190"}
                  label="Previous page"
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={!canGoToPreviousPage}
                />

                <label className="bbox-page-input-shell">
                  <span className="bbox-page-input-label">Page</span>
                  <input
                    className="bbox-page-input"
                    type="text"
                    inputMode="numeric"
                    value={pageInputValue}
                    onChange={(event) => handlePageInputChange(event.target.value)}
                    onBlur={commitPageInput}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") {
                        return;
                      }

                      event.preventDefault();
                      commitPageInput();
                    }}
                    aria-label="Page number"
                    aria-invalid={pageInputError ? "true" : "false"}
                    disabled={!canUseViewerControls}
                  />
                </label>

                <span className="bbox-page-count">of {pageCount}</span>

                <SymbolButton
                  symbol={"\u2192"}
                  label="Next page"
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={!canGoToNextPage}
                />
              </div>

              {isDocumentTab ? (
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
                    symbol={"\u270b"}
                    label={handToolLabel}
                    onClick={toggleHandTool}
                    disabled={!canUseHandTool}
                    pressed={isHandToolOn}
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
              ) : null}

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

              {pageInputError ? <p className="bbox-page-error">{pageInputError}</p> : null}
            </div>
          ) : null}

          <div className="bbox-panel-content">
            {isDocumentTab ? (
              <div className={`bbox-document-shell ${isSidebarOpen ? "" : "is-rail-hidden"}`.trim()}>
                <div
                  ref={viewerRef}
                  className={`bbox-document-stage ${isHandToolOn ? "is-hand-tool-on" : ""} ${isHandDragging ? "is-dragging" : ""}`.trim()}
                  onPointerDown={handleStagePointerDown}
                  onPointerMove={handleStagePointerMove}
                  onPointerUp={(event) => stopHandDrag(event.pointerId)}
                  onPointerCancel={(event) => stopHandDrag(event.pointerId)}
                  onLostPointerCapture={(event) => stopHandDrag(event.pointerId)}
                >
                  {pdfState === "error" ? (
                    <div className="bbox-empty-panel">
                      <p>{pdfErrorMessage ?? "Could not load the PDF viewer."}</p>
                    </div>
                  ) : (
                    <div className={`bbox-stage-shell ${renderedPage ? "is-ready" : "is-loading"}`.trim()}>
                      <div
                        className="bbox-stage-positioner"
                        style={
                          renderedPage
                            ? {
                                transform: `translate(${framePosition.x}px, ${framePosition.y}px)`,
                              }
                            : undefined
                        }
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
                      </div>

                      {!renderedPage ? (
                        <div className="bbox-loading">
                          <p>{sourceFile ? "Loading viewer..." : "Upload a PDF to open the viewer."}</p>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>

                {showOverlay ? (
                  <div className="bbox-panel-footer">
                    {overlayErrorMessage ? (
                      <p>{overlayErrorMessage}</p>
                    ) : (
                      <p>{pageBoxes.length} visible boxes on this page.</p>
                    )}
                  </div>
                ) : null}
              </div>
            ) : (
              <PanelContent
                tab={activeDefinition}
                currentPage={currentPage}
                content={activePanelContent}
                pageState={pagePanelState.status}
                pageErrorMessage={pagePanelState.errorMessage}
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function PanelContent({
  tab,
  currentPage,
  content,
  pageState,
  pageErrorMessage,
}: {
  tab: ViewerTabDefinition | undefined;
  currentPage: number;
  content: string | null;
  pageState: PagePanelState["status"];
  pageErrorMessage: string | null;
}) {
  if (!tab) {
    return (
      <PagePanelShell>
        <div className="bbox-empty-panel">
          <p>No tab is selected.</p>
        </div>
      </PagePanelShell>
    );
  }

  if (tab.loading) {
    return (
      <PagePanelShell>
        <div className="bbox-empty-panel">
          <p>{tab.label} is still loading.</p>
        </div>
      </PagePanelShell>
    );
  }

  if (!tab.enabled) {
    return (
      <PagePanelShell>
        <div className="bbox-empty-panel">
          <p>{tab.label} is not available for this job.</p>
        </div>
      </PagePanelShell>
    );
  }

  if (pageState === "loading") {
    return (
      <PagePanelShell>
        <div className="bbox-empty-panel">
          <p>Loading page {currentPage}.</p>
        </div>
      </PagePanelShell>
    );
  }

  if (pageState === "error") {
    return (
      <PagePanelShell>
        <div className="bbox-empty-panel">
          <p>{pageErrorMessage ?? `Could not load page ${currentPage}.`}</p>
        </div>
      </PagePanelShell>
    );
  }

  if (tab.panelType === "html") {
    return (
      <PagePanelShell isHtml>
        <iframe title={tab.label} className="bbox-html-panel" srcDoc={content ?? ""} sandbox="" />
      </PagePanelShell>
    );
  }

  if (tab.panelType === "json" || tab.panelType === "text") {
    return (
      <PagePanelShell>
        <pre className="bbox-text-panel">{formatPanelContent(tab, content)}</pre>
      </PagePanelShell>
    );
  }

  return (
    <PagePanelShell>
      <div className="bbox-empty-panel">
        <p>{tab.label} is not available right now.</p>
      </div>
    </PagePanelShell>
  );
}

function PagePanelShell({
  children,
  isHtml = false,
}: {
  children: ReactNode;
  isHtml?: boolean;
}) {
  return (
    <div className="bbox-page-panel-shell">
      <div className={`bbox-page-panel-card ${isHtml ? "is-html" : ""}`.trim()}>{children}</div>
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
}: ThumbnailButtonProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [thumbnailSize, setThumbnailSize] = useState<ThumbnailSize | null>(null);

  useLayoutEffect(() => {
    const thumbnailCanvas = canvasRef.current;
    if (!thumbnailCanvas) {
      return;
    }

    let cancelled = false;
    let renderTask: CanvasRenderTask | null = null;

    async function renderThumbnail(activeCanvas: HTMLCanvasElement) {
      try {
        const page = await pdfDocument.getPage(pageNumber);
        if (cancelled) {
          return;
        }

        const baseViewport = page.getViewport({ scale: 1 });
        const scale = THUMBNAIL_WIDTH / baseViewport.width;
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

        setThumbnailSize({
          baseWidth: viewport.width,
          baseHeight: viewport.height,
          displayWidth: viewport.width,
          displayHeight: viewport.height,
        });

        renderTask = page.render({
          canvas: activeCanvas,
          canvasContext: context,
          transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
          viewport,
        });
        await renderTask.promise;

        if (cancelled) {
          return;
        }
      } catch (error) {
        if (cancelled || isRenderCancelled(error)) {
          return;
        }

        setThumbnailSize(null);
        clearCanvas(thumbnailCanvas);
      }
    }

    setThumbnailSize(null);
    void renderThumbnail(thumbnailCanvas);

    return () => {
      cancelled = true;
      renderTask?.cancel();
      clearCanvas(thumbnailCanvas);
    };
  }, [pageNumber, pdfDocument]);

  return (
    <button
      type="button"
      className={`bbox-page-thumb ${isActive ? "is-active" : ""}`}
      onClick={onSelect}
      aria-label={`Go to page ${pageNumber}`}
    >
      <div
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
        <div
          className="bbox-page-thumb-transform"
          style={
            thumbnailSize
              ? {
                  width: `${thumbnailSize.baseWidth}px`,
                  height: `${thumbnailSize.baseHeight}px`,
                  transform: "none",
                }
              : undefined
          }
        >
          <canvas ref={canvasRef} className="bbox-page-thumb-canvas" />
        </div>
      </div>
      <span className="bbox-page-thumb-number">Page {pageNumber}</span>
    </button>
  );
}

async function fetchPagePanelContent(
  pagePreviewHref: string | null,
  currentPage: number,
  signal: AbortSignal,
): Promise<string> {
  if (!pagePreviewHref) {
    return "";
  }

  const response = await fetch(`${pagePreviewHref}?page=${currentPage}`, { signal });
  if (!response.ok) {
    throw new Error(`Could not load page ${currentPage}.`);
  }

  const payload = (await response.json()) as { content?: unknown };
  if (typeof payload.content !== "string") {
    throw new Error(`Could not load page ${currentPage}.`);
  }

  return payload.content;
}

async function resolvePageCopyText(
  tab: ViewerTabDefinition,
  currentPage: number,
): Promise<string | null> {
  const inlineCopy = findPageCopy(tab.pageCopies, currentPage);
  if (inlineCopy !== null) {
    return inlineCopy;
  }

  if (!tab.pagePreviewHref) {
    return null;
  }

  try {
    const response = await fetch(`${tab.pagePreviewHref}?page=${currentPage}`);
    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { content?: unknown };
    if (typeof payload.content !== "string") {
      return null;
    }

    return payload.content;
  } catch {
    return null;
  }
}

function findPageCopy(
  pageCopies: PreviewPagePayload[] | undefined,
  currentPage: number,
): string | null {
  if (!pageCopies?.length) {
    return null;
  }

  return pageCopies.find((page) => page.pageNumber === currentPage)?.content ?? null;
}

function formatPanelContent(tab: ViewerTabDefinition, content: string | null = tab.content): string {
  if (tab.panelType !== "json") {
    return content ?? "";
  }

  try {
    return JSON.stringify(JSON.parse(content ?? "{}"), null, 2);
  } catch {
    return content ?? "";
  }
}

function clampPageNumber(pageNumber: number, pageCount: number): number {
  return Math.min(pageCount, Math.max(1, pageNumber));
}

function getPointerPosition(event: ReactPointerEvent<HTMLDivElement>): {
  x: number;
  y: number;
} {
  const x = readPointerCoordinate(event.clientX, event.pageX);
  const y = readPointerCoordinate(event.clientY, event.pageY);

  return { x, y };
}

function readPointerCoordinate(primary: number, fallback: number): number {
  if (Number.isFinite(primary)) {
    return primary;
  }

  if (Number.isFinite(fallback)) {
    return fallback;
  }

  return 0;
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

function getPanBounds(
  renderedPage: RenderedPage | null,
  viewerSize: ViewerSize,
): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  if (!renderedPage || !viewerSize.width || !viewerSize.height) {
    return {
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
    };
  }

  const frameX = getBaseFrameX(renderedPage.displayWidth, viewerSize.width);
  const visibleWidth = Math.min(PAGE_EDGE_MARGIN, renderedPage.displayWidth / 2);
  const visibleHeight = Math.min(PAGE_EDGE_MARGIN, renderedPage.displayHeight / 2);

  return {
    minX: visibleWidth - renderedPage.displayWidth - frameX,
    maxX: viewerSize.width - visibleWidth - frameX,
    minY: visibleHeight - renderedPage.displayHeight,
    maxY: viewerSize.height - visibleHeight,
  };
}

function clampPan(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getFramePosition(
  renderedPage: RenderedPage | null,
  viewerSize: ViewerSize,
  panOffset: PanOffset,
): {
  x: number;
  y: number;
} {
  if (!renderedPage) {
    return {
      x: 0,
      y: 0,
    };
  }

  const bounds = getPanBounds(renderedPage, viewerSize);

  return {
    x: getBaseFrameX(renderedPage.displayWidth, viewerSize.width) + clampPan(panOffset.x, bounds.minX, bounds.maxX),
    y: clampPan(panOffset.y, bounds.minY, bounds.maxY),
  };
}

function getBaseFrameX(frameWidth: number, viewerWidth: number): number {
  if (!viewerWidth) {
    return 0;
  }

  return Math.max((viewerWidth - frameWidth) / 2, 0);
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

function clearCanvas(canvas: HTMLCanvasElement | null) {
  if (!canvas) {
    return;
  }

  canvas.width = 0;
  canvas.height = 0;
  canvas.style.width = "";
  canvas.style.height = "";
}

function isRenderCancelled(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const name = "name" in error ? String(error.name ?? "") : "";
  if (name === "RenderingCancelledException") {
    return true;
  }

  const message = "message" in error ? String(error.message ?? "") : "";
  return message.toLowerCase().includes("cancel");
}
