import { describe, expect, it } from "vitest";

import {
  createCreateDocumentScript,
  createExportDocumentScript,
  createGenericUserScript,
  createInspectDocumentScript,
  createOpenDocumentScript,
  normalizeExportPath,
  suggestResultFileName
} from "../adapters/illustrator/bridge.js";

describe("Illustrator bridge helpers", () => {
  it("normalizes export paths for exportFile-based formats", () => {
    expect(normalizeExportPath("/tmp/output.png", "png24")).toBe("/tmp/output");
    expect(normalizeExportPath("/tmp/output.svg", "svg")).toBe("/tmp/output");
    expect(normalizeExportPath("/tmp/output.ai", "ai")).toBe("/tmp/output.ai");
  });

  it("suggests stable output file names", () => {
    expect(suggestResultFileName("/tmp/example.ai", "png24")).toBe("example.png");
    expect(suggestResultFileName(null, "pdf")).toBe("untitled.pdf");
  });

  it("keeps custom scripts intact", () => {
    const source = "return { ok: true };";
    expect(createGenericUserScript(source)).toBe(source);
  });

  it("generates operation scripts with expected helper calls", () => {
    expect(createOpenDocumentScript()).toContain("helpers.resolveDocument");
    expect(createInspectDocumentScript()).toContain("helpers.summarizeDocument");
    expect(createExportDocumentScript()).toContain("helpers.exportDocument");
    expect(createCreateDocumentScript()).toContain("helpers.createDocument");
  });
});
