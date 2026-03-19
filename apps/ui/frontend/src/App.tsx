import { useEffect, useMemo, useRef, useState } from "react";
import { createBrowserApi } from "./lib/api";
import { readSessionFlag, writeSessionFlag } from "./lib/session";
import type {
  ComposeOptions,
  HybridSettings,
  JobFile,
  JobRecord,
  MarkdownStyle,
  OutputFormat,
  PreviewKind,
  StorageLike,
  UiApi,
} from "./lib/types";
import { isPdfFile, validatePageRange } from "./lib/validators";
import type { Dispatch, RefObject, SetStateAction } from "react";

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
const ADVANCED_PANEL_ANIMATION_MS = 220;
const FORMAT_CHOICES: Array<{ value: OutputFormat; label: string }> = [
  { value: "markdown", label: "Markdown" },
  { value: "json", label: "JSON" },
  { value: "html", label: "HTML" },
  { value: "text", label: "Text" },
  { value: "pdf", label: "PDF" },
];

const PREVIEW_ORDER: PreviewKind[] = ["markdown", "json", "html", "text"];
const PREVIEW_LABELS: Record<PreviewKind, string> = {
  markdown: "Markdown",
  json: "JSON",
  html: "HTML",
  text: "Text",
};

interface AppProps {
  api?: UiApi;
  storage?: StorageLike;
  initialJob?: JobRecord;
}

interface PreviewEntry {
  kind: PreviewKind;
  file: JobFile;
}

export default function App({ api = createBrowserApi(), storage, initialJob }: AppProps) {
  const backingStorage = storage ?? window.sessionStorage;
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [job, setJob] = useState<JobRecord | null>(initialJob ?? null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(() =>
    readSessionFlag(backingStorage, STORAGE_KEY),
  );
  const [options, setOptions] = useState<ComposeOptions>(DEFAULT_OPTIONS);
  const [activePreview, setActivePreview] = useState<PreviewKind | null>(null);

  useEffect(() => {
    writeSessionFlag(backingStorage, STORAGE_KEY, advancedOpen);
  }, [advancedOpen, backingStorage]);

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
  const previewFiles = useMemo(() => buildPreviewEntries(job?.files ?? []), [job?.files]);

  useEffect(() => {
    if (!activePreview && previewFiles.length > 0) {
      setActivePreview(previewFiles[0].kind);
    }
  }, [activePreview, previewFiles]);

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

    try {
      const payload = buildSubmissionPayload(options);
      const nextJob = await api.createJob(selectedFile, payload);
      setJob(nextJob);
      setActivePreview(null);
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

  function openAdvanced() {
    setAdvancedOpen(true);
  }

  function closeAdvanced() {
    setAdvancedOpen(false);
  }

  return (
    <div className="shell">
      <div className="backdrop backdrop-a" />
      <div className="backdrop backdrop-b" />

      <header className="hero">
        <div>
          <p className="eyebrow">Local browser UI</p>
          <h1>Convert one PDF without leaving the browser.</h1>
          <p className="lede">
            Upload a single file, choose the outputs you want, and keep the advanced switches out
            of the way until you need them.
          </p>
        </div>
      </header>

      <main className="workspace">
        <section className="panel">
          <StepHeading number="1" title="Upload" summary="Drop in one PDF or browse for it." />
          <UploadCard
            file={selectedFile}
            onFile={handleFileChange}
            onDrop={handleFileChange}
            error={fileError}
          />

          <StepHeading
            number="2"
            title="Options"
            summary="Keep the common choices visible and the rest one click away."
          />
          <OptionsCard
            options={options}
            pageRangeError={pageRangeError}
            onToggleFormat={updateFormats}
            onChangeOption={setOptions}
            onOpenAdvanced={openAdvanced}
            onCloseAdvanced={closeAdvanced}
            advancedOpen={advancedOpen}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            onChangeHybrid={updateHybrid}
          />
        </section>

        <section className="panel results-panel">
          <StepHeading
            number="3"
            title="Results"
            summary="Watch status, preview text outputs, and download every file."
          />
          <ResultsCard
            api={api}
            job={job}
            activePreview={activePreview}
            setActivePreview={setActivePreview}
            previewFiles={previewFiles}
            submitError={submitError}
            onReset={() => {
              setJob(null);
              setSelectedFile(null);
              setFileError(null);
              setSubmitError(null);
            }}
          />
        </section>
      </main>
    </div>
  );
}

function buildSubmissionPayload(options: ComposeOptions): ComposeOptions {
  return {
    ...options,
    formats: [...options.formats],
    hybrid: { ...options.hybrid },
  };
}

function buildPreviewEntries(files: JobFile[]): PreviewEntry[] {
  const entries: PreviewEntry[] = [];

  for (const kind of PREVIEW_ORDER) {
    const file = files.find((item) => item.preview?.kind === kind);
    if (file) {
      entries.push({ kind, file });
    }
  }

  return entries;
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
}: {
  file: File | null;
  onFile: (file: File | null) => void;
  onDrop: (file: File | null) => void;
  error: string | null;
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
          type="file"
          accept="application/pdf"
          onChange={(event) => onFile(event.target.files?.[0] ?? null)}
        />
        <span>Browse files</span>
      </label>

      <div className="file-summary">
        <strong>{file ? file.name : "No file selected"}</strong>
        <span>{file ? formatFileSize(file.size) : "A PDF is required before you can submit."}</span>
      </div>

      {error ? <p className="inline-error">{error}</p> : null}
    </div>
  );
}

function OptionsCard({
  options,
  pageRangeError,
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
  api,
  job,
  activePreview,
  setActivePreview,
  previewFiles,
  submitError,
  onReset,
}: {
  api: UiApi;
  job: JobRecord | null;
  activePreview: PreviewKind | null;
  setActivePreview: (kind: PreviewKind | null) => void;
  previewFiles: PreviewEntry[];
  submitError: string | null;
  onReset: () => void;
}) {
  if (!job) {
    return (
      <div className="results-empty">
        <p>No job is running yet.</p>
        <span>Submit a PDF and this panel will show status, previews, and downloads.</span>
        {submitError ? <p className="inline-error">{submitError}</p> : null}
      </div>
    );
  }

  const currentPreview = previewFiles.find((entry) => entry.kind === activePreview) ?? previewFiles[0];

  return (
    <div className="results-card">
      <div className="status-card">
        <div>
          <p className="status-label">{statusLabel(job.status)}</p>
          <h3>{job.sourceName}</h3>
          <p>{job.message}</p>
        </div>
        <button type="button" className="secondary-button" onClick={onReset}>
          Start over
        </button>
      </div>

      <div className="progress-block">
        <div className="progress-meta">
          <span>Progress</span>
          <strong>{Math.round(job.progress)}%</strong>
        </div>
        <div className="progress-track" aria-label="Conversion progress">
          <div className="progress-fill" style={{ width: `${Math.max(0, Math.min(100, job.progress))}%` }} />
        </div>
      </div>

      {submitError ? <p className="inline-error">{submitError}</p> : null}

      <section className="preview-section">
        <div className="section-title">
          <h4>Preview</h4>
          <span>Markdown, JSON, HTML, and text outputs appear here when available.</span>
        </div>

        {previewFiles.length > 0 ? (
          <>
            <div className="preview-tabs" role="tablist" aria-label="Preview tabs">
              {previewFiles.map((entry) => (
                <button
                  key={entry.kind}
                  type="button"
                  role="tab"
                  aria-selected={entry.kind === currentPreview?.kind}
                  className={`preview-tab ${entry.kind === currentPreview?.kind ? "selected" : ""}`}
                  onClick={() => setActivePreview(entry.kind)}
                >
                  {PREVIEW_LABELS[entry.kind]}
                </button>
              ))}
            </div>

            {currentPreview ? (
              <PreviewPane file={currentPreview.file} api={api} jobId={job.id} />
            ) : null}
          </>
        ) : (
          <div className="preview-empty">
            <p>No previewable outputs were returned yet.</p>
          </div>
        )}
      </section>

      <section className="download-section">
        <div className="section-title">
          <h4>Downloads</h4>
          <span>Every output gets its own link, plus one bundle for all of them.</span>
        </div>

        <div className="download-grid">
          {job.files.map((file) => (
            <a key={file.name} className="download-card" href={api.downloadFileUrl(job.id, file.name)}>
              <strong>{file.name}</strong>
              <span>{downloadLabel(file)}</span>
            </a>
          ))}
        </div>

        <a className="bundle-link" href={api.downloadBundleUrl(job.id)}>
          Download all outputs
        </a>
      </section>
    </div>
  );
}

function PreviewPane({ file, api, jobId }: { file: JobFile; api: UiApi; jobId: string }) {
  const preview = file.preview;

  if (!preview) {
    return (
      <div className="preview-empty">
        <p>This file only has a download link.</p>
      </div>
    );
  }

  if (preview.kind === "html") {
    return (
      <iframe
        title={file.name}
        className="preview-frame"
        srcDoc={preview.content}
        sandbox=""
      />
    );
  }

  return (
    <div className="preview-window">
      <div className="preview-toolbar">
        <span>{file.name}</span>
        <a href={api.downloadFileUrl(jobId, file.name)}>Download</a>
      </div>
      <pre>{formatPreview(preview.kind, preview.content)}</pre>
    </div>
  );
}

function downloadLabel(file: JobFile): string {
  if (file.preview) {
    return `${PREVIEW_LABELS[file.preview.kind]} preview`;
  }

  if (file.kind === "pdf") {
    return "PDF output";
  }

  if (file.kind === "image") {
    return "Image output";
  }

  return "Download only";
}

function formatPreview(kind: PreviewKind, content: string): string {
  if (kind !== "json") {
    return content;
  }

  try {
    return JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    return content;
  }
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
