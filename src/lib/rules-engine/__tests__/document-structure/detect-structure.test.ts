import { describe, expect, it } from "vitest";
import { detectStructure } from "../../document-structure";
import {
  allPages,
  defaultCheckerConfig,
  PAGE_CENTER_X,
  page,
  run,
} from "./shared";

describe("detectStructure", () => {
  it("detects TOC page", () => {
    const s = detectStructure(allPages, defaultCheckerConfig);
    expect(s.tocPageNumber).toBe(2);
  });

  it("parses TOC entries", () => {
    const s = detectStructure(allPages, defaultCheckerConfig);
    console.log("TOC entries:", JSON.stringify(s.tocEntries, null, 2));
    expect(s.tocEntries.length).toBeGreaterThan(0);
    const titles = s.tocEntries.map((e) => e.title);
    expect(titles.some((t) => t.toUpperCase().includes("ВВЕДЕНИЕ"))).toBe(true);
  });

  it("detects structural elements on body pages", () => {
    const s = detectStructure(allPages, defaultCheckerConfig);
    console.log(
      "Structural elements:",
      s.structuralElements.map((e) => ({
        name: e.name,
        page: e.pageNumber,
        issues: e.issues,
      })),
    );
    const names = s.structuralElements.map((e) => e.name);
    expect(names).toContain("ВВЕДЕНИЕ");
    expect(names).toContain("ЗАКЛЮЧЕНИЕ");
    expect(names).toContain("СПИСОК ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ");
  });

  it("detects section headings by font size", () => {
    const s = detectStructure(allPages, defaultCheckerConfig);
    console.log(
      "Section headings:",
      s.sectionHeadings.map((h) => ({
        number: h.number,
        title: h.title,
        font: h.fontSizePt,
        page: h.pageNumber,
        issues: h.issues,
      })),
    );
    expect(s.sectionHeadings.length).toBeGreaterThanOrEqual(2);
    const numbers = s.sectionHeadings.map((h) => h.number);
    expect(numbers).toContain("1");
    expect(numbers).toContain("2");
  });

  it("does not detect structural elements on TOC page", () => {
    const s = detectStructure(allPages, defaultCheckerConfig);
    // СОДЕРЖАНИЕ should NOT appear in structuralElements (it's the TOC page)
    const содержаниеInBody = s.structuralElements.find(
      (e) => e.name === "СОДЕРЖАНИЕ",
    );
    expect(содержаниеInBody).toBeUndefined();
  });

  it("section headings have no issues when formatted correctly", () => {
    const s = detectStructure(allPages, defaultCheckerConfig);
    const violations = s.sectionHeadings.filter((h) => h.issues.length > 0);
    console.log("Section heading violations:", violations);
    expect(violations).toHaveLength(0);
  });

  it("matches numbered body headings against unnumbered TOC titles", () => {
    const tocWithoutHeadingNumbers = page(2, [
      run("СОДЕРЖАНИЕ", { y: 760, fontSizePt: 12, centerX: PAGE_CENTER_X }),
      run("ВВЕДЕНИЕ ...................................................... 3", {
        y: 700,
        fontSizePt: 12,
        left: 85,
      }),
      run("Аналитическая часть ..................................... 4", {
        y: 680,
        fontSizePt: 12,
        left: 85,
      }),
      run("Практическая часть ..................................... 5", {
        y: 660,
        fontSizePt: 12,
        left: 85,
      }),
      run("ЗАКЛЮЧЕНИЕ ................................................. 6", {
        y: 640,
        fontSizePt: 12,
        left: 85,
      }),
    ]);
    const modified = allPages.map((p) =>
      p.pageNumber === 2 ? tocWithoutHeadingNumbers : p,
    );
    const s = detectStructure(modified, defaultCheckerConfig);

    expect(s.sectionHeadings).toHaveLength(2);
    expect(s.sectionHeadings.map((h) => h.number)).toEqual(["1", "2"]);
  });

  it("does not fall back to all numbered lines when TOC entries are unrelated", () => {
    const tocWithUnrelatedEntries = page(2, [
      run("СОДЕРЖАНИЕ", { y: 760, fontSizePt: 12, centerX: PAGE_CENTER_X }),
      run("ЭТАП 2 ЛЕКЦИИ ............................................. 4", {
        y: 700,
        fontSizePt: 12,
        left: 85,
      }),
      run("ЭТАП 3 ШАБЛОН ДЛЯ ВКР ................................ 5", {
        y: 680,
        fontSizePt: 12,
        left: 85,
      }),
    ]);
    const modified = allPages.map((p) =>
      p.pageNumber === 2 ? tocWithUnrelatedEntries : p,
    );
    const s = detectStructure(modified, defaultCheckerConfig);

    expect(s.tocEntries.length).toBeGreaterThan(0);
    expect(s.sectionHeadings).toHaveLength(0);
  });

  it("structural elements have no issues when centered correctly", () => {
    const s = detectStructure(allPages, defaultCheckerConfig);
    const withIssues = s.structuralElements.filter((e) => e.issues.length > 0);
    console.log("Structural element issues:", withIssues);
    expect(withIssues).toHaveLength(0);
  });
});
