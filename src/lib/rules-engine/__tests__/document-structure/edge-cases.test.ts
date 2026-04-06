import { describe, expect, it } from "vitest";
import {
  buildDocumentStructureNode,
  detectStructure,
} from "../../document-structure";
import type { EnginePage } from "../../types";
import {
  allPages,
  defaultCheckerConfig,
  findById,
  makeContext,
  PAGE_CENTER_X,
  page,
  run,
  SECTION_HEADING_LEFT_X,
} from "./shared";

describe("edge cases", () => {
  it("handles empty pages gracefully", () => {
    const emptyPages: EnginePage[] = [page(1, []), page(2, [])];
    const node = buildDocumentStructureNode(makeContext(emptyPages));
    expect(node.status).toBe("fail");
  });

  it("handles multi-run СОДЕРЖАНИЕ (text split across runs)", () => {
    // "СОДЕРЖАНИЕ" split into "СОДЕР" + "ЖАНИЕ" on same line
    const tocPageSplit = page(2, [
      {
        text: "СОДЕР",
        bounds: {
          left: PAGE_CENTER_X - 36,
          bottom: 760,
          right: PAGE_CENTER_X - 6,
          top: 772,
        },
        fontSizePt: 12,
      },
      {
        text: "ЖАНИЕ",
        bounds: {
          left: PAGE_CENTER_X - 4,
          bottom: 760,
          right: PAGE_CENTER_X + 30,
          top: 772,
        },
        fontSizePt: 12,
      },
      run("ВВЕДЕНИЕ ...................................................... 3", {
        y: 700,
        fontSizePt: 12,
        left: 85,
      }),
    ]);
    const modified = allPages.map((p) =>
      p.pageNumber === 2 ? tocPageSplit : p,
    );
    const s = detectStructure(modified, defaultCheckerConfig);
    console.log("Split СОДЕРЖАНИЕ tocPageNumber:", s.tocPageNumber);
    expect(s.tocPageNumber).toBe(2);
  });

  it("detects structural element split across two text lines", () => {
    // "СПИСОК ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ" wraps across two lines in the PDF
    const splitListPage = page(7, [
      run("СПИСОК ИСПОЛЬЗОВАННЫХ", {
        y: 770,
        fontSizePt: 12,
        centerX: PAGE_CENTER_X,
      }),
      run("ИСТОЧНИКОВ", { y: 754, fontSizePt: 12, centerX: PAGE_CENTER_X }),
      run("1. Иванов И.И. Программирование на TypeScript. М.: Наука, 2023.", {
        y: 700,
        fontSizePt: 12,
        left: 85,
      }),
    ]);
    const modified = allPages.map((p) =>
      p.pageNumber === 7 ? splitListPage : p,
    );
    const node = buildDocumentStructureNode(makeContext(modified));
    const spisok = node.children
      .flatMap((c) => c.children)
      .find((c) => c.id === "struct-elem-spisok-istochnikov");
    expect(spisok?.status).not.toBe("fail");
  });

  it("handles TOC entries with Russian dots separator", () => {
    const s = detectStructure(allPages, defaultCheckerConfig);
    const entry = s.tocEntries.find((e) =>
      e.title.toUpperCase().includes("АНАЛИТИЧЕСКАЯ"),
    );
    console.log("Found TOC entry for Аналитическая:", entry);
    expect(entry).toBeDefined();
    expect(entry?.pageRef).toBe(4);
  });

  it("ignores embedded punctuation fragments from PDFium in section heading lines", () => {
    const tocWithPdfiumLikeNumbering = page(2, [
      run("СОДЕРЖАНИЕ", { y: 760, fontSizePt: 12, centerX: PAGE_CENTER_X }),
      run("Шаблон для ВКР ..................................... 4", {
        y: 680,
        fontSizePt: 12,
        left: 85,
      }),
    ]);
    const headingWithEmbeddedDot = page(4, [
      {
        text: "1 2 Шаблон для ВКР",
        bounds: {
          left: SECTION_HEADING_LEFT_X,
          bottom: 760,
          right: SECTION_HEADING_LEFT_X + 220,
          top: 774,
        },
        fontSizePt: 14,
      },
      {
        text: ".",
        bounds: {
          left: SECTION_HEADING_LEFT_X + 8,
          bottom: 758,
          right: SECTION_HEADING_LEFT_X + 10,
          top: 772,
        },
        fontSizePt: 14,
      },
      run("Текст раздела.", { y: 710, fontSizePt: 12, left: 85 }),
    ]);
    const modified = allPages.map((p) =>
      p.pageNumber === 2
        ? tocWithPdfiumLikeNumbering
        : p.pageNumber === 4
          ? headingWithEmbeddedDot
          : p,
    );
    const s = detectStructure(modified, defaultCheckerConfig);
    const heading = s.sectionHeadings.find((h) => h.pageNumber === 4);

    expect(heading).toBeDefined();
    expect(heading?.rawText.endsWith(".")).toBe(false);
    expect(
      heading?.issues.some((issue) => issue.includes("заканчивается точкой")),
    ).toBe(false);
  });

  it("parses PDFium-style TOC lines with split dot leaders and spaced page refs", () => {
    const tocPagePdfiumLike = page(2, [
      run("СОДЕРЖАНИЕ", { y: 760, fontSizePt: 12, centerX: PAGE_CENTER_X }),
      run("Введение 2", { y: 720, fontSizePt: 12, left: 85 }),
      run(". . . . . . . . . . . . . . . . . . . . .", {
        y: 712,
        fontSizePt: 12,
        left: 130,
      }),
      run("1 2 Тестирование системы и сравнение различных методов", {
        y: 680,
        fontSizePt: 12,
        left: 85,
      }),
      run("конвертации 5", { y: 660, fontSizePt: 12, left: 85 }),
      run("Заключение 1 2", { y: 640, fontSizePt: 12, left: 85 }),
      run("1", { y: 38, fontSizePt: 12, centerX: PAGE_CENTER_X }),
    ]);
    const modified = allPages.map((p) =>
      p.pageNumber === 2 ? tocPagePdfiumLike : p,
    );
    const s = detectStructure(modified, defaultCheckerConfig);

    const intro = s.tocEntries.find(
      (e) => e.title.toUpperCase() === "ВВЕДЕНИЕ",
    );
    const wrapped = s.tocEntries.find((e) =>
      e.title
        .toUpperCase()
        .includes(
          "ТЕСТИРОВАНИЕ СИСТЕМЫ И СРАВНЕНИЕ РАЗЛИЧНЫХ МЕТОДОВ КОНВЕРТАЦИИ",
        ),
    );
    const conclusion = s.tocEntries.find((e) =>
      e.title.toUpperCase().includes("ЗАКЛЮЧЕНИЕ"),
    );

    expect(intro?.pageRef).toBe(2);
    expect(wrapped?.pageRef).toBe(5);
    expect(conclusion?.pageRef).toBe(12);
  });

  it("parses TOC entries from continuation pages and excludes them from body heading scan", () => {
    const tocPageStart = page(2, [
      run("СОДЕРЖАНИЕ", { y: 760, fontSizePt: 12, centerX: PAGE_CENTER_X }),
      run("ВВЕДЕНИЕ ...................................................... 3", {
        y: 700,
        fontSizePt: 12,
        left: 85,
      }),
      run("1. Аналитическая часть ..................................... 4", {
        y: 680,
        fontSizePt: 12,
        left: 85,
      }),
    ]);
    const tocPageContinuation = page(3, [
      run("2. Практическая часть ..................................... 5", {
        y: 760,
        fontSizePt: 12,
        left: 85,
      }),
      run("ЗАКЛЮЧЕНИЕ ................................................. 6", {
        y: 740,
        fontSizePt: 12,
        left: 85,
      }),
      run("СПИСОК ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ ............... 7", {
        y: 720,
        fontSizePt: 12,
        left: 85,
      }),
      run("3", { y: 50, fontSizePt: 12, centerX: PAGE_CENTER_X }),
    ]);

    const modified = allPages.map((p) =>
      p.pageNumber === 2
        ? tocPageStart
        : p.pageNumber === 3
          ? tocPageContinuation
          : p,
    );
    const s = detectStructure(modified, defaultCheckerConfig);

    expect(s.tocPageNumbers).toEqual([2, 3]);
    const titles = s.tocEntries.map((e) => e.title.toUpperCase());
    expect(titles.some((title) => title.includes("ПРАКТИЧЕСКАЯ"))).toBe(true);
    expect(titles.some((title) => title.includes("ЗАКЛЮЧЕНИЕ"))).toBe(true);
    expect(titles.some((title) => title.includes("СПИСОК"))).toBe(true);
    expect(s.sectionHeadings.map((h) => h.number)).toEqual(["1", "2"]);
  });

  it("splits merged TOC lines into separate entries", () => {
    const tocPageWithMergedLine = page(2, [
      run("СОДЕРЖАНИЕ", { y: 760, fontSizePt: 12, centerX: PAGE_CENTER_X }),
      run(
        "4 Функции 1 3. . . . . . . . 5 Структура 1 3. . . . . . . . 6 Пользовательский интерфейс 1 4. . . . . . . .",
        {
          y: 700,
          fontSizePt: 12,
          left: 85,
        },
      ),
    ]);
    const modified = allPages.map((p) =>
      p.pageNumber === 2 ? tocPageWithMergedLine : p,
    );
    const s = detectStructure(modified, defaultCheckerConfig);

    const funkcii = s.tocEntries.find((e) => e.title.includes("Функции"));
    const struktura = s.tocEntries.find((e) => e.title.includes("Структура"));
    const ui = s.tocEntries.find((e) =>
      e.title.includes("Пользовательский интерфейс"),
    );

    expect(funkcii?.pageRef).toBe(13);
    expect(struktura?.pageRef).toBe(13);
    expect(ui?.pageRef).toBe(14);
  });

  it("excludes appendix TOC scope from section headings and toc-body-match", () => {
    const tocWithAppendixScope = page(2, [
      run("СОДЕРЖАНИЕ", { y: 760, fontSizePt: 12, centerX: PAGE_CENTER_X }),
      run("ВВЕДЕНИЕ ...................................................... 3", {
        y: 700,
        fontSizePt: 12,
        left: 85,
      }),
      run("1. Аналитическая часть ..................................... 4", {
        y: 680,
        fontSizePt: 12,
        left: 85,
      }),
      run("2. Практическая часть ..................................... 5", {
        y: 660,
        fontSizePt: 12,
        left: 85,
      }),
      run("ПРИЛОЖЕНИЕ А .............................................. 6", {
        y: 640,
        fontSizePt: 12,
        left: 85,
      }),
      run("2. Назначение ............................................. 6", {
        y: 620,
        fontSizePt: 12,
        left: 85,
      }),
    ]);
    const appendixLikePage = page(6, [
      run("2 Назначение", {
        y: 760,
        fontSizePt: 14,
        left: SECTION_HEADING_LEFT_X,
      }),
      run("Текст приложения.", { y: 710, fontSizePt: 12, left: 85 }),
    ]);
    const modified = allPages.map((p) =>
      p.pageNumber === 2
        ? tocWithAppendixScope
        : p.pageNumber === 6
          ? appendixLikePage
          : p,
    );
    const s = detectStructure(modified, defaultCheckerConfig);
    expect(s.sectionHeadings.map((h) => h.pageNumber)).toEqual([4, 5]);

    const node = buildDocumentStructureNode(makeContext(modified));
    const tocBodyMatch = findById([node], "toc-body-match");
    expect(tocBodyMatch).not.toBeNull();
    expect(
      tocBodyMatch?.children.some((child) =>
        child.title.includes("ПРИЛОЖЕНИЕ"),
      ),
    ).toBe(false);
    expect(
      tocBodyMatch?.children.some((child) =>
        child.title.includes("Назначение"),
      ),
    ).toBe(false);
  });
});
