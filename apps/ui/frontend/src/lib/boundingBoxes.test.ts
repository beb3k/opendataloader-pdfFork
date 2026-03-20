import { describe, expect, it } from "vitest";
import { parseOverlayDocument, projectBoundingBox } from "./boundingBoxes";

describe("boundingBoxes", () => {
  it("flattens nested text and table boxes by page", () => {
    const document = parseOverlayDocument(`{
      "number of pages": 2,
      "kids": [
        {
          "id": 1,
          "type": "heading",
          "page number": 1,
          "bounding box": [10, 20, 40, 50],
          "content": "Heading"
        },
        {
          "id": 2,
          "type": "table",
          "page number": 2,
          "bounding box": [50, 60, 150, 160],
          "kids": [
            {
              "id": 3,
              "type": "paragraph",
              "page number": 2,
              "bounding box": [55, 65, 145, 75],
              "content": "Nested cell text"
            }
          ]
        },
        {
          "id": 4,
          "type": "picture",
          "page number": 1,
          "bounding box": [0, 0, 5, 5]
        }
      ]
    }`);

    expect(document.pageCount).toBe(2);
    expect(document.counts.text).toBe(2);
    expect(document.counts.table).toBe(1);
    expect(document.boxesByPage.get(1)).toHaveLength(1);
    expect(document.boxesByPage.get(2)).toHaveLength(2);
    expect(document.boxesByPage.get(2)?.[0]?.category).toBe("table");
    expect(document.boxesByPage.get(2)?.[1]?.label).toContain("Nested cell text");
  });

  it("converts bottom-left pdf coordinates into top-left screen coordinates", () => {
    const projected = projectBoundingBox([10, 20, 40, 50], 200, 2);

    expect(projected).toEqual({
      left: 20,
      top: 100,
      width: 60,
      height: 60,
    });
  });
});
