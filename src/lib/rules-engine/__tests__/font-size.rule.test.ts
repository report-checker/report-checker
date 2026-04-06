import { describe, expect, it } from "vitest";

import { defaultCheckerConfig } from "../../checker-config";
import { buildMinimumFontSizeRule } from "../text-set-basic-rules";
import type { EngineContext, ParsedTextRun } from "../types";

function makeContext(textRuns: ParsedTextRun[]): EngineContext {
  return {
    pageCount: 1,
    checkedPages: 1,
    parserEngineLabel: "pdfium",
    pages: [
      {
        pageNumber: 1,
        pageBox: {
          left: 0,
          bottom: 0,
          right: 595,
          top: 842,
        },
        marginBounds: null,
        textRuns,
      },
    ],
    config: structuredClone(defaultCheckerConfig),
  };
}

function run(text: string, fontSizePt: number): ParsedTextRun {
  return {
    text,
    fontSizePt,
    bounds: {
      left: 100,
      bottom: 100,
      right: 200,
      top: 120,
    },
  };
}

describe("buildMinimumFontSizeRule", () => {
  it("ignores symbol-only runs", () => {
    const result = buildMinimumFontSizeRule(
      makeContext([run("...", 6), run("§", 7), run("Текст", 12)]),
    );

    expect(result.status).toBe("pass");
    expect(result.children).toEqual([]);
    expect(result.overlayBoxes).toEqual([]);
  });

  it("checks numeric runs as content", () => {
    const result = buildMinimumFontSizeRule(
      makeContext([run("12345", 8), run("...", 6)]),
    );

    expect(result.status).toBe("fail");
    expect(result.children).toHaveLength(1);
    expect(result.children[0]?.id).toBe("font-size-page-1");
  });
});
