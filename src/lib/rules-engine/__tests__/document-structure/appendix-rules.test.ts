import { describe, expect, it } from "vitest";
import { buildDocumentStructureNode } from "../../document-structure";
import { findById, makeContext, PAGE_CENTER_X, page, run } from "./shared";

const TOC = "\u0421\u041e\u0414\u0415\u0420\u0416\u0410\u041d\u0418\u0415";
const SOURCES =
  "\u0421\u041f\u0418\u0421\u041e\u041a \u0418\u0421\u041f\u041e\u041b\u042c\u0417\u041e\u0412\u0410\u041d\u041d\u042b\u0425 \u0418\u0421\u0422\u041e\u0427\u041d\u0418\u041a\u041e\u0412";
const APPENDIX = "\u041f\u0420\u0418\u041b\u041e\u0416\u0415\u041d\u0418\u0415";
const A = "\u0410";
const B = "\u0411";

function tocEntry(title: string, pageRef: number): string {
  return `${title} ...................................................... ${pageRef}`;
}

describe("appendix rules", () => {
  it("passes appendix checks for correctly formatted appendices", () => {
    const pages = [
      page(1, [run("\u041e\u0422\u0427\u0415\u0422", { y: 760, fontSizePt: 12, centerX: PAGE_CENTER_X })]),
      page(2, [
        run(TOC, { y: 760, fontSizePt: 12, centerX: PAGE_CENTER_X }),
        run(tocEntry("\u0412\u0412\u0415\u0414\u0415\u041d\u0418\u0415", 3), {
          y: 710,
          fontSizePt: 12,
          left: 85,
        }),
        run(tocEntry(SOURCES, 3), { y: 690, fontSizePt: 12, left: 85 }),
        run(tocEntry(`${APPENDIX} ${A}`, 4), {
          y: 670,
          fontSizePt: 12,
          left: 85,
        }),
        run(tocEntry(`${APPENDIX} ${B}`, 5), {
          y: 650,
          fontSizePt: 12,
          left: 85,
        }),
      ]),
      page(3, [
        run(SOURCES, { y: 760, fontSizePt: 12, centerX: PAGE_CENTER_X }),
        run("1. source", { y: 730, fontSizePt: 12, left: 85 }),
        run(`\u0421\u041c. ${APPENDIX} ${A} \u0414\u041b\u042f \u0414\u0415\u0422\u0410\u041b\u0415\u0419.`, {
          y: 700,
          fontSizePt: 12,
          left: 85,
        }),
        run(`\u0421\u041c. ${APPENDIX} ${B} \u0414\u041b\u042f \u0418\u0421\u0425\u041e\u0414\u041d\u042b\u0425 \u0414\u0410\u041d\u041d\u042b\u0425.`, {
          y: 680,
          fontSizePt: 12,
          left: 85,
        }),
      ]),
      page(4, [
        run(`${APPENDIX} ${A}`, { y: 770, fontSizePt: 12, left: 430 }),
        run("appendix data", {
          y: 742,
          fontSizePt: 12,
          centerX: PAGE_CENTER_X,
        }),
        run("body", { y: 700, fontSizePt: 12, left: 85 }),
      ]),
      page(5, [
        run(`${APPENDIX} ${B}`, { y: 770, fontSizePt: 12, left: 430 }),
        run("raw tables", {
          y: 742,
          fontSizePt: 12,
          centerX: PAGE_CENTER_X,
        }),
        run("body", { y: 700, fontSizePt: 12, left: 85 }),
      ]),
    ];

    const node = buildDocumentStructureNode(makeContext(pages));
    expect(findById([node], "appendices")?.status).toBe("pass");
    expect(findById([node], "appendices-in-toc")?.status).toBe("pass");
    expect(findById([node], "appendices-references")?.status).toBe("pass");
    expect(findById([node], "appendices-order-by-reference")?.status).toBe(
      "pass",
    );
    expect(findById([node], "appendices-after-sources")?.status).toBe("pass");
    expect(findById([node], "appendices-new-page")?.status).toBe("pass");
    expect(findById([node], "appendices-numbering")?.status).toBe("pass");
    expect(findById([node], "appendices-label-position")?.status).toBe("pass");
    expect(findById([node], "appendices-title-format")?.status).toBe("pass");
  });

  it("fails numbering and order checks for mixed numbering and mention order", () => {
    const pages = [
      page(1, [run("\u041e\u0422\u0427\u0415\u0422", { y: 760, fontSizePt: 12, centerX: PAGE_CENTER_X })]),
      page(2, [
        run(TOC, { y: 760, fontSizePt: 12, centerX: PAGE_CENTER_X }),
        run(tocEntry(SOURCES, 3), { y: 710, fontSizePt: 12, left: 85 }),
        run(tocEntry(`${APPENDIX} ${A}`, 4), {
          y: 690,
          fontSizePt: 12,
          left: 85,
        }),
        run(tocEntry(`${APPENDIX} 2`, 5), {
          y: 670,
          fontSizePt: 12,
          left: 85,
        }),
      ]),
      page(3, [
        run(SOURCES, { y: 760, fontSizePt: 12, centerX: PAGE_CENTER_X }),
        run(`\u0421\u041c. ${APPENDIX} 2`, {
          y: 700,
          fontSizePt: 12,
          left: 85,
        }),
        run(`\u0421\u041c. ${APPENDIX} ${A}`, {
          y: 680,
          fontSizePt: 12,
          left: 85,
        }),
      ]),
      page(4, [
        run(`${APPENDIX} ${A}`, { y: 770, fontSizePt: 12, left: 430 }),
        run("appendix a title", {
          y: 742,
          fontSizePt: 12,
          centerX: PAGE_CENTER_X,
        }),
      ]),
      page(5, [
        run(`${APPENDIX} 2`, { y: 770, fontSizePt: 12, left: 430 }),
        run("appendix two title", {
          y: 742,
          fontSizePt: 12,
          centerX: PAGE_CENTER_X,
        }),
      ]),
    ];

    const node = buildDocumentStructureNode(makeContext(pages));
    expect(findById([node], "appendices-in-toc")?.status).toBe("pass");
    expect(findById([node], "appendices-numbering")?.status).toBe("fail");
    expect(findById([node], "appendices-order-by-reference")?.status).toBe(
      "fail",
    );
  });

  it("fails placement/title/after-sources checks for malformed appendix page", () => {
    const pages = [
      page(1, [run("\u041e\u0422\u0427\u0415\u0422", { y: 760, fontSizePt: 12, centerX: PAGE_CENTER_X })]),
      page(2, [
        run(TOC, { y: 760, fontSizePt: 12, centerX: PAGE_CENTER_X }),
        run(tocEntry(SOURCES, 4), { y: 720, fontSizePt: 12, left: 85 }),
        run(tocEntry(`${APPENDIX} ${A}`, 3), {
          y: 700,
          fontSizePt: 12,
          left: 85,
        }),
      ]),
      page(3, [
        run("text before appendix", { y: 770, fontSizePt: 12, left: 85 }),
        run(`${APPENDIX} ${A} EXTRA`, { y: 560, fontSizePt: 12, left: 286 }),
        run("TITLE", { y: 530, fontSizePt: 12, left: 120 }),
      ]),
      page(4, [
        run(SOURCES, { y: 760, fontSizePt: 12, centerX: PAGE_CENTER_X }),
      ]),
    ];

    const node = buildDocumentStructureNode(makeContext(pages));
    expect(findById([node], "appendices-in-toc")?.status).toBe("pass");
    expect(findById([node], "appendices-after-sources")?.status).toBe("fail");
    expect(findById([node], "appendices-new-page")?.status).toBe("fail");
    expect(findById([node], "appendices-label-position")?.status).toBe("fail");
    expect(findById([node], "appendices-title-format")?.status).toBe("fail");
  });

  it("detects left-aligned appendix header but fails label-position", () => {
    const pages = [
      page(1, [run("\u041e\u0422\u0427\u0415\u0422", { y: 760, fontSizePt: 12, centerX: PAGE_CENTER_X })]),
      page(2, [
        run(TOC, { y: 760, fontSizePt: 12, centerX: PAGE_CENTER_X }),
        run(tocEntry(SOURCES, 3), { y: 710, fontSizePt: 12, left: 85 }),
        run(tocEntry(`${APPENDIX} 1`, 4), {
          y: 690,
          fontSizePt: 12,
          left: 85,
        }),
      ]),
      page(3, [
        run(SOURCES, { y: 760, fontSizePt: 12, centerX: PAGE_CENTER_X }),
        run(`\u0421\u041c. ${APPENDIX} 1`, {
          y: 700,
          fontSizePt: 12,
          left: 85,
        }),
      ]),
      page(4, [
        run(`${APPENDIX} 1`, { y: 770, fontSizePt: 12, left: 85 }),
        run("appendix title", {
          y: 742,
          fontSizePt: 12,
          centerX: PAGE_CENTER_X,
        }),
      ]),
    ];

    const node = buildDocumentStructureNode(makeContext(pages));
    expect(findById([node], "appendices-in-toc")?.status).toBe("pass");
    expect(findById([node], "appendices-label-position")?.status).toBe("fail");
  });

  it("matches appendix by TOC even when label line includes inline text", () => {
    const pages = [
      page(1, [run("\u041e\u0422\u0427\u0415\u0422", { y: 760, fontSizePt: 12, centerX: PAGE_CENTER_X })]),
      page(2, [
        run(TOC, { y: 760, fontSizePt: 12, centerX: PAGE_CENTER_X }),
        run(tocEntry(SOURCES, 3), { y: 710, fontSizePt: 12, left: 85 }),
        run(tocEntry(`${APPENDIX} 1`, 4), {
          y: 690,
          fontSizePt: 12,
          left: 85,
        }),
        run(tocEntry(`${APPENDIX} 2`, 5), {
          y: 670,
          fontSizePt: 12,
          left: 85,
        }),
      ]),
      page(3, [
        run(SOURCES, { y: 760, fontSizePt: 12, centerX: PAGE_CENTER_X }),
        run(`\u0421\u041c. ${APPENDIX} 1`, {
          y: 700,
          fontSizePt: 12,
          left: 85,
        }),
        run(`\u0421\u041c. ${APPENDIX} 2`, {
          y: 680,
          fontSizePt: 12,
          left: 85,
        }),
      ]),
      page(4, [
        run(`${APPENDIX} 1`, { y: 770, fontSizePt: 12, left: 430 }),
        run("first appendix", {
          y: 742,
          fontSizePt: 12,
          centerX: PAGE_CENTER_X,
        }),
      ]),
      page(5, [
        run(`${APPENDIX} 2 \u043f\u0440\u0438\u0432\u0435\u0434\u0435\u043d\u043e \u043d\u0438\u0436\u0435 \u043f\u043e \u0442\u0435\u043a\u0441\u0442\u0443`, {
          y: 760,
          fontSizePt: 12,
          left: 85,
        }),
        run("body paragraph", { y: 730, fontSizePt: 12, left: 85 }),
      ]),
    ];

    const node = buildDocumentStructureNode(makeContext(pages));
    const inToc = findById([node], "appendices-in-toc");
    expect(inToc?.status).toBe("pass");
    expect(findById([node], "appendix-in-toc-0")?.status).toBe("pass");
    expect(findById([node], "appendix-in-toc-1")?.status).toBe("pass");
    expect(findById([node], "appendices-label-position")?.status).toBe("fail");
  });

  it("treats missing sources entry in TOC as pass for appendices-after-sources", () => {
    const pages = [
      page(1, [run("\u041e\u0422\u0427\u0415\u0422", { y: 760, fontSizePt: 12, centerX: PAGE_CENTER_X })]),
      page(2, [
        run(TOC, { y: 760, fontSizePt: 12, centerX: PAGE_CENTER_X }),
        run(tocEntry(`${APPENDIX} ${A}`, 3), {
          y: 700,
          fontSizePt: 12,
          left: 85,
        }),
      ]),
      page(3, [
        run(`${APPENDIX} ${A}`, { y: 770, fontSizePt: 12, left: 430 }),
        run("appendix title", {
          y: 742,
          fontSizePt: 12,
          centerX: PAGE_CENTER_X,
        }),
      ]),
      page(4, [
        run(SOURCES, { y: 760, fontSizePt: 12, centerX: PAGE_CENTER_X }),
      ]),
    ];

    const node = buildDocumentStructureNode(makeContext(pages));
    const afterSources = findById([node], "appendices-after-sources");
    expect(afterSources?.status).toBe("pass");
    expect(afterSources?.message).toContain(
      "не найден в «СОДЕРЖАНИИ», правило порядка приложений пропущено",
    );
  });
});
