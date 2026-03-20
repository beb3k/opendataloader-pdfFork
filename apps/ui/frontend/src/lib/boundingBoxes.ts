export type OverlayCategory = "text" | "table";

export interface DrawableBoundingBox {
  id: string;
  semanticType: string;
  pageNumber: number;
  bbox: [number, number, number, number];
  category: OverlayCategory;
  label: string;
}

export interface BoundingBoxDocument {
  pageCount: number;
  counts: Record<OverlayCategory, number>;
  boxesByPage: Map<number, DrawableBoundingBox[]>;
}

export function parseBoundingBoxDocument(raw: string): BoundingBoxDocument {
  return extractBoundingBoxDocument(JSON.parse(raw) as unknown);
}

export const parseOverlayDocument = parseBoundingBoxDocument;

export function extractBoundingBoxDocument(value: unknown): BoundingBoxDocument {
  const pageCount = readPageCount(value) ?? 1;
  const boxesByPage = new Map<number, DrawableBoundingBox[]>();
  const counts: Record<OverlayCategory, number> = {
    text: 0,
    table: 0,
  };

  walkNode(value, boxesByPage, counts, []);

  return {
    pageCount,
    counts,
    boxesByPage,
  };
}

export function projectBoundingBox(
  bbox: [number, number, number, number],
  renderedPageHeight: number,
  scale: number,
): { left: number; top: number; width: number; height: number } {
  const [left, bottom, right, top] = bbox;

  return {
    left: left * scale,
    top: renderedPageHeight - top * scale,
    width: Math.max((right - left) * scale, 1),
    height: Math.max((top - bottom) * scale, 1),
  };
}

function walkNode(
  value: unknown,
  boxesByPage: Map<number, DrawableBoundingBox[]>,
  counts: Record<OverlayCategory, number>,
  path: number[],
): void {
  if (!isRecord(value)) {
    return;
  }

  const drawable = toDrawableBoundingBox(value, path);
  if (drawable) {
    const pageBoxes = boxesByPage.get(drawable.pageNumber) ?? [];
    pageBoxes.push(drawable);
    boxesByPage.set(drawable.pageNumber, pageBoxes);
    counts[drawable.category] += 1;
  }

  const kids = value["kids"];
  if (!Array.isArray(kids)) {
    return;
  }

  kids.forEach((child, index) => {
    walkNode(child, boxesByPage, counts, [...path, index]);
  });
}

function toDrawableBoundingBox(value: Record<string, unknown>, path: number[]): DrawableBoundingBox | null {
  const pageNumber = readPageNumber(value["page number"]);
  const bbox = readBoundingBox(value["bounding box"]);
  const type = typeof value.type === "string" ? value.type : "element";
  const category = inferCategory(type, value);

  if (!pageNumber || !bbox || !category) {
    return null;
  }

  const label = buildLabel(type, value.content);

  return {
    id: `${pageNumber}:${path.join(".") || "root"}:${type}`,
    semanticType: type,
    pageNumber,
    bbox,
    category,
    label,
  };
}

function inferCategory(type: string, value: Record<string, unknown>): OverlayCategory | null {
  const normalized = type.trim().toLowerCase();

  if (normalized === "table") {
    return "table";
  }

  if (
    normalized === "heading" ||
    normalized === "paragraph" ||
    normalized === "list" ||
    normalized === "list item" ||
    normalized === "caption" ||
    normalized === "header" ||
    normalized === "footer"
  ) {
    return "text";
  }

  if (typeof value.content === "string" && value.content.trim() !== "") {
    return "text";
  }

  return null;
}

function buildLabel(type: string, content: unknown): string {
  if (typeof content !== "string") {
    return type;
  }

  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized === "") {
    return type;
  }

  if (normalized.length <= 120) {
    return `${type}: ${normalized}`;
  }

  return `${type}: ${normalized.slice(0, 117)}...`;
}

function readPageCount(value: unknown): number | null {
  if (!isRecord(value)) {
    return null;
  }

  return readPageNumber(value["number of pages"]);
}

function readPageNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return null;
  }

  return value;
}

function readBoundingBox(value: unknown): [number, number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 4) {
    return null;
  }

  const [left, bottom, right, top] = value;
  if (![left, bottom, right, top].every((item) => typeof item === "number" && Number.isFinite(item))) {
    return null;
  }

  if (right <= left || top <= bottom) {
    return null;
  }

  return [left, bottom, right, top];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
