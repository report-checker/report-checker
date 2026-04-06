import { describe, expect, it } from "vitest";

import { defaultCheckerConfig } from "../../checker-config";
import { collectMainTextParagraphs } from "../paragraph-engine";
import { analyzePageLayout, segmentParagraphs } from "../text-set-core";
import {
  buildJustifiedAlignmentRule,
  buildLineSpacingRule,
  buildParagraphIndentRule,
} from "../text-set-layout-rules";
import type { EngineContext, EnginePage, ParsedTextRun } from "../types";

function lineRun(
  text: string,
  left: number,
  right: number,
  bottom: number,
  top: number,
  fontSizePt = 12,
): ParsedTextRun {
  return {
    text,
    bounds: { left, right, bottom, top },
    fontSizePt,
  };
}

function samplePage(): EnginePage {
  return {
    pageNumber: 1,
    pageBox: { left: 0, bottom: 0, right: 595, top: 842 },
    marginBounds: null,
    textRuns: [
      lineRun("L1", 100, 500, 700, 712),
      lineRun("L2", 100, 500, 680, 692),
      lineRun("L3", 136, 500, 660, 672),
      lineRun("L4", 100, 500, 640, 652),
    ],
  };
}

function mainTextPages(): EnginePage[] {
  return [
    {
      pageNumber: 1,
      pageBox: { left: 0, bottom: 0, right: 595, top: 842 },
      marginBounds: null,
      textRuns: [
        lineRun("ТИТУЛЬНЫЙ ЛИСТ", 180, 415, 760, 774, 14),
        lineRun("Абзац вне диапазона", 136, 500, 700, 712),
        lineRun("вторая строка", 100, 500, 682, 694),
        lineRun("третья строка", 100, 500, 664, 676),
      ],
    },
    {
      pageNumber: 2,
      pageBox: { left: 0, bottom: 0, right: 595, top: 842 },
      marginBounds: null,
      textRuns: [
        lineRun("ВВЕДЕНИЕ", 210, 385, 760, 774, 12),
        lineRun("Абзац введения", 136, 500, 700, 712),
        lineRun("вторая строка", 100, 500, 682, 694),
        lineRun("третья строка", 100, 500, 664, 676),
      ],
    },
    {
      pageNumber: 3,
      pageBox: { left: 0, bottom: 0, right: 595, top: 842 },
      marginBounds: null,
      textRuns: [
        lineRun("Короткий абзац", 136, 500, 740, 752),
        lineRun("вторая строка", 100, 500, 722, 734),
        lineRun("1. список", 136, 500, 680, 692),
        lineRun("продолжение", 100, 500, 662, 674),
        lineRun("третья строка", 100, 500, 644, 656),
        lineRun("Основной абзац", 136, 500, 590, 602),
        lineRun("вторая строка", 100, 500, 572, 584),
        lineRun("третья строка", 100, 500, 554, 566),
      ],
    },
    {
      pageNumber: 4,
      pageBox: { left: 0, bottom: 0, right: 595, top: 842 },
      marginBounds: null,
      textRuns: [
        lineRun("ЗАКЛЮЧЕНИЕ", 200, 395, 760, 774, 12),
        lineRun("Абзац заключения", 136, 500, 700, 712),
        lineRun("вторая строка", 100, 500, 682, 694),
        lineRun("третья строка", 100, 500, 664, 676),
      ],
    },
  ];
}

function mainTextPagesWithoutConclusionWithToc(): EnginePage[] {
  return [
    {
      pageNumber: 1,
      pageBox: { left: 0, bottom: 0, right: 595, top: 842 },
      marginBounds: null,
      textRuns: [lineRun("ТИТУЛЬНЫЙ ЛИСТ", 180, 415, 760, 774, 14)],
    },
    {
      pageNumber: 2,
      pageBox: { left: 0, bottom: 0, right: 595, top: 842 },
      marginBounds: null,
      textRuns: [
        lineRun("СОДЕРЖАНИЕ", 210, 385, 760, 774, 12),
        lineRun(
          "ВВЕДЕНИЕ ................................................. 3",
          85,
          520,
          720,
          732,
        ),
        lineRun(
          "1 Основная часть ........................................... 4",
          85,
          520,
          700,
          712,
        ),
        lineRun(
          "СПИСОК ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ ......................... 6",
          85,
          520,
          680,
          692,
        ),
        lineRun(
          "ПРИЛОЖЕНИЕ А .............................................. 7",
          85,
          520,
          660,
          672,
        ),
      ],
    },
    {
      pageNumber: 3,
      pageBox: { left: 0, bottom: 0, right: 595, top: 842 },
      marginBounds: null,
      textRuns: [
        lineRun("ВВЕДЕНИЕ", 210, 385, 760, 774, 12),
        lineRun("Абзац введения", 136, 500, 700, 712),
        lineRun("вторая строка", 100, 500, 682, 694),
        lineRun("третья строка", 100, 500, 664, 676),
      ],
    },
    {
      pageNumber: 4,
      pageBox: { left: 0, bottom: 0, right: 595, top: 842 },
      marginBounds: null,
      textRuns: [
        lineRun("1 Основная часть", 136, 430, 760, 774, 14),
        lineRun("Абзац основной части", 136, 500, 700, 712),
        lineRun("вторая строка", 100, 500, 682, 694),
        lineRun("третья строка", 100, 500, 664, 676),
      ],
    },
    {
      pageNumber: 5,
      pageBox: { left: 0, bottom: 0, right: 595, top: 842 },
      marginBounds: null,
      textRuns: [
        lineRun("Абзац перед списком", 136, 500, 700, 712),
        lineRun("вторая строка", 100, 500, 682, 694),
        lineRun("третья строка", 100, 500, 664, 676),
      ],
    },
    {
      pageNumber: 6,
      pageBox: { left: 0, bottom: 0, right: 595, top: 842 },
      marginBounds: null,
      textRuns: [
        lineRun("СПИСОК ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ", 120, 520, 760, 774, 12),
        lineRun("1. Иванов И.И.", 120, 380, 700, 712),
      ],
    },
    {
      pageNumber: 7,
      pageBox: { left: 0, bottom: 0, right: 595, top: 842 },
      marginBounds: null,
      textRuns: [
        lineRun("ПРИЛОЖЕНИЕ А", 210, 385, 760, 774, 12),
        lineRun("Абзац приложения", 136, 500, 700, 712),
        lineRun("вторая строка", 100, 500, 682, 694),
        lineRun("третья строка", 100, 500, 664, 676),
      ],
    },
  ];
}

function makeContext(pages: EnginePage[]): EngineContext {
  return {
    pageCount: pages.length,
    checkedPages: pages.length,
    pages,
    config: defaultCheckerConfig,
    parserEngineLabel: "test",
  };
}

describe("paragraph segmentation", () => {
  it("builds paragraph segments with stable bounds", () => {
    const layout = analyzePageLayout(
      samplePage(),
      defaultCheckerConfig.typography,
    );
    expect(layout).not.toBeNull();

    if (!layout) {
      return;
    }

    const paragraphs = segmentParagraphs(
      layout,
      defaultCheckerConfig.typography,
    );
    expect(paragraphs).toHaveLength(2);

    expect(paragraphs[0].bounds).toEqual({
      left: 100,
      right: 500,
      bottom: 680,
      top: 712,
    });
    expect(paragraphs[1].bounds).toEqual({
      left: 100,
      right: 500,
      bottom: 640,
      top: 672,
    });
  });

  it("avoids false paragraph breaks from small left drift and short lines", () => {
    const page: EnginePage = {
      pageNumber: 1,
      pageBox: { left: 0, bottom: 0, right: 595, top: 842 },
      marginBounds: null,
      textRuns: [
        lineRun("L1", 100, 500, 700, 712),
        lineRun("L2", 108, 500, 680, 692),
        lineRun("L3", 100, 470, 660, 672),
        lineRun("L4", 100, 500, 640, 652),
        lineRun("L5", 136, 500, 620, 632),
        lineRun("L6", 100, 500, 600, 612),
      ],
    };
    const layout = analyzePageLayout(page, defaultCheckerConfig.typography);
    expect(layout).not.toBeNull();

    if (!layout) {
      return;
    }

    const paragraphs = segmentParagraphs(
      layout,
      defaultCheckerConfig.typography,
    );

    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].lines).toHaveLength(4);
    expect(paragraphs[1].lines).toHaveLength(2);
  });

  it("filters centered heading-like lines out of body paragraph detection", () => {
    const page: EnginePage = {
      pageNumber: 1,
      pageBox: { left: 0, bottom: 0, right: 595, top: 842 },
      marginBounds: null,
      textRuns: [
        lineRun("ВВЕДЕНИЕ", 210, 385, 720, 734, 14),
        lineRun("L1", 136, 500, 680, 692),
        lineRun("L2", 100, 500, 660, 672),
      ],
    };
    const layout = analyzePageLayout(page, defaultCheckerConfig.typography);
    expect(layout).not.toBeNull();

    if (!layout) {
      return;
    }

    expect(layout.bodyLines).toHaveLength(2);
    const paragraphs = segmentParagraphs(
      layout,
      defaultCheckerConfig.typography,
    );
    expect(paragraphs).toHaveLength(1);
  });

  it("collects only letter-starting 3-line paragraphs inside ВВЕДЕНИЕ..ЗАКЛЮЧЕНИЕ", () => {
    const paragraphs = collectMainTextParagraphs(makeContext(mainTextPages()));

    expect(paragraphs).toHaveLength(3);
    expect(paragraphs.map((paragraph) => paragraph.pageNumber)).toEqual([
      2, 3, 4,
    ]);
    expect(paragraphs.every((paragraph) => paragraph.lines.length >= 3)).toBe(
      true,
    );
    expect(
      paragraphs.every((paragraph) =>
        /^[A-Za-zА-Яа-яЁё]/u.test(paragraph.startLine.text.trim()),
      ),
    ).toBe(true);
  });

  it("uses TOC main scope when ЗАКЛЮЧЕНИЕ heading is missing", () => {
    const paragraphs = collectMainTextParagraphs(
      makeContext(mainTextPagesWithoutConclusionWithToc()),
    );

    expect(paragraphs.length).toBeGreaterThan(0);
    const pageNumbers = [...new Set(paragraphs.map((p) => p.pageNumber))];
    expect(pageNumbers).toEqual([3, 4, 5]);
    expect(pageNumbers.includes(7)).toBe(false);
  });

  it("keeps legacy fallback strict when TOC and ЗАКЛЮЧЕНИЕ are both missing", () => {
    const pagesWithoutConclusion = mainTextPages().map((page) =>
      page.pageNumber === 4
        ? {
            ...page,
            textRuns: page.textRuns.filter(
              (run) => run.text.trim() !== "ЗАКЛЮЧЕНИЕ",
            ),
          }
        : page,
    );

    const paragraphs = collectMainTextParagraphs(
      makeContext(pagesWithoutConclusion),
    );
    expect(paragraphs).toHaveLength(0);
  });

  it("excludes paragraphs that are table-related or start below a table caption", () => {
    const pages: EnginePage[] = [
      {
        pageNumber: 1,
        pageBox: { left: 0, bottom: 0, right: 595, top: 842 },
        marginBounds: null,
        textRuns: [lineRun("ТИТУЛЬНЫЙ ЛИСТ", 180, 415, 760, 774, 14)],
      },
      {
        pageNumber: 2,
        pageBox: { left: 0, bottom: 0, right: 595, top: 842 },
        marginBounds: null,
        textRuns: [
          lineRun("ВВЕДЕНИЕ", 210, 385, 760, 774, 12),
          lineRun("Обычный абзац до таблицы", 136, 500, 720, 732, 12),
          lineRun("вторая строка абзаца", 100, 500, 702, 714, 12),
          lineRun("третья строка абзаца", 100, 500, 684, 696, 12),
          lineRun("Таблица 1 — Показатели", 85, 420, 640, 652, 12),
          lineRun("Столбец 1 Столбец 2", 90, 420, 622, 634, 12),
          lineRun("Значение 10", 90, 240, 604, 616, 12),
          lineRun("В таблице 1 приведены данные", 136, 500, 560, 572, 12),
          lineRun("вторая строка пояснения", 100, 500, 542, 554, 12),
          lineRun("третья строка пояснения", 100, 500, 524, 536, 12),
        ],
      },
      {
        pageNumber: 3,
        pageBox: { left: 0, bottom: 0, right: 595, top: 842 },
        marginBounds: null,
        textRuns: [lineRun("ЗАКЛЮЧЕНИЕ", 200, 395, 760, 774, 12)],
      },
    ];

    const paragraphs = collectMainTextParagraphs(makeContext(pages));

    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]?.pageNumber).toBe(2);
    expect(paragraphs[0]?.startLine.text).toContain("Обычный абзац до таблицы");
  });

  it("excludes glossary-like term-definition paragraphs", () => {
    const pages: EnginePage[] = [
      {
        pageNumber: 1,
        pageBox: { left: 0, bottom: 0, right: 595, top: 842 },
        marginBounds: null,
        textRuns: [lineRun("ТИТУЛЬНЫЙ ЛИСТ", 180, 415, 760, 774, 14)],
      },
      {
        pageNumber: 2,
        pageBox: { left: 0, bottom: 0, right: 595, top: 842 },
        marginBounds: null,
        textRuns: [
          lineRun("ВВЕДЕНИЕ", 210, 385, 760, 774, 12),
          lineRun("CV (Computer Vision) — компьютерное зрение", 85, 320, 730, 742),
          lineRun("Bounding box — ограничивающий прямоугольник", 85, 500, 712, 724),
          lineRun("Track ID — идентификатор объекта", 85, 350, 694, 706),
          lineRun("Обычный абзац основного текста", 136, 500, 640, 652),
          lineRun("вторая строка обычного абзаца", 100, 500, 622, 634),
          lineRun("третья строка обычного абзаца", 100, 500, 604, 616),
        ],
      },
      {
        pageNumber: 3,
        pageBox: { left: 0, bottom: 0, right: 595, top: 842 },
        marginBounds: null,
        textRuns: [lineRun("ЗАКЛЮЧЕНИЕ", 200, 395, 760, 774, 12)],
      },
    ];

    const paragraphs = collectMainTextParagraphs(makeContext(pages));

    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]?.startLine.text).toContain(
      "Обычный абзац основного текста",
    );
  });

  it("excludes paragraphs detached from the left text edge", () => {
    const pages: EnginePage[] = [
      {
        pageNumber: 1,
        pageBox: { left: 0, bottom: 0, right: 595, top: 842 },
        marginBounds: null,
        textRuns: [lineRun("ТИТУЛЬНЫЙ ЛИСТ", 180, 415, 760, 774, 14)],
      },
      {
        pageNumber: 2,
        pageBox: { left: 0, bottom: 0, right: 595, top: 842 },
        marginBounds: { left: 85, right: 550, bottom: 70, top: 760 },
        textRuns: [
          lineRun("ВВЕДЕНИЕ", 210, 385, 780, 794, 12),
          lineRun("Code block line one", 120, 350, 730, 742, 12),
          lineRun("code block line two", 120, 360, 712, 724, 12),
          lineRun("code block line three", 120, 365, 694, 706, 12),
          lineRun("Обычный абзац начинается здесь", 120, 530, 640, 652, 12),
          lineRun("вторая строка обычного абзаца", 85, 530, 622, 634, 12),
          lineRun("третья строка обычного абзаца", 85, 530, 604, 616, 12),
        ],
      },
      {
        pageNumber: 3,
        pageBox: { left: 0, bottom: 0, right: 595, top: 842 },
        marginBounds: null,
        textRuns: [lineRun("ЗАКЛЮЧЕНИЕ", 200, 395, 760, 774, 12)],
      },
    ];

    const paragraphs = collectMainTextParagraphs(makeContext(pages));

    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]?.startLine.text).toContain(
      "Обычный абзац начинается здесь",
    );
  });

  it("excludes section heading lines from paragraph bodies", () => {
    const pages: EnginePage[] = [
      {
        pageNumber: 1,
        pageBox: { left: 0, bottom: 0, right: 595, top: 842 },
        marginBounds: null,
        textRuns: [lineRun("ТИТУЛЬНЫЙ ЛИСТ", 180, 415, 760, 774, 14)],
      },
      {
        pageNumber: 2,
        pageBox: { left: 0, bottom: 0, right: 595, top: 842 },
        marginBounds: null,
        textRuns: [
          lineRun("СОДЕРЖАНИЕ", 220, 380, 760, 774, 12),
          lineRun("ВВЕДЕНИЕ .......................... 3", 85, 520, 720, 732, 12),
          lineRun(
            "3 2 Заполнение шаблона ВКР ........ 3",
            85,
            520,
            700,
            712,
            12,
          ),
          lineRun("ЗАКЛЮЧЕНИЕ ........................ 4", 85, 520, 680, 692, 12),
        ],
      },
      {
        pageNumber: 3,
        pageBox: { left: 0, bottom: 0, right: 595, top: 842 },
        marginBounds: { left: 85, right: 550, bottom: 70, top: 760 },
        textRuns: [
          lineRun("ВВЕДЕНИЕ", 210, 385, 780, 794, 12),
          lineRun("Первая строка абзаца до подзаголовка", 120, 530, 730, 742, 12),
          lineRun("вторая строка абзаца до подзаголовка", 85, 530, 712, 724, 12),
          lineRun("третья строка абзаца до подзаголовка", 85, 530, 694, 706, 12),
          lineRun("3.2 Заполнение шаблона ВКР", 85, 270, 676, 688, 12),
          lineRun("Первая строка абзаца после подзаголовка", 120, 530, 658, 670, 12),
          lineRun("вторая строка абзаца после подзаголовка", 85, 530, 640, 652, 12),
          lineRun("третья строка абзаца после подзаголовка", 85, 530, 622, 634, 12),
        ],
      },
      {
        pageNumber: 4,
        pageBox: { left: 0, bottom: 0, right: 595, top: 842 },
        marginBounds: null,
        textRuns: [lineRun("ЗАКЛЮЧЕНИЕ", 200, 395, 760, 774, 12)],
      },
    ];

    const paragraphs = collectMainTextParagraphs(makeContext(pages));
    const includesHeading = paragraphs.some((paragraph) =>
      paragraph.lines.some(
        (line) => line.text.trim() === "3.2 Заполнение шаблона ВКР",
      ),
    );

    expect(paragraphs.length).toBeGreaterThan(0);
    expect(includesHeading).toBe(false);
  });

  it("draws paragraph outlines in indent and justify checks", () => {
    const context = makeContext(mainTextPages());

    const indentRule = buildParagraphIndentRule(context);
    const justifyRule = buildJustifiedAlignmentRule(context);

    const indentParagraphOverlays = indentRule.overlayBoxes.filter(
      (box) => box.style.borderColor === "#0f766e" && box.style.dashed,
    );
    const justifyParagraphOverlays = justifyRule.overlayBoxes.filter(
      (box) => box.style.borderColor === "#0f766e" && box.style.dashed,
    );

    expect(indentParagraphOverlays).toHaveLength(3);
    expect(justifyParagraphOverlays).toHaveLength(3);

    expect(indentRule.status).toBe("pass");
    expect(justifyRule.status).toBe("pass");
  });

  it("checks line spacing only within detected paragraphs", () => {
    const context = makeContext(mainTextPages());
    const lineSpacingRule = buildLineSpacingRule(context);

    expect(lineSpacingRule.status).toBe("pass");
    expect(lineSpacingRule.message).toContain("Проверено 6 пар строк");
  });

  it("tolerates a near-threshold line-spacing outlier caused by glyph box jitter", () => {
    const pages: EnginePage[] = [
      {
        pageNumber: 1,
        pageBox: { left: 0, bottom: 0, right: 595, top: 842 },
        marginBounds: null,
        textRuns: [lineRun("ТИТУЛЬНЫЙ ЛИСТ", 180, 415, 760, 774, 14)],
      },
      {
        pageNumber: 2,
        pageBox: { left: 0, bottom: 0, right: 595, top: 842 },
        marginBounds: null,
        textRuns: [
          lineRun("ВВЕДЕНИЕ", 210, 385, 760, 774, 12),
          lineRun("Строка абзаца один", 136, 500, 700.0, 712.0, 12),
          lineRun("Строка абзаца два", 100, 500, 678.256, 690.256, 12),
          lineRun("Строка абзаца три", 100, 500, 657.64, 669.64, 12),
        ],
      },
      {
        pageNumber: 3,
        pageBox: { left: 0, bottom: 0, right: 595, top: 842 },
        marginBounds: null,
        textRuns: [lineRun("ЗАКЛЮЧЕНИЕ", 200, 395, 760, 774, 12)],
      },
    ];

    const context = makeContext(pages);
    const lineSpacingRule = buildLineSpacingRule(context);

    expect(lineSpacingRule.status).toBe("pass");
    expect(lineSpacingRule.children).toHaveLength(0);
  });
});
