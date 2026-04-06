import { describe, expect, it } from "vitest";
import { buildDocumentStructureNode } from "../../document-structure";
import { allPages, findById, makeContext, PAGE_CENTER_X, page, run } from "./shared";

describe("table rules", () => {
  it("passes table checks for valid caption, continuation, numbering, references, and placement", () => {
    const pageWithTable = page(4, [
      run("1 Аналитическая часть", { y: 760, fontSizePt: 14, left: 121 }),
      run("См. таблицу 1 ниже.", { y: 700, fontSizePt: 12, left: 85 }),
      run("Таблица 1 — Итоговые показатели", {
        y: 640,
        fontSizePt: 12,
        left: 85,
      }),
      run("Скорость 10 мс", { y: 620, fontSizePt: 12, left: 85 }),
    ]);
    const pageWithContinuation = page(5, [
      run("2 Практическая часть", { y: 760, fontSizePt: 14, left: 121 }),
      run("Продолжение таблицы 1 — Итоговые показатели", {
        y: 744,
        fontSizePt: 12,
        left: 360,
        right: 590,
      }),
      run("Точность 99 %", { y: 724, fontSizePt: 12, left: 85 }),
    ]);

    const modified = allPages.map((p) =>
      p.pageNumber === 4
        ? pageWithTable
        : p.pageNumber === 5
          ? pageWithContinuation
          : p,
    );

    const node = buildDocumentStructureNode(makeContext(modified));
    expect(findById([node], "tables-caption-format")?.status).toBe("pass");
    expect(findById([node], "tables-numbering")?.status).toBe("pass");
    expect(findById([node], "tables-references")?.status).toBe("pass");
    expect(findById([node], "tables-placement-by-reference")?.status).toBe("pass");
  });

  it("detects captions with sign № but marks caption format as invalid", () => {
    const pageWithTable = page(4, [
      run("1 Аналитическая часть", { y: 760, fontSizePt: 14, left: 121 }),
      run("См. таблицу № 1 ниже.", { y: 700, fontSizePt: 12, left: 85 }),
      run("Таблица № 1 — Итоговые показатели", {
        y: 640,
        fontSizePt: 12,
        left: 85,
      }),
      run("Скорость 10 мс", { y: 620, fontSizePt: 12, left: 85 }),
    ]);
    const pageWithContinuation = page(5, [
      run("2 Практическая часть", { y: 760, fontSizePt: 14, left: 121 }),
      run("Продолжение таблицы № 1 — Итоговые показатели", {
        y: 744,
        fontSizePt: 12,
        left: 360,
        right: 590,
      }),
      run("Точность 99 %", { y: 724, fontSizePt: 12, left: 85 }),
    ]);

    const modified = allPages.map((p) =>
      p.pageNumber === 4
        ? pageWithTable
        : p.pageNumber === 5
          ? pageWithContinuation
          : p,
    );

    const node = buildDocumentStructureNode(makeContext(modified));
    const captionNode = findById([node], "tables-caption-format");
    expect(captionNode?.status).toBe("fail");
    expect(captionNode?.children[0]?.message).toContain(
      "Номер таблицы следует указывать без знака «№».",
    );
    expect(captionNode?.children[1]?.message).toContain(
      "Номер таблицы следует указывать без знака «№».",
    );
    expect(findById([node], "tables-numbering")?.status).toBe("pass");
    expect(findById([node], "tables-references")?.status).toBe("pass");
    expect(findById([node], "tables-placement-by-reference")?.status).toBe("pass");
  });

  it("fails table checks when formatting and references are violated", () => {
    const brokenTablePage = page(4, [
      run("1 Аналитическая часть", { y: 760, fontSizePt: 14, left: 121 }),
      run("Таблица 2 — Нарушение оформления", {
        y: 640,
        fontSizePt: 12,
        centerX: PAGE_CENTER_X,
      }),
      run("Значение 10", { y: 620, fontSizePt: 12, left: 85 }),
    ]);

    const modified = allPages.map((p) =>
      p.pageNumber === 4 ? brokenTablePage : p,
    );
    const node = buildDocumentStructureNode(makeContext(modified));

    expect(findById([node], "tables-caption-format")?.status).toBe("fail");
    expect(findById([node], "tables-numbering")?.status).toBe("fail");
    expect(findById([node], "tables-references")?.status).toBe("fail");
    expect(findById([node], "tables-placement-by-reference")?.status).toBe("fail");
  });
});
