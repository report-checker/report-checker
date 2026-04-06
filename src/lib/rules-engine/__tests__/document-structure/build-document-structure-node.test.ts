import { describe, expect, it } from "vitest";
import { buildDocumentStructureNode } from "../../document-structure";
import {
  allPages,
  BODY_LEFT_X,
  findById,
  makeContext,
  PAGE_CENTER_X,
  page,
  run,
  SECTION_HEADING_LEFT_X,
} from "./shared";

describe("buildDocumentStructureNode", () => {
  it("returns pass status for a well-formed report", () => {
    const node = buildDocumentStructureNode(makeContext(allPages));
    console.log("\nbuildDocumentStructureNode result:");
    console.log("  status:", node.status);
    for (const child of node.children) {
      console.log(`  ${child.id}: ${child.status} — ${child.message}`);
      for (const grandchild of child.children) {
        console.log(
          `    ${grandchild.id}: ${grandchild.status} — ${grandchild.message}`,
        );
      }
    }
    expect(node.status).toBe("pass");
  });

  it("title-page passes with regex-based practice matching", () => {
    const node = buildDocumentStructureNode(makeContext(allPages));
    const titlePageNode = findById([node], "title-page");
    expect(titlePageNode?.status).toBe("pass");
    expect(findById([node], "title-page-education-program")?.status).toBe(
      "pass",
    );
    expect(findById([node], "title-page-practice-name")?.status).toBe("pass");
    expect(findById([node], "title-page-year")?.status).toBe("pass");
  });

  it("title-page practice-name passes for inflected NIR wording", () => {
    const titleWithInflectedPractice = page(1, [
      run("Образовательная программа: 09.04.04 Программная инженерия", {
        y: 620,
        fontSizePt: 12,
        left: 85,
      }),
      run("о Научно-исследовательской работе", {
        y: 470,
        fontSizePt: 12,
        centerX: PAGE_CENTER_X,
      }),
      run("Обучающийся: Константинов А.А., P4244", {
        y: 300,
        fontSizePt: 12,
        left: 85,
      }),
      run("2026", { y: 64, fontSizePt: 12, centerX: PAGE_CENTER_X }),
    ]);
    const modified = allPages.map((p) =>
      p.pageNumber === 1 ? titleWithInflectedPractice : p,
    );
    const node = buildDocumentStructureNode(makeContext(modified));
    expect(findById([node], "title-page-practice-name")?.status).toBe("pass");
  });

  it("title-page practice-name passes for inflected educational practice wording", () => {
    const titleWithInflectedPractice = page(1, [
      run("Образовательная программа: 09.04.04 Программная инженерия", {
        y: 620,
        fontSizePt: 12,
        left: 85,
      }),
      run("об учебной, ознакомительной практике", {
        y: 470,
        fontSizePt: 12,
        centerX: PAGE_CENTER_X,
      }),
      run("Обучающийся: Константинов А.А., P4244", {
        y: 300,
        fontSizePt: 12,
        left: 85,
      }),
      run("2026", { y: 64, fontSizePt: 12, centerX: PAGE_CENTER_X }),
    ]);
    const modified = allPages.map((p) =>
      p.pageNumber === 1 ? titleWithInflectedPractice : p,
    );
    const node = buildDocumentStructureNode(makeContext(modified));
    expect(findById([node], "title-page-practice-name")?.status).toBe("pass");
  });

  it("title-page-year fails when allowed year appears only inside a date", () => {
    const titleWithDateOnly = page(1, [
      run("Образовательная программа: 09.04.04 Программная инженерия", {
        y: 620,
        fontSizePt: 12,
        left: 85,
      }),
      run("Научно-исследовательская работа", {
        y: 470,
        fontSizePt: 12,
        centerX: PAGE_CENTER_X,
      }),
      run("Обучающийся: Константинов А.А., P4244", {
        y: 300,
        fontSizePt: 12,
        left: 85,
      }),
      run("Дата 10.02.2026", { y: 84, fontSizePt: 12, left: 440 }),
      run("Санкт-Петербург", { y: 64, fontSizePt: 12, centerX: PAGE_CENTER_X }),
    ]);
    const modified = allPages.map((p) =>
      p.pageNumber === 1 ? titleWithDateOnly : p,
    );
    const node = buildDocumentStructureNode(makeContext(modified));
    expect(findById([node], "title-page-year")?.status).toBe("fail");
  });

  it("title-page-year passes for labeled year field (Год: 2026)", () => {
    const titleWithLabeledYear = page(1, [
      run("Образовательная программа: 09.04.04 Программная инженерия", {
        y: 620,
        fontSizePt: 12,
        left: 85,
      }),
      run("Научно-исследовательская работа", {
        y: 470,
        fontSizePt: 12,
        centerX: PAGE_CENTER_X,
      }),
      run("Обучающийся: Константинов А.А., P4244", {
        y: 300,
        fontSizePt: 12,
        left: 85,
      }),
      run("Год: 2026", { y: 64, fontSizePt: 12, centerX: PAGE_CENTER_X }),
    ]);
    const modified = allPages.map((p) =>
      p.pageNumber === 1 ? titleWithLabeledYear : p,
    );
    const node = buildDocumentStructureNode(makeContext(modified));
    expect(findById([node], "title-page-year")?.status).toBe("pass");
  });

  it("title-page-year fails for month-year date wording", () => {
    const titleWithMonthYearDate = page(1, [
      run("Образовательная программа: 09.04.04 Программная инженерия", {
        y: 620,
        fontSizePt: 12,
        left: 85,
      }),
      run("Научно-исследовательская работа", {
        y: 470,
        fontSizePt: 12,
        centerX: PAGE_CENTER_X,
      }),
      run("Обучающийся: Константинов А.А., P4244", {
        y: 300,
        fontSizePt: 12,
        left: 85,
      }),
      run("Дата: январь 2026 г.", { y: 64, fontSizePt: 12, left: 380 }),
    ]);
    const modified = allPages.map((p) =>
      p.pageNumber === 1 ? titleWithMonthYearDate : p,
    );
    const node = buildDocumentStructureNode(makeContext(modified));
    expect(findById([node], "title-page-year")?.status).toBe("fail");
  });

  it("stops other title-page checks when group is not found", () => {
    const titleWithoutGroup = page(1, [
      run("Образовательная программа: 09.04.04 Программная инженерия", {
        y: 620,
        fontSizePt: 12,
        left: 85,
      }),
      run("Научно-исследовательская работа", {
        y: 470,
        fontSizePt: 12,
        centerX: PAGE_CENTER_X,
      }),
      run("Обучающийся: Константинов А.А.", {
        y: 300,
        fontSizePt: 12,
        left: 85,
      }),
      run("2026", { y: 64, fontSizePt: 12, centerX: PAGE_CENTER_X }),
    ]);
    const modified = allPages.map((p) =>
      p.pageNumber === 1 ? titleWithoutGroup : p,
    );
    const node = buildDocumentStructureNode(makeContext(modified));
    const titlePageNode = findById([node], "title-page");
    const studentRule = findById([node], "title-page-student");
    expect(titlePageNode?.status).toBe("fail");
    expect(studentRule?.status).toBe("fail");
    expect(findById([node], "title-page-education-program")).toBeNull();
    expect(findById([node], "title-page-practice-name")).toBeNull();
    expect(findById([node], "title-page-year")).toBeNull();
  });

  it("fails student name when group exists but initials pattern does not match", () => {
    const titleWithWrongNameFormat = page(1, [
      run("Образовательная программа: 09.04.04 Программная инженерия", {
        y: 620,
        fontSizePt: 12,
        left: 85,
      }),
      run("Научно-исследовательская работа", {
        y: 470,
        fontSizePt: 12,
        centerX: PAGE_CENTER_X,
      }),
      run("Обучающийся: Константинов Александр Александрович, P4244", {
        y: 300,
        fontSizePt: 12,
        left: 85,
      }),
      run("2026", { y: 64, fontSizePt: 12, centerX: PAGE_CENTER_X }),
    ]);
    const modified = allPages.map((p) =>
      p.pageNumber === 1 ? titleWithWrongNameFormat : p,
    );
    const node = buildDocumentStructureNode(makeContext(modified));
    expect(findById([node], "title-page-student")?.status).toBe("fail");
  });

  it("toc-presence passes", () => {
    const node = buildDocumentStructureNode(makeContext(allPages));
    const toc = findById([node], "toc-presence");
    expect(toc?.status).toBe("pass");
  });

  it("structural-elements passes for all required elements", () => {
    const node = buildDocumentStructureNode(makeContext(allPages));
    const structEl = findById([node], "structural-elements");
    expect(structEl?.status).toBe("pass");
  });

  it("section-headings-format passes", () => {
    const node = buildDocumentStructureNode(makeContext(allPages));
    const headings = findById([node], "section-headings-format");
    expect(headings?.status).toBe("pass");
    expect(headings?.children).toHaveLength(2);
    expect(headings?.children.every((child) => child.status === "pass")).toBe(
      true,
    );
  });

  it("toc-body-match passes", () => {
    const node = buildDocumentStructureNode(makeContext(allPages));
    const match = findById([node], "toc-body-match");
    console.log("toc-body-match:", match?.status, match?.message);
    expect(match?.status).toBe("pass");
  });

  it("toc-presence overlay is shown on the heading", () => {
    const node = buildDocumentStructureNode(makeContext(allPages));
    const toc = findById([node], "toc-presence");
    expect(toc?.overlayBoxes.length).toBeGreaterThan(0);
  });

  it("fails toc-presence when ОГЛАВЛЕНИЕ is used instead of СОДЕРЖАНИЕ", () => {
    const oglPage = page(2, [
      run("ОГЛАВЛЕНИЕ", { y: 760, fontSizePt: 12, centerX: PAGE_CENTER_X }),
      run("ВВЕДЕНИЕ ...................................................... 3", {
        y: 700,
        fontSizePt: 12,
        left: 85,
      }),
    ]);
    const modified = allPages.map((p) => (p.pageNumber === 2 ? oglPage : p));
    const node = buildDocumentStructureNode(makeContext(modified));
    const toc = findById([node], "toc-presence");
    expect(toc?.status).toBe("fail");
    expect(toc?.message).toContain("ОГЛАВЛЕНИЕ");
  });

  it("fails toc-presence when no СОДЕРЖАНИЕ page exists", () => {
    const pagesWithoutToc = allPages.filter((p) => p.pageNumber !== 2);
    const node = buildDocumentStructureNode(makeContext(pagesWithoutToc));
    const toc = findById([node], "toc-presence");
    expect(toc?.status).toBe("fail");
  });

  it("fails toc-presence when СОДЕРЖАНИЕ ends with a period", () => {
    const tocWithPeriod = page(2, [
      run("СОДЕРЖАНИЕ.", { y: 760, fontSizePt: 12, centerX: PAGE_CENTER_X }),
      run("ВВЕДЕНИЕ ...................................................... 3", {
        y: 700,
        fontSizePt: 12,
        left: 85,
      }),
    ]);
    const modified = allPages.map((p) =>
      p.pageNumber === 2 ? tocWithPeriod : p,
    );
    const node = buildDocumentStructureNode(makeContext(modified));
    const toc = findById([node], "toc-presence");
    expect(toc?.status).toBe("fail");
    expect(toc?.message).toContain("заканчивается точкой");
  });

  it("fails toc-presence when СОДЕРЖАНИЕ is not centered", () => {
    const tocNotCentered = page(2, [
      run("СОДЕРЖАНИЕ", { y: 760, fontSizePt: 12, left: 85 }),
      run("ВВЕДЕНИЕ ...................................................... 3", {
        y: 700,
        fontSizePt: 12,
        left: 85,
      }),
    ]);
    const modified = allPages.map((p) =>
      p.pageNumber === 2 ? tocNotCentered : p,
    );
    const node = buildDocumentStructureNode(makeContext(modified));
    const toc = findById([node], "toc-presence");
    expect(toc?.status).toBe("fail");
    expect(toc?.message).toContain("выровнен по центру");
  });

  it("fails toc-presence when СОДЕРЖАНИЕ contains lowercase letters", () => {
    const tocLowercase = page(2, [
      run("Содержание", { y: 760, fontSizePt: 12, centerX: PAGE_CENTER_X }),
      run("ВВЕДЕНИЕ ...................................................... 3", {
        y: 700,
        fontSizePt: 12,
        left: 85,
      }),
    ]);
    const modified = allPages.map((p) =>
      p.pageNumber === 2 ? tocLowercase : p,
    );
    const node = buildDocumentStructureNode(makeContext(modified));
    const toc = findById([node], "toc-presence");
    expect(toc?.status).toBe("fail");
    expect(toc?.message).toContain("прописными буквами");
  });

  it("fails structural-elements when ВВЕДЕНИЕ is missing", () => {
    const pagesWithoutVvedenie = allPages.filter((p) => p.pageNumber !== 3);
    const node = buildDocumentStructureNode(makeContext(pagesWithoutVvedenie));
    const vvedenie = findById([node], "struct-elem-vvedenie");
    expect(vvedenie?.status).toBe("fail");
  });

  it("fails section-headings-format when section heading font is reduced to 12pt", () => {
    // TOC-driven matching should still find headings, but mark wrong font size.
    const wrongFont4 = page(4, [
      run("1 Аналитическая часть", {
        y: 760,
        fontSizePt: 12,
        left: SECTION_HEADING_LEFT_X,
      }),
      run("Текст раздела.", { y: 710, fontSizePt: 12, left: 85 }),
    ]);
    const wrongFont5 = page(5, [
      run("2 Практическая часть", {
        y: 760,
        fontSizePt: 12,
        left: SECTION_HEADING_LEFT_X,
      }),
      run("Текст раздела.", { y: 710, fontSizePt: 12, left: 85 }),
    ]);
    const modified = allPages.map((p) =>
      p.pageNumber === 4 ? wrongFont4 : p.pageNumber === 5 ? wrongFont5 : p,
    );
    const node = buildDocumentStructureNode(makeContext(modified));
    const headings = findById([node], "section-headings-format");
    expect(headings?.status).toBe("fail");
    expect(headings?.children).toHaveLength(2);
    expect(
      headings?.children.every((child) =>
        child.message.includes("Размер шрифта"),
      ),
    ).toBe(true);
  });

  it("fails section-headings-format when heading font is wrong (13pt instead of 14pt)", () => {
    // 13pt is above MIN threshold so it's detected, but fails the 14pt check
    const wrongFont4 = page(4, [
      run("1 Аналитическая часть", {
        y: 760,
        fontSizePt: 13,
        left: SECTION_HEADING_LEFT_X,
      }),
      run("Текст раздела.", { y: 710, fontSizePt: 12, left: 85 }),
    ]);
    const wrongFont5 = page(5, [
      run("2 Практическая часть", {
        y: 760,
        fontSizePt: 13,
        left: SECTION_HEADING_LEFT_X,
      }),
      run("Текст раздела.", { y: 710, fontSizePt: 12, left: 85 }),
    ]);
    const modified = allPages.map((p) =>
      p.pageNumber === 4 ? wrongFont4 : p.pageNumber === 5 ? wrongFont5 : p,
    );
    const node = buildDocumentStructureNode(makeContext(modified));
    const headings = findById([node], "section-headings-format");
    expect(headings?.status).toBe("fail");
  });

  it("fails section-headings-format when a trailing dot is used after the heading number", () => {
    const wrongNumber4 = page(4, [
      run("1. Аналитическая часть", {
        y: 760,
        fontSizePt: 14,
        left: SECTION_HEADING_LEFT_X,
      }),
      run("Текст раздела.", { y: 710, fontSizePt: 12, left: 85 }),
    ]);
    const wrongNumber5 = page(5, [
      run("2. Практическая часть", {
        y: 760,
        fontSizePt: 14,
        left: SECTION_HEADING_LEFT_X,
      }),
      run("Текст раздела.", { y: 710, fontSizePt: 12, left: 85 }),
    ]);
    const modified = allPages.map((p) =>
      p.pageNumber === 4 ? wrongNumber4 : p.pageNumber === 5 ? wrongNumber5 : p,
    );
    const node = buildDocumentStructureNode(makeContext(modified));
    const headings = findById([node], "section-headings-format");
    expect(headings?.status).toBe("fail");
    expect(
      headings?.children.some((child) =>
        child.message.includes("не ставится точка"),
      ),
    ).toBe(true);
  });

  it("fails section-headings-format when section heading starts with lowercase letter", () => {
    const wrongCaseSection = page(4, [
      run("1 аналитическая часть", {
        y: 760,
        fontSizePt: 14,
        left: SECTION_HEADING_LEFT_X,
      }),
      run("Текст раздела.", { y: 710, fontSizePt: 12, left: 85 }),
    ]);
    const modified = allPages.map((p) =>
      p.pageNumber === 4 ? wrongCaseSection : p,
    );
    const node = buildDocumentStructureNode(makeContext(modified));
    const headings = findById([node], "section-headings-format");
    expect(headings?.status).toBe("fail");
    expect(
      headings?.children.some((child) =>
        child.message.includes("прописной буквы"),
      ),
    ).toBe(true);
  });

  it("fails section-headings-format when subsection heading starts with lowercase letter", () => {
    const tocWithSubsection = page(2, [
      run("СОДЕРЖАНИЕ", { y: 760, fontSizePt: 12, centerX: PAGE_CENTER_X }),
      run("ВВЕДЕНИЕ ...................................................... 3", {
        y: 700,
        fontSizePt: 12,
        left: 85,
      }),
      run("1.1 подраздел теста ..................................... 4", {
        y: 680,
        fontSizePt: 12,
        left: 85,
      }),
      run("ЗАКЛЮЧЕНИЕ ................................................. 6", {
        y: 660,
        fontSizePt: 12,
        left: 85,
      }),
    ]);
    const subsectionPage = page(4, [
      run("1.1 подраздел теста", {
        y: 760,
        fontSizePt: 12,
        left: SECTION_HEADING_LEFT_X,
      }),
      run("Текст подраздела.", { y: 710, fontSizePt: 12, left: 85 }),
    ]);
    const modified = allPages.map((p) =>
      p.pageNumber === 2
        ? tocWithSubsection
        : p.pageNumber === 4
          ? subsectionPage
          : p,
    );
    const node = buildDocumentStructureNode(makeContext(modified));
    const headings = findById([node], "section-headings-format");
    expect(headings?.status).toBe("fail");
    expect(
      headings?.children.some((child) =>
        child.message.includes("подраздела должен начинаться с прописной"),
      ),
    ).toBe(true);
  });

  it("fails section-headings-format when heading has hyphenation artifacts", () => {
    const hyphenatedHeading = page(4, [
      run("1 Аналитическая ча-", {
        y: 760,
        fontSizePt: 14,
        left: SECTION_HEADING_LEFT_X,
      }),
      run("Текст раздела.", { y: 710, fontSizePt: 12, left: 85 }),
    ]);
    const modified = allPages.map((p) =>
      p.pageNumber === 4 ? hyphenatedHeading : p,
    );
    const node = buildDocumentStructureNode(makeContext(modified));
    const headings = findById([node], "section-headings-format");
    expect(headings?.status).toBe("fail");
    expect(
      headings?.children.some((child) =>
        child.message.includes("признаки переноса слова"),
      ),
    ).toBe(true);
  });

  it("fails section-headings-format when heading is not indented as a paragraph", () => {
    const noIndentHeading = page(4, [
      run("1 Аналитическая часть", {
        y: 760,
        fontSizePt: 14,
        left: BODY_LEFT_X,
      }),
      run("Текст раздела.", { y: 710, fontSizePt: 12, left: 85 }),
    ]);
    const modified = allPages.map((p) =>
      p.pageNumber === 4 ? noIndentHeading : p,
    );
    const node = buildDocumentStructureNode(makeContext(modified));
    const headings = findById([node], "section-headings-format");
    expect(headings?.status).toBe("fail");
    expect(
      headings?.children.some((child) =>
        child.message.includes("абзацного отступа"),
      ),
    ).toBe(true);
  });

  it("fails section-headings-format when heading is placed at page bottom without following text", () => {
    const bottomHeadingPage = page(4, [
      run("Текст раздела до заголовка.", { y: 710, fontSizePt: 12, left: 85 }),
      run("1 Аналитическая часть", {
        y: 60,
        fontSizePt: 14,
        left: SECTION_HEADING_LEFT_X,
      }),
    ]);
    const modified = allPages.map((p) =>
      p.pageNumber === 4 ? bottomHeadingPage : p,
    );
    const node = buildDocumentStructureNode(makeContext(modified));
    const headings = findById([node], "section-headings-format");
    expect(headings?.status).toBe("fail");
    expect(
      headings?.children.some((child) =>
        child.message.includes("в конце страницы"),
      ),
    ).toBe(true);
  });

  it("detects structural element with trailing period as found-with-issue (not missing)", () => {
    // "ВВЕДЕНИЕ." → fuzzy match strips period → detected as "found, has period issue"
    const pageWithPeriod = page(3, [
      run("ВВЕДЕНИЕ.", { y: 760, fontSizePt: 12, centerX: PAGE_CENTER_X }),
      run("Текст введения.", { y: 700, fontSizePt: 12, left: 85 }),
    ]);
    const modified = allPages.map((p) =>
      p.pageNumber === 3 ? pageWithPeriod : p,
    );
    const node = buildDocumentStructureNode(makeContext(modified));
    const vvedenie = findById([node], "struct-elem-vvedenie");
    console.log("ВВЕДЕНИЕ with period:", vvedenie?.status, vvedenie?.message);
    // Found but with a period issue → fail (not "not found")
    expect(vvedenie?.status).toBe("fail");
    expect(vvedenie?.message).toContain("точкой");
  });

  it("fails structural element when lowercase letters are used", () => {
    const pageWithLowercaseHeading = page(3, [
      run("Введение", { y: 760, fontSizePt: 12, centerX: PAGE_CENTER_X }),
      run("Текст введения.", { y: 700, fontSizePt: 12, left: 85 }),
    ]);
    const modified = allPages.map((p) =>
      p.pageNumber === 3 ? pageWithLowercaseHeading : p,
    );
    const node = buildDocumentStructureNode(makeContext(modified));
    const vvedenie = findById([node], "struct-elem-vvedenie");
    expect(vvedenie?.status).toBe("fail");
    expect(vvedenie?.message).toContain("прописными буквами");
  });
});
