import { describe, expect, it } from "vitest";
import { saveDebugPdf } from "../debug-pdf";
import { buildDocumentStructureNode } from "../../document-structure";
import {
  findById,
  makeContext,
  object,
  PAGE_CENTER_X,
  page,
  run,
} from "./shared";

describe("figure rules", () => {
  it("passes figure checks when caption, numbering, references, and placement are correct", async () => {
    const figurePage = page(
      1,
      [
        run("См. рисунок 1 в разделе ниже.", {
          y: 700,
          fontSizePt: 12,
          left: 85,
        }),
        run("Рисунок 1 — Схема обработки данных", {
          y: 280,
          fontSizePt: 12,
          centerX: PAGE_CENTER_X,
        }),
      ],
      [
        object({
          left: 150,
          right: 445,
          bottom: 340,
          top: 640,
        }),
      ],
    );

    await saveDebugPdf("figure-rules--pass-all-checks", [figurePage]);
    const context = makeContext([figurePage]);
    const node = buildDocumentStructureNode(context);
    const captionFormat = findById([node], "figures-caption-format");
    const numbering = findById([node], "figures-numbering");
    const references = findById([node], "figures-references");
    const placement = findById([node], "figures-placement-by-reference");

    expect(captionFormat?.status).toBe("pass");
    expect(numbering?.status).toBe("pass");
    expect(references?.status).toBe("pass");
    expect(placement?.status).toBe("pass");
  });

  it("fails figure checks when rules are violated", async () => {
    const badFigurePage = page(1, [
      run("Рисунок 2 — Некорректная подпись.", {
        y: 280,
        fontSizePt: 12,
        left: 85,
      }),
    ]);

    await saveDebugPdf("figure-rules--fail-all-checks", [badFigurePage]);
    const context = makeContext([badFigurePage]);
    const node = buildDocumentStructureNode(context);
    const captionFormat = findById([node], "figures-caption-format");
    const numbering = findById([node], "figures-numbering");
    const references = findById([node], "figures-references");
    const placement = findById([node], "figures-placement-by-reference");

    expect(captionFormat?.status).toBe("fail");
    expect(numbering?.status).toBe("fail");
    expect(references?.status).toBe("fail");
    expect(placement?.status).toBe("fail");
  });

  it("shows child entries for orphan references when captions are missing", async () => {
    const referenceOnlyPage = page(1, [
      run("См. рисунок 5 для деталей.", { y: 700, fontSizePt: 12, left: 85 }),
    ]);

    await saveDebugPdf("figure-rules--orphan-references", [referenceOnlyPage]);
    const context = makeContext([referenceOnlyPage]);
    const node = buildDocumentStructureNode(context);
    const references = findById([node], "figures-references");

    expect(references?.status).toBe("fail");
    expect(references?.children.length).toBeGreaterThan(0);
    expect(references?.children[0]?.title).toContain("рисунок 5");
  });

  it("detects inflected references like «на рисунке N»", async () => {
    const referenceOnlyPage = page(1, [
      run("На рисунке 5 показан пример.", { y: 700, fontSizePt: 12, left: 85 }),
    ]);

    await saveDebugPdf("figure-rules--inflected-reference", [referenceOnlyPage]);
    const context = makeContext([referenceOnlyPage]);
    const node = buildDocumentStructureNode(context);
    const references = findById([node], "figures-references");

    expect(references?.status).toBe("fail");
    expect(references?.children.length).toBeGreaterThan(0);
    expect(references?.children[0]?.title).toContain("рисунке 5");
  });

  it("accepts «Изображение» as alias but marks it as an error", async () => {
    const aliasPage = page(
      1,
      [
        run("См. изображение 1 ниже.", { y: 700, fontSizePt: 12, left: 85 }),
        run("Изображение 1 — Демонстрация", {
          y: 280,
          fontSizePt: 12,
          centerX: PAGE_CENTER_X,
        }),
      ],
      [
        object({
          left: 150,
          right: 445,
          bottom: 340,
          top: 640,
        }),
      ],
    );

    await saveDebugPdf("figure-rules--alias-izobrazhenie", [aliasPage]);
    const context = makeContext([aliasPage]);
    const node = buildDocumentStructureNode(context);
    const captionFormat = findById([node], "figures-caption-format");
    const references = findById([node], "figures-references");

    expect(captionFormat?.status).toBe("fail");
    expect(references?.status).toBe("fail");
    expect(captionFormat?.children[0]?.message).toContain("Изображение");
    expect(references?.children[0]?.message).toContain("Изображение");
  });

  it("does not treat TOC appendix entry as body appendix start for figure rules", async () => {
    const pages = [
      page(1, [run("ОТЧЕТ", { y: 760, fontSizePt: 12, centerX: PAGE_CENTER_X })]),
      page(2, [
        run("СОДЕРЖАНИЕ", { y: 760, fontSizePt: 12, centerX: PAGE_CENTER_X }),
        run("ВВЕДЕНИЕ ...................................................... 3", {
          y: 700,
          fontSizePt: 12,
          left: 85,
        }),
        run("ПРИЛОЖЕНИЕ А .................................................. 14", {
          y: 680,
          fontSizePt: 12,
          left: 85,
        }),
      ]),
      page(3, [run("ВВЕДЕНИЕ", { y: 760, fontSizePt: 12, centerX: PAGE_CENTER_X })]),
      page(4, []),
      page(5, []),
      page(6, []),
      page(7, []),
      page(
        8,
        [
          run("См. рисунок 1 ниже.", { y: 700, fontSizePt: 12, left: 85 }),
          run("Рисунок 1 — Схема", {
            y: 280,
            fontSizePt: 12,
            centerX: PAGE_CENTER_X,
          }),
        ],
        [
          object({
            left: 150,
            right: 445,
            bottom: 340,
            top: 640,
          }),
        ],
      ),
    ];

    await saveDebugPdf("figure-rules--toc-appendix-not-body", pages);
    const context = makeContext(pages);
    const node = buildDocumentStructureNode(context);
    const references = findById([node], "figures-references");
    const numbering = findById([node], "figures-numbering");

    expect(references?.status).toBe("pass");
    expect(numbering?.status).toBe("pass");
  });

  it("passes appendix-only illustration references when appendix is referenced in body text", async () => {
    const pages = [
      page(1, [run("ОТЧЕТ", { y: 760, fontSizePt: 12, centerX: PAGE_CENTER_X })]),
      page(2, [
        run("СОДЕРЖАНИЕ", { y: 760, fontSizePt: 12, centerX: PAGE_CENTER_X }),
        run("ВВЕДЕНИЕ ...................................................... 3", {
          y: 700,
          fontSizePt: 12,
          left: 85,
        }),
        run("ПРИЛОЖЕНИЕ А .................................................. 4", {
          y: 680,
          fontSizePt: 12,
          left: 85,
        }),
      ]),
      page(3, [run("См. рисунок 1 в приложении А.", { y: 700, fontSizePt: 12, left: 85 })]),
      page(
        4,
        [
          run("ПРИЛОЖЕНИЕ А", { y: 760, fontSizePt: 12, centerX: PAGE_CENTER_X }),
          run("Рисунок 1 Подпись без тире", {
            y: 280,
            fontSizePt: 12,
            left: 85,
          }),
        ],
        [
          object({
            left: 150,
            right: 445,
            bottom: 340,
            top: 640,
          }),
        ],
      ),
    ];

    await saveDebugPdf("figure-rules--appendix-referenced-in-body", pages);
    const context = makeContext(pages);
    const node = buildDocumentStructureNode(context);
    const references = findById([node], "figures-references");

    expect(references?.status).toBe("pass");
    expect(references?.children.length).toBeGreaterThan(0);
    expect(references?.children[0]?.status).toBe("pass");
    expect((references?.children[0]?.overlayBoxes.length ?? 0) > 0).toBe(true);
    expect(references?.children[0]?.children.length).toBeGreaterThan(0);
    expect(references?.children[0]?.children[0]?.title).toContain("рисунок");
    expect(
      (references?.children[0]?.children[0]?.overlayBoxes.length ?? 0) > 0,
    ).toBe(true);
  });

  it("fails appendix-only illustration references when appendix is not referenced in body text", async () => {
    const pages = [
      page(1, [run("ОТЧЕТ", { y: 760, fontSizePt: 12, centerX: PAGE_CENTER_X })]),
      page(2, [
        run("СОДЕРЖАНИЕ", { y: 760, fontSizePt: 12, centerX: PAGE_CENTER_X }),
        run("ВВЕДЕНИЕ ...................................................... 3", {
          y: 700,
          fontSizePt: 12,
          left: 85,
        }),
        run("ПРИЛОЖЕНИЕ А .................................................. 4", {
          y: 680,
          fontSizePt: 12,
          left: 85,
        }),
      ]),
      page(3, [run("В тексте нет ссылки на приложение.", { y: 700, fontSizePt: 12, left: 85 })]),
      page(
        4,
        [
          run("ПРИЛОЖЕНИЕ А", { y: 760, fontSizePt: 12, centerX: PAGE_CENTER_X }),
          run("Рисунок 1 Подпись без тире", {
            y: 280,
            fontSizePt: 12,
            left: 85,
          }),
        ],
        [
          object({
            left: 150,
            right: 445,
            bottom: 340,
            top: 640,
          }),
        ],
      ),
    ];

    await saveDebugPdf("figure-rules--appendix-not-referenced-in-body", pages);
    const context = makeContext(pages);
    const node = buildDocumentStructureNode(context);
    const references = findById([node], "figures-references");

    expect(references?.status).toBe("fail");
    expect(references?.children.length).toBeGreaterThan(0);
    expect(references?.children[0]?.status).toBe("fail");
    expect((references?.children[0]?.overlayBoxes.length ?? 0) > 0).toBe(true);
  });

  it("fails when a main-body image exists without figure caption", async () => {
    const pages = [
      page(
        1,
        [run("Основной текст без подписи к изображению.", { y: 700, fontSizePt: 12, left: 85 })],
        [
          object({
            left: 150,
            right: 445,
            bottom: 340,
            top: 640,
          }),
        ],
      ),
    ];

    await saveDebugPdf("figure-rules--image-without-caption", pages);
    const context = makeContext(pages);
    const node = buildDocumentStructureNode(context);
    const references = findById([node], "figures-references");

    expect(references?.status).toBe("fail");
    expect(references?.children.length).toBeGreaterThan(0);
    expect(references?.children[0]?.title).toContain(
      "Иллюстрация в основной части",
    );
    expect((references?.children[0]?.overlayBoxes.length ?? 0) > 0).toBe(true);
  });
});
