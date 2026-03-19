const PAGE_SEGMENT = /^\d+(-\d+)?$/;

export function isPdfFile(file: File | null): boolean {
  if (!file) {
    return false;
  }

  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export function validatePageRange(value: string): string | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const segments = trimmed.split(",").map((part) => part.trim()).filter(Boolean);
  if (segments.length === 0 || segments.some((segment) => !PAGE_SEGMENT.test(segment))) {
    return "Use pages like 1,3,5-7.";
  }

  return null;
}
