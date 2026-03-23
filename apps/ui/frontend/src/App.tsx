import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, ReactNode, RefObject, SetStateAction } from "react";
import BoundingBoxPreview, {
  type ViewerTab,
  type ViewerTabDefinition,
} from "./components/BoundingBoxPreview";
import { createBrowserApi } from "./lib/api";
import { readSessionFlag, writeSessionFlag } from "./lib/session";
import type {
  ComposeOptions,
  HybridSettings,
  JobFile,
  JobRecord,
  MarkdownStyle,
  PreviewPagePayload,
  PreviewPayload,
  OutputFormat,
  StorageLike,
  UiApi,
} from "./lib/types";
import { isPdfFile, validatePageRange } from "./lib/validators";

const DEFAULT_OPTIONS: ComposeOptions = {
  formats: ["markdown", "json"],
  markdownStyle: "plain",
  pageRange: "",
  sanitize: false,
  keepLineBreaks: true,
  includeHeaderFooter: false,
  useStructTree: true,
  tableMethod: "default",
  readingOrder: "xycut",
  imageOutput: "external",
  imageFormat: "png",
  hybrid: {
    enabled: false,
    engine: "docling-fast",
    mode: "auto",
    url: "",
    timeoutMs: "30000",
    fallback: false,
  },
};

const STORAGE_KEY = "odl-ui-advanced-open";
const THEME_STORAGE_KEY = "odl-ui-dark-theme";
const ADVANCED_PANEL_ANIMATION_MS = 220;
const VIEWER_TAB_ORDER: ViewerTab[] = ["pdf", "annot", "preview", "html", "markdown", "json"];
const VIEWER_TAB_LABELS: Record<ViewerTab, string> = {
  pdf: "PDF",
  annot: "Annot",
  preview: "Preview",
  html: "HTML",
  markdown: "MD",
  json: "JSON",
};
const FORMAT_CHOICES: Array<{ value: OutputFormat; label: string }> = [
  { value: "markdown", label: "Markdown" },
  { value: "json", label: "JSON" },
  { value: "html", label: "HTML" },
  { value: "text", label: "Text" },
  { value: "pdf", label: "PDF" },
];

interface AppProps {
  api?: UiApi;
  storage?: StorageLike;
  initialJob?: JobRecord;
}

export default function App({ api = createBrowserApi(), storage, initialJob }: AppProps) {
  const backingStorage = storage ?? window.sessionStorage;
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [job, setJob] = useState<JobRecord | null>(initialJob ?? null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadInputKey, setUploadInputKey] = useState(0);
  const [viewerResetKey, setViewerResetKey] = useState(0);
  const [advancedOpen, setAdvancedOpen] = useState(() =>
    readSessionFlag(backingStorage, STORAGE_KEY),
  );
  const [isDarkTheme, setIsDarkTheme] = useState(() =>
    readSessionFlag(backingStorage, THEME_STORAGE_KEY),
  );
  const [options, setOptions] = useState<ComposeOptions>(DEFAULT_OPTIONS);
  const [activeViewerTab, setActiveViewerTab] = useState<ViewerTab>("pdf");

  useEffect(() => {
    writeSessionFlag(backingStorage, STORAGE_KEY, advancedOpen);
  }, [advancedOpen, backingStorage]);

  useEffect(() => {
    writeSessionFlag(backingStorage, THEME_STORAGE_KEY, isDarkTheme);
  }, [backingStorage, isDarkTheme]);

  useEffect(() => {
    if (!job) {
      return;
    }

    if (job.status !== "queued" && job.status !== "running") {
      return;
    }

    const timer = window.setInterval(async () => {
      try {
        const next = await api.getJob(job.id);
        setJob(next);
      } catch (error) {
        setSubmitError(error instanceof Error ? error.message : "Could not refresh job status.");
      }
    }, 2000);

    return () => {
      window.clearInterval(timer);
    };
  }, [api, job]);

  const pageRangeError = useMemo(() => validatePageRange(options.pageRange), [options.pageRange]);
  const sourceFileUrl = useObjectUrl(selectedFile);
  const viewerTabs = useMemo(
    () =>
      buildViewerTabs({
        api,
        job,
        isSubmitting,
        sourceFile: selectedFile,
        sourceFileUrl,
      }),
    [api, isSubmitting, job, selectedFile, sourceFileUrl],
  );
  const boundingBoxJsonUrl = useMemo(
    () => viewerTabs.find((tab) => tab.id === "annot")?.dataUrl ?? null,
    [viewerTabs],
  );

  useEffect(() => {
    setActiveViewerTab(pickPreferredViewerTab(viewerTabs));
  }, [job?.id, selectedFile]);

  useEffect(() => {
    const activeDefinition = viewerTabs.find((tab) => tab.id === activeViewerTab);

    if (activeDefinition?.enabled) {
      return;
    }

    setActiveViewerTab(pickPreferredViewerTab(viewerTabs));
  }, [activeViewerTab, viewerTabs]);

  function updateFormats(format: OutputFormat) {
    setOptions((current) => {
      const exists = current.formats.includes(format);
      const formats = exists
        ? current.formats.filter((item) => item !== format)
        : [...current.formats, format];

      return { ...current, formats: formats.length > 0 ? formats : current.formats };
    });
  }

  function updateHybrid(patch: Partial<HybridSettings>) {
    setOptions((current) => ({
      ...current,
      hybrid: {
        ...current.hybrid,
        ...patch,
      },
    }));
  }

  async function handleSubmit() {
    setFileError(null);
    setSubmitError(null);

    if (!selectedFile) {
      setFileError("Choose a PDF before starting a job.");
      return;
    }

    if (!isPdfFile(selectedFile)) {
      setFileError("This UI only accepts a single PDF file.");
      return;
    }

    if (pageRangeError) {
      setFileError(pageRangeError);
      return;
    }

    setIsSubmitting(true);
    setActiveViewerTab("pdf");

    try {
      const payload = buildSubmissionPayload(options);
      const nextJob = await api.createJob(selectedFile, payload);
      setJob(nextJob);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Could not start the conversion.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleFileChange(file: File | null) {
    setSubmitError(null);
    setFileError(null);
    setSelectedFile(file);
  }

  function resetWorkflow() {
    setIsSubmitting(false);
    setJob(null);
    setSelectedFile(null);
    setFileError(null);
    setSubmitError(null);
    setActiveViewerTab("pdf");
    setUploadInputKey((current) => current + 1);
    setViewerResetKey((current) => current + 1);
  }

  function openAdvanced() {
    setAdvancedOpen(true);
  }

  function closeAdvanced() {
    setAdvancedOpen(false);
  }

  function showLightTheme() {
    setIsDarkTheme(false);
  }

  function showDarkTheme() {
    setIsDarkTheme(true);
  }

  const showOptionsCard = Boolean(selectedFile);
  const showResultsCard = Boolean(job) || isSubmitting;

  return (
    <div
      className="shell"
      data-theme={isDarkTheme ? "dark" : "light"}
      style={{ colorScheme: isDarkTheme ? "dark" : "light" }}
    >
      <div className="backdrop backdrop-a" />
      <div className="backdrop backdrop-b" />

      <header className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Local browser UI</p>
          <h1>Convert one PDF without leaving the browser.</h1>
          <p className="lede">
            Upload a single file, choose the outputs you want, and move through the workflow one
            step at a time.
          </p>

          <div className="theme-toggle" role="group" aria-label="Color theme">
            <button
              type="button"
              className={`theme-toggle-button ${!isDarkTheme ? "is-active" : ""}`}
              onClick={showLightTheme}
              aria-pressed={!isDarkTheme}
              aria-label="Light theme"
              title="Light theme"
            >
              {"\u2600"}
            </button>
            <button
              type="button"
              className={`theme-toggle-button ${isDarkTheme ? "is-active" : ""}`}
              onClick={showDarkTheme}
              aria-pressed={isDarkTheme}
              aria-label="Dark theme"
              title="Dark theme"
            >
              {"\u263e"}
            </button>
          </div>
        </div>
      </header>

      <main className="workflow">
        <WorkflowCard number="1" title="Upload" summary="Drop in one PDF or browse for it.">
          <UploadCard
            file={selectedFile}
            onFile={handleFileChange}
            onDrop={handleFileChange}
            error={fileError}
            inputKey={uploadInputKey}
          />
        </WorkflowCard>

        {showOptionsCard ? (
          <WorkflowCard
            number="2"
            title="Options"
            summary="Choose the outputs and settings before starting the job."
          >
            <OptionsCard
              options={options}
              pageRangeError={pageRangeError}
              submitError={submitError}
              onToggleFormat={updateFormats}
              onChangeOption={setOptions}
              onOpenAdvanced={openAdvanced}
              onCloseAdvanced={closeAdvanced}
              advancedOpen={advancedOpen}
              onSubmit={handleSubmit}
              isSubmitting={isSubmitting}
              onChangeHybrid={updateHybrid}
            />
          </WorkflowCard>
        ) : null}

        {showResultsCard ? (
          <WorkflowCard
            number="3"
            title="Results"
            summary="This card becomes the viewer as soon as the job starts."
          >
            <ResultsCard
              key={viewerResetKey}
              job={job}
              isSubmitting={isSubmitting}
              sourceFile={selectedFile}
              boundingBoxJsonUrl={boundingBoxJsonUrl}
              activeViewerTab={activeViewerTab}
              setActiveViewerTab={setActiveViewerTab}
              tabs={viewerTabs}
              submitError={submitError}
              onReset={resetWorkflow}
            />
          </WorkflowCard>
        ) : null}
      </main>
    </div>
  );
}

function useObjectUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setUrl((current) => {
        if (current) {
          URL.revokeObjectURL(current);
        }

        return null;
      });
      return;
    }

    const nextUrl = URL.createObjectURL(file);
    setUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }

      return nextUrl;
    });

    return () => {
      URL.revokeObjectURL(nextUrl);
    };
  }, [file]);

  return url;
}

function buildSubmissionPayload(options: ComposeOptions): ComposeOptions {
  return {
    ...options,
    formats: [...options.formats],
    hybrid: { ...options.hybrid },
  };
}

function pickPreferredViewerTab(tabs: ViewerTabDefinition[]): ViewerTab {
  const annotTab = tabs.find((tab) => tab.id === "annot");
  if (annotTab?.enabled) {
    return "annot";
  }

  return tabs.find((tab) => tab.enabled)?.id ?? "pdf";
}

function buildViewerTabs({
  api,
  job,
  isSubmitting,
  sourceFile,
  sourceFileUrl,
}: {
  api: UiApi;
  job: JobRecord | null;
  isSubmitting: boolean;
  sourceFile: File | null;
  sourceFileUrl: string | null;
}): ViewerTabDefinition[] {
  const files = job?.files ?? [];
  const isBusy = isSubmitting || job?.status === "queued" || job?.status === "running";
  const markdownFile = findOutputFile(files, "markdown");
  const jsonFile = findOutputFile(files, "json");
  const htmlFile = findOutputFile(files, "html");
  const textFile = findOutputFile(files, "text");
  const markdownPageCopies = buildPageCopies(markdownFile?.preview);
  const jsonPageCopies = buildPageCopies(jsonFile?.preview);
  const textPageCopies = buildPageCopies(textFile?.preview);

  return VIEWER_TAB_ORDER.map((id) => {
    switch (id) {
      case "pdf":
        return {
          id,
          label: VIEWER_TAB_LABELS[id],
          enabled: Boolean(sourceFile && sourceFileUrl),
          loading: false,
          panelType: "pdf",
          content: null,
          copyText: null,
          pageCopies: undefined,
          pagePreviewHref: null,
          downloadHref: sourceFileUrl,
          downloadName: sourceFile?.name ?? null,
          dataUrl: null,
        } satisfies ViewerTabDefinition;
      case "annot":
        return {
          id,
          label: VIEWER_TAB_LABELS[id],
          enabled: Boolean(sourceFile && job && jsonFile),
          loading: Boolean(sourceFile && isBusy && !jsonFile),
          panelType: "annot",
          content: null,
          copyText: null,
          pageCopies: jsonPageCopies,
          pagePreviewHref: null,
          downloadHref: null,
          downloadName: null,
          dataUrl: job && jsonFile ? api.downloadFileUrl(job.id, jsonFile.name) : null,
        } satisfies ViewerTabDefinition;
      case "preview":
        return createTextTab(id, VIEWER_TAB_LABELS[id], api, job, textFile, isBusy, textPageCopies);
      case "html":
        return {
          id,
          label: VIEWER_TAB_LABELS[id],
          enabled: Boolean(job && htmlFile && htmlFile.preview?.content),
          loading: Boolean(isBusy && !htmlFile),
          panelType: "html",
          content: htmlFile?.preview?.content ?? null,
          copyText: null,
          pageCopies: undefined,
          pagePreviewHref: null,
          downloadHref: job && htmlFile ? api.downloadFileUrl(job.id, htmlFile.name) : null,
          downloadName: htmlFile?.name ?? null,
          dataUrl: null,
        } satisfies ViewerTabDefinition;
      case "markdown":
        return createTextTab(
          id,
          VIEWER_TAB_LABELS[id],
          api,
          job,
          markdownFile,
          isBusy,
          markdownPageCopies,
        );
      case "json":
        return {
          id,
          label: VIEWER_TAB_LABELS[id],
          enabled: Boolean(job && jsonFile && jsonFile.preview?.content),
          loading: Boolean(isBusy && !jsonFile),
          panelType: "json",
          content: jsonFile?.preview?.content ?? null,
          copyText: jsonFile?.preview?.content ?? null,
          pageCopies: jsonPageCopies,
          pagePreviewHref: buildPagePreviewHref(job, jsonFile, api),
          downloadHref: job && jsonFile ? api.downloadFileUrl(job.id, jsonFile.name) : null,
          downloadName: jsonFile?.name ?? null,
          dataUrl: null,
        } satisfies ViewerTabDefinition;
    }
  });
}

function createTextTab(
  id: ViewerTab,
  label: string,
  api: UiApi,
  job: JobRecord | null,
  file: JobFile | null,
  isBusy: boolean,
  pageCopies?: PreviewPagePayload[],
): ViewerTabDefinition {
  return {
    id,
    label,
    enabled: Boolean(job && file && file.preview?.content),
    loading: Boolean(isBusy && !file),
    panelType: "text",
    content: file?.preview?.content ?? null,
    copyText: file?.preview?.content ?? null,
    pageCopies,
    pagePreviewHref: buildPagePreviewHref(job, file, api),
    downloadHref: job && file ? api.downloadFileUrl(job.id, file.name) : null,
    downloadName: file?.name ?? null,
    dataUrl: null,
  };
}

function findOutputFile(files: JobFile[], kind: JobFile["kind"]): JobFile | null {
  return files.find((file) => file.kind === kind || file.preview?.kind === kind) ?? null;
}

function buildPageCopies(preview: PreviewPayload | undefined): PreviewPagePayload[] | undefined {
  if (!preview?.pages?.length) {
    return undefined;
  }

  return preview.pages.map((page) => ({
    pageNumber: page.pageNumber,
    content: page.content,
  }));
}

function buildPagePreviewHref(
  job: JobRecord | null,
  file: JobFile | null,
  api: UiApi,
): string | null {
  if (!job || !file) {
    return null;
  }

  return `${api.downloadFileUrl(job.id, file.name)}/preview`;
}

function WorkflowCard({
  number,
  title,
  summary,
  children,
}: {
  number: string;
  title: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <section className="workflow-card-shell">
      <StepHeading number={number} title={title} summary={summary} />
      {children}
    </section>
  );
}

function StepHeading({
  number,
  title,
  summary,
}: {
  number: string;
  title: string;
  summary: string;
}) {
  return (
    <div className="step-heading">
      <span>{number}</span>
      <div>
        <h2>{title}</h2>
        <p>{summary}</p>
      </div>
    </div>
  );
}

function UploadCard({
  file,
  onFile,
  onDrop,
  error,
  inputKey,
}: {
  file: File | null;
  onFile: (file: File | null) => void;
  onDrop: (file: File | null) => void;
  error: string | null;
  inputKey: number;
}) {
  const [dragActive, setDragActive] = useState(false);

  return (
    <div
      className={`upload-card ${dragActive ? "is-dragging" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragActive(false);
        const nextFile = event.dataTransfer.files?.[0] ?? null;
        onDrop(nextFile);
      }}
    >
      <div className="upload-inner">
        <div className="upload-icon">PDF</div>
        <div>
          <h3>Drop a PDF here</h3>
          <p>Only one file at a time. The browser keeps the job local.</p>
        </div>
      </div>

      <label className="file-picker">
        <input
          key={inputKey}
          type="file"
          accept="application/pdf"
          onChange={(event) => onFile(event.target.files?.[0] ?? null)}
        />
        <span>Browse files</span>
      </label>

      <div className="file-summary">
        <strong>{file ? file.name : "No file selected"}</strong>
        <span>{file ? formatFileSize(file.size) : "A PDF is required before you can continue."}</span>
      </div>

      {error ? <p className="inline-error">{error}</p> : null}
    </div>
  );
}

function OptionsCard({
  options,
  pageRangeError,
  submitError,
  onToggleFormat,
  onChangeOption,
  onOpenAdvanced,
  onCloseAdvanced,
  advancedOpen,
  onSubmit,
  isSubmitting,
  onChangeHybrid,
}: {
  options: ComposeOptions;
  pageRangeError: string | null;
  submitError: string | null;
  onToggleFormat: (format: OutputFormat) => void;
  onChangeOption: Dispatch<SetStateAction<ComposeOptions>>;
  onOpenAdvanced: () => void;
  onCloseAdvanced: () => void;
  advancedOpen: boolean;
  onSubmit: () => void;
  isSubmitting: boolean;
  onChangeHybrid: (patch: Partial<HybridSettings>) => void;
}) {
  const hybridControlsDisabled = !options.hybrid.enabled;
  const advancedPanelRef = useRef<HTMLElement | null>(null);
  const advancedButtonRef = useRef<HTMLButtonElement | null>(null);
  const [renderAdvancedPanel, setRenderAdvancedPanel] = useState(advancedOpen);
  const [advancedPanelOpen, setAdvancedPanelOpen] = useState(advancedOpen);

  useEffect(() => {
    if (advancedOpen) {
      setRenderAdvancedPanel(true);

      const frameId = window.requestAnimationFrame(() => {
        setAdvancedPanelOpen(true);
      });

      return () => {
        window.cancelAnimationFrame(frameId);
      };
    }

    setAdvancedPanelOpen(false);

    if (!renderAdvancedPanel) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setRenderAdvancedPanel(false);
    }, ADVANCED_PANEL_ANIMATION_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [advancedOpen, renderAdvancedPanel]);

  useEffect(() => {
    if (!advancedOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!(event.target instanceof Node)) {
        return;
      }

      if (advancedPanelRef.current?.contains(event.target)) {
        return;
      }

      if (advancedButtonRef.current?.contains(event.target)) {
        return;
      }

      onCloseAdvanced();
    }

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [advancedOpen, onCloseAdvanced]);

  function handleAdvancedButtonClick() {
    if (advancedOpen) {
      onCloseAdvanced();
      return;
    }

    onOpenAdvanced();
  }

  return (
    <>
      <div className="options-card">
        <div className="format-grid" role="group" aria-label="Output formats">
          {FORMAT_CHOICES.map((choice) => {
            const selected = options.formats.includes(choice.value);

            return (
              <button
                key={choice.value}
                type="button"
                className={`format-chip ${selected ? "selected" : ""}`}
                aria-pressed={selected}
                onClick={() => onToggleFormat(choice.value)}
              >
                {choice.label}
              </button>
            );
          })}
        </div>

        <div className="option-row">
          <label>
            <span>Page range</span>
            <input
              value={options.pageRange}
              onChange={(event) =>
                onChangeOption((current) => ({
                  ...current,
                  pageRange: event.target.value,
                }))
              }
              placeholder="1,3,5-7"
            />
          </label>

          <label>
            <span>Markdown style</span>
            <select
              value={options.markdownStyle}
              onChange={(event) =>
                onChangeOption((current) => ({
                  ...current,
                  markdownStyle: event.target.value as MarkdownStyle,
                }))
              }
            >
              <option value="plain">Plain</option>
              <option value="html">With HTML tables</option>
              <option value="images">With images</option>
            </select>
          </label>
        </div>

        {pageRangeError ? <p className="inline-error">{pageRangeError}</p> : null}
        {submitError ? <p className="inline-error">{submitError}</p> : null}

        <div className="button-row">
          <button
            ref={advancedButtonRef}
            type="button"
            className="secondary-button"
            onClick={handleAdvancedButtonClick}
          >
            {advancedOpen ? "Hide advanced options" : "Show advanced options"}
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={onSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Creating job..." : "Create job"}
          </button>
        </div>
      </div>

      {renderAdvancedPanel ? (
        <AdvancedPanel
          isOpen={advancedPanelOpen}
          panelRef={advancedPanelRef}
          options={options}
          onChangeOption={onChangeOption}
          onChangeHybrid={onChangeHybrid}
          hybridControlsDisabled={hybridControlsDisabled}
          onClose={onCloseAdvanced}
        />
      ) : null}
    </>
  );
}

function AdvancedPanel({
  isOpen,
  panelRef,
  options,
  onChangeOption,
  onChangeHybrid,
  hybridControlsDisabled,
  onClose,
}: {
  isOpen: boolean;
  panelRef: RefObject<HTMLElement | null>;
  options: ComposeOptions;
  onChangeOption: Dispatch<SetStateAction<ComposeOptions>>;
  onChangeHybrid: (patch: Partial<HybridSettings>) => void;
  hybridControlsDisabled: boolean;
  onClose: () => void;
}) {
  return (
    <section
      ref={panelRef}
      className={`advanced-panel-shell ${isOpen ? "is-open" : "is-closing"}`}
    >
      <aside
        className="advanced-panel"
        role="dialog"
        aria-label="Advanced options"
        aria-hidden={!isOpen}
      >
        <div className="advanced-panel-header">
          <div>
            <p>Advanced</p>
            <h3>Secondary and hybrid controls</h3>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close drawer">
            Close
          </button>
        </div>

        <div className="advanced-panel-grid">
          <ToggleField
            label="Sanitize sensitive data"
            checked={options.sanitize}
            onChange={(checked) =>
              onChangeOption((current) => ({
                ...current,
                sanitize: checked,
              }))
            }
          />
          <ToggleField
            label="Keep line breaks"
            checked={options.keepLineBreaks}
            onChange={(checked) =>
              onChangeOption((current) => ({
                ...current,
                keepLineBreaks: checked,
              }))
            }
          />
          <ToggleField
            label="Include headers and footers"
            checked={options.includeHeaderFooter}
            onChange={(checked) =>
              onChangeOption((current) => ({
                ...current,
                includeHeaderFooter: checked,
              }))
            }
          />
          <ToggleField
            label="Use struct tree"
            checked={options.useStructTree}
            onChange={(checked) =>
              onChangeOption((current) => ({
                ...current,
                useStructTree: checked,
              }))
            }
          />

          <label>
            <span>Table method</span>
            <select
              value={options.tableMethod}
              onChange={(event) =>
                onChangeOption((current) => ({
                  ...current,
                  tableMethod: event.target.value as "default" | "cluster",
                }))
              }
            >
              <option value="default">Default</option>
              <option value="cluster">Cluster</option>
            </select>
          </label>

          <label>
            <span>Reading order</span>
            <select
              value={options.readingOrder}
              onChange={(event) =>
                onChangeOption((current) => ({
                  ...current,
                  readingOrder: event.target.value as "off" | "xycut",
                }))
              }
            >
              <option value="xycut">XY cut</option>
              <option value="off">Off</option>
            </select>
          </label>

          <label>
            <span>Image output</span>
            <select
              value={options.imageOutput}
              onChange={(event) =>
                onChangeOption((current) => ({
                  ...current,
                  imageOutput: event.target.value as "off" | "embedded" | "external",
                }))
              }
            >
              <option value="external">External</option>
              <option value="embedded">Embedded</option>
              <option value="off">Off</option>
            </select>
          </label>

          <label>
            <span>Image format</span>
            <select
              value={options.imageFormat}
              onChange={(event) =>
                onChangeOption((current) => ({
                  ...current,
                  imageFormat: event.target.value as "png" | "jpeg",
                }))
              }
            >
              <option value="png">PNG</option>
              <option value="jpeg">JPEG</option>
            </select>
          </label>
        </div>

        <section className="hybrid-section">
          <ToggleField
            label="Enable hybrid processing"
            checked={options.hybrid.enabled}
            onChange={(checked) => onChangeHybrid({ enabled: checked })}
          />

          <div className="hybrid-help">
            <p>Hybrid settings stay disabled until you turn them on.</p>
            <span>Local mode is still the default path.</span>
          </div>

          <fieldset disabled={hybridControlsDisabled} className="hybrid-grid">
            <label>
              <span>Engine</span>
              <select
                value={options.hybrid.engine}
                onChange={(event) =>
                  onChangeHybrid({ engine: event.target.value as "docling-fast" })
                }
              >
                <option value="docling-fast">Docling Fast</option>
              </select>
            </label>

            <label>
              <span>Mode</span>
              <select
                value={options.hybrid.mode}
                onChange={(event) =>
                  onChangeHybrid({ mode: event.target.value as "auto" | "full" })
                }
              >
                <option value="auto">Auto</option>
                <option value="full">Full</option>
              </select>
            </label>

            <label>
              <span>Hybrid URL</span>
              <input
                value={options.hybrid.url}
                onChange={(event) => onChangeHybrid({ url: event.target.value })}
                placeholder="http://localhost:8000"
              />
            </label>

            <label>
              <span>Timeout ms</span>
              <input
                inputMode="numeric"
                value={options.hybrid.timeoutMs}
                onChange={(event) => onChangeHybrid({ timeoutMs: event.target.value })}
              />
            </label>

            <ToggleField
              label="Allow Java fallback"
              checked={options.hybrid.fallback}
              onChange={(checked) => onChangeHybrid({ fallback: checked })}
            />
          </fieldset>
        </section>
      </aside>
    </section>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="toggle-field">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function ResultsCard({
  job,
  isSubmitting,
  sourceFile,
  boundingBoxJsonUrl,
  activeViewerTab,
  setActiveViewerTab,
  tabs,
  submitError,
  onReset,
}: {
  job: JobRecord | null;
  isSubmitting: boolean;
  sourceFile: File | null;
  boundingBoxJsonUrl: string | null;
  activeViewerTab: ViewerTab;
  setActiveViewerTab: (tab: ViewerTab) => void;
  tabs: ViewerTabDefinition[];
  submitError: string | null;
  onReset: () => void;
}) {
  const sourceName = job?.sourceName ?? sourceFile?.name ?? "Pending PDF";
  const status = job ? statusLabel(job.status) : isSubmitting ? "Starting" : "Idle";
  const message = job?.message ?? (isSubmitting ? "Preparing the job and opening the viewer." : "Select a file to begin.");
  const progress = job?.progress ?? (isSubmitting ? 5 : 0);

  return (
    <div className="results-card">
      <div className="status-card">
        <div>
          <p className="status-label">{status}</p>
          <h3>{sourceName}</h3>
          <p>{message}</p>
        </div>
        <button type="button" className="secondary-button" onClick={onReset}>
          Start over
        </button>
      </div>

      <div className="progress-block">
        <div className="progress-meta">
          <span>Progress</span>
          <strong>{Math.round(progress)}%</strong>
        </div>
        <div className="progress-track" aria-label="Conversion progress">
          <div className="progress-fill" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
      </div>

      {submitError ? <p className="inline-error">{submitError}</p> : null}

      <BoundingBoxPreview
        sourceFile={sourceFile}
        jsonUrl={boundingBoxJsonUrl}
        tabs={tabs}
        activeTab={activeViewerTab}
        onTabChange={setActiveViewerTab}
      />
    </div>
  );
}

function statusLabel(status: JobRecord["status"]): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "running":
      return "Running";
    case "complete":
      return "Complete";
    case "failed":
      return "Failed";
  }
}

function formatFileSize(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
