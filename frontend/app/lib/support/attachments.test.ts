import { describe, expect, it } from "vitest";
import { checkFiles, formatSize, MAX_FILE_BYTES, MAX_FILES, namePasted, safePreviewUrl } from "./attachments";

/** Розмір підставляємо, а не виділяємо: файл на 10 МБ у памʼяті робив тест повільним і нестабільним. */
const file = (name: string, type: string, size = 1000) => {
  const value = new File(["x"], name, { type });
  Object.defineProperty(value, "size", { value: size });
  return value;
};

describe("checkFiles", () => {
  it("accepts screenshots, PDFs and text", () => {
    const result = checkFiles([file("a.png", "image/png"), file("b.pdf", "application/pdf"), file("c.txt", "text/plain")], 0);
    expect(result.accepted).toHaveLength(3);
    expect(result.rejected).toEqual([]);
  });

  it("rejects unknown types and oversized files with a reason", () => {
    const result = checkFiles([file("x.exe", "application/x-msdownload"), file("big.png", "image/png", MAX_FILE_BYTES + 1)], 0);
    expect(result.accepted).toEqual([]);
    expect(result.rejected).toHaveLength(2);
    expect(result.rejected[0]).toContain("x.exe");
  });

  it("stops at the file limit, counting files already selected", () => {
    const many = Array.from({ length: 4 }, (_, i) => file(`${i}.png`, "image/png"));
    const result = checkFiles(many, MAX_FILES - 2);
    expect(result.accepted).toHaveLength(2);
    expect(result.rejected).toEqual([`Можна додати щонайбільше ${MAX_FILES} файлів.`]);
  });
});

describe("safePreviewUrl", () => {
  it.each([
    ["/api/support/attachments/1", "/api/support/attachments/1"],
    ["blob:http://localhost/abc", "blob:http://localhost/abc"],
    ["https://evil.com/x.png", undefined],
    ["//evil.com/x.png", undefined],
    ["javascript:alert(1)", undefined],
  ])("%s", (url, expected) => {
    expect(safePreviewUrl({ url })).toBe(expected);
  });
});

describe("formatSize", () => {
  it("speaks Ukrainian units", () => {
    expect(formatSize(500)).toBe("500 Б");
    expect(formatSize(2048)).toBe("2 КБ");
    expect(formatSize(1.5 * 1024 * 1024)).toBe("1,5 МБ");
  });
});

describe("namePasted", () => {
  it("names a pasted screenshot", () => {
    expect(namePasted(file("image.png", "image/png"), 0).name).toBe("Скріншот 1.png");
    expect(namePasted(file("bug.png", "image/png"), 0).name).toBe("bug.png");
  });
});
