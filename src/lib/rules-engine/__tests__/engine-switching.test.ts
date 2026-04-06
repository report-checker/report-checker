import { describe, expect, it } from "vitest";

import { defaultCheckerConfig } from "../../checker-config";
import { runRulesEngine } from "../engine";
import {
  marginGeometryEngineValues,
  type ParsedPdfResult,
  type RuleResult,
} from "../types";

function findRuleNodeById(nodes: RuleResult[], id: string): RuleResult | null {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }

    const nested = findRuleNodeById(node.children, id);
    if (nested) {
      return nested;
    }
  }

  return null;
}

function sampleParsedPdf(parserNote: string | null = null): ParsedPdfResult {
  return {
    pageCount: 3,
    pages: [
      {
        pageNumber: 1,
        pageBox: {
          left: 0,
          bottom: 0,
          right: 600,
          top: 800,
        },
        textRuns: [
          {
            text: "ТИТУЛЬНЫЙ ЛИСТ",
            bounds: {
              left: 180,
              bottom: 740,
              right: 420,
              top: 760,
            },
            fontSizePt: 14,
          },
        ],
      },
      {
        pageNumber: 2,
        pageBox: {
          left: 0,
          bottom: 0,
          right: 600,
          top: 800,
        },
        textRuns: [
          {
            text: "ВВЕДЕНИЕ",
            bounds: {
              left: 220,
              bottom: 740,
              right: 380,
              top: 760,
            },
            fontSizePt: 14,
          },
          {
            text: "Абзац введения",
            bounds: {
              left: 136,
              bottom: 680,
              right: 500,
              top: 692,
            },
            fontSizePt: 12,
          },
          {
            text: "вторая строка",
            bounds: {
              left: 100,
              bottom: 662,
              right: 500,
              top: 674,
            },
            fontSizePt: 12,
          },
          {
            text: "третья строка",
            bounds: {
              left: 100,
              bottom: 644,
              right: 500,
              top: 656,
            },
            fontSizePt: 12,
          },
        ],
      },
      {
        pageNumber: 3,
        pageBox: {
          left: 0,
          bottom: 0,
          right: 600,
          top: 800,
        },
        textRuns: [
          {
            text: "ЗАКЛЮЧЕНИЕ",
            bounds: {
              left: 210,
              bottom: 740,
              right: 390,
              top: 760,
            },
            fontSizePt: 14,
          },
          {
            text: "Абзац заключения",
            bounds: {
              left: 136,
              bottom: 680,
              right: 500,
              top: 692,
            },
            fontSizePt: 12,
          },
          {
            text: "вторая строка",
            bounds: {
              left: 100,
              bottom: 662,
              right: 500,
              top: 674,
            },
            fontSizePt: 12,
          },
          {
            text: "третья строка",
            bounds: {
              left: 100,
              bottom: 644,
              right: 500,
              top: 656,
            },
            fontSizePt: 12,
          },
        ],
      },
    ],
    marginBoundsByPage: [
      {
        left: 120,
        bottom: 120,
        right: 500,
        top: 760,
      },
      {
        left: 100,
        bottom: 100,
        right: 500,
        top: 760,
      },
      {
        left: 100,
        bottom: 100,
        right: 500,
        top: 760,
      },
    ],
    pdfiumTextBoxesByPage: [
      [
        {
          left: 180,
          bottom: 740,
          right: 420,
          top: 760,
        },
      ],
      [
        {
          left: 220,
          bottom: 740,
          right: 380,
          top: 760,
        },
        {
          left: 136,
          bottom: 680,
          right: 500,
          top: 692,
        },
      ],
      [
        {
          left: 210,
          bottom: 740,
          right: 390,
          top: 760,
        },
      ],
    ],
    parserEngineLabel: "PDFium",
    parserNote,
  };
}

describe("PDFium engine", () => {
  it("uses parser-provided geometry and debug overlays", async () => {
    const result = await runRulesEngine(
      {
        pdfBytes: new Uint8Array([1, 2, 3]),
        config: {
          ...defaultCheckerConfig,
          margins: {
            leftCm: 3,
            rightCm: 1,
            topCm: 2,
            bottomCm: 2,
            toleranceCm: 0.1,
          },
          rules: {
            ...defaultCheckerConfig.rules,
            "detected-text-bounds": {
              enabled: true,
              severity: "warning",
              countInSummary: false,
            },
            "detected-paragraph-bounds": {
              enabled: true,
              severity: "warning",
              countInSummary: false,
            },
          },
        },
        marginGeometryEngine: "pdfium",
      },
      {
        parsePdf: async () => sampleParsedPdf(),
      },
    );

    const root = result.rules[0];
    const leftRule = findRuleNodeById(result.rules, "margin-left");
    const detectedBoundsRule = findRuleNodeById(
      result.rules,
      "detected-text-bounds",
    );
    const detectedParagraphBoundsRule = findRuleNodeById(
      result.rules,
      "detected-paragraph-bounds",
    );

    expect(root.message).toContain("PDFium");
    expect(leftRule?.status).not.toBe("warn");
    expect(detectedBoundsRule?.overlayBoxes.length).toBeGreaterThan(0);
    expect(detectedParagraphBoundsRule?.overlayBoxes.length).toBeGreaterThan(0);
  });

  it("forwards parser notes and exposes only the pdfium engine", async () => {
    const result = await runRulesEngine(
      {
        pdfBytes: new Uint8Array([1, 2, 3]),
        config: defaultCheckerConfig,
        marginGeometryEngine: "pdfium",
      },
      {
        parsePdf: async () => sampleParsedPdf("PDFium note"),
      },
    );

    expect(result.note).toContain("PDFium note");
    expect(marginGeometryEngineValues).toEqual(["pdfium"]);
  });
});
