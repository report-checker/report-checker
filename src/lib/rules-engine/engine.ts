import type { CheckerConfig } from "../checker-config";
import { buildEngineContext } from "./context";
import { buildDocumentStructureNode } from "./document-structure";
import { resolveMarginGeometry } from "./geometry";
import { buildMarginRuleNode, collectMarginMeasurements } from "./margins";
import { overlayBox } from "./overlays";
import { collectMainTextParagraphs } from "./paragraph-engine";
import { buildPageNumberingRule } from "./page-numbering";
import { aggregateStatus } from "./status";
import {
  buildA4PageFormatRule,
  buildFontColorBlackRule,
  buildJustifiedAlignmentRule,
  buildLineSpacingRule,
  buildMinimumFontSizeRule,
  buildParagraphIndentRule,
} from "./text-set";
import type {
  OverlayStyle,
  ParsedPdfResult,
  PdfRect,
  RuleResult,
  RuleStatus,
  RulesEngineDeps,
  RulesEngineInput,
  RulesEngineOutput,
} from "./types";

export async function runRulesEngine(
  input: RulesEngineInput,
  deps: RulesEngineDeps,
): Promise<RulesEngineOutput> {
  const parsed = await deps.parsePdf(input.pdfBytes);
  const marginGeometry = resolveMarginGeometry(parsed);

  return evaluateParsedPdf(
    {
      ...parsed,
      marginBoundsByPage: marginGeometry.boundsByPage,
      parserEngineLabel: marginGeometry.engineLabel,
      parserNote: marginGeometry.note ?? null,
    },
    input.config,
    {
      detectedTextBoxesByPage: marginGeometry.textBoxesByPage,
    },
  );
}

type EvaluateParsedPdfOptions = {
  detectedTextBoxesByPage?: Array<PdfRect[]>;
};

export function evaluateParsedPdf(
  parsed: ParsedPdfResult,
  config: CheckerConfig,
  options?: EvaluateParsedPdfOptions,
): RulesEngineOutput {
  const context = buildEngineContext(parsed, config);
  const measurements = collectMarginMeasurements(context.pages);

  const extractionNote =
    measurements.measuredPages === 0
      ? "Не удалось определить границы текста в PDF. Проверьте, что файл содержит извлекаемый текст."
      : measurements.measuredPages < context.pageCount
        ? `Границы текста определены на ${measurements.measuredPages} из ${context.pageCount} страниц.`
        : undefined;

  const note = mergeOptionalNotes(
    extractionNote,
    context.parserNote ?? undefined,
  );

  const margins = config.margins;
  const marginRules = [
    buildMarginRuleNode(
      "margin-left",
      `Поле слева — ${margins.leftCm.toFixed(1)} см.`,
      measurements.left,
      margins.leftCm,
      margins.toleranceCm,
    ),
    buildMarginRuleNode(
      "margin-right",
      `Поле справа — ${margins.rightCm.toFixed(1)} см.`,
      measurements.right,
      margins.rightCm,
      margins.toleranceCm,
    ),
    buildMarginRuleNode(
      "margin-top",
      `Поле сверху — ${margins.topCm.toFixed(1)} см.`,
      measurements.top,
      margins.topCm,
      margins.toleranceCm,
    ),
    buildMarginRuleNode(
      "margin-bottom",
      `Поле снизу — ${margins.bottomCm.toFixed(1)} см.`,
      measurements.bottom,
      margins.bottomCm,
      margins.toleranceCm,
    ),
  ];

  const marginsNode: RuleResult = {
    id: "margins",
    title: "Поля страницы",
    status: aggregateStatus(marginRules),
    message: "Проверка левого, правого, верхнего и нижнего полей.",
    children: marginRules,
    overlayBoxes: [],
    jumpPageNumbers: [],
    childrenCollapsedByDefault: false,
    countInSummary: false,
  };

  const pageNumberingLeaf = buildPageNumberingRule(context);
  const pageNumberingNode: RuleResult = {
    id: "page-numbering-section",
    title: "Нумерация страниц",
    status: pageNumberingLeaf.status,
    message:
      "Проверка сквозной арабской нумерации со второй страницы внизу листа (центр/право).",
    children: [pageNumberingLeaf],
    overlayBoxes: [],
    jumpPageNumbers: [],
    childrenCollapsedByDefault: false,
    countInSummary: false,
  };

  const typographyRules = [
    buildMinimumFontSizeRule(context),
    buildLineSpacingRule(context),
    buildFontColorBlackRule(context),
    buildParagraphIndentRule(context),
    buildJustifiedAlignmentRule(context),
  ];
  const typographyNode: RuleResult = {
    id: "typography",
    title: "Параметры текста",
    status: aggregateStatus(typographyRules),
    message:
      "Проверка размера шрифта, межстрочного интервала, цвета текста, абзацного отступа и выравнивания.",
    children: typographyRules,
    overlayBoxes: [],
    jumpPageNumbers: [],
    childrenCollapsedByDefault: false,
    countInSummary: false,
  };

  const pageFormatRule = buildA4PageFormatRule(context);

  const sectionNodes = [
    pageFormatRule,
    typographyNode,
    marginsNode,
    pageNumberingNode,
  ];

  const textSetNode: RuleResult = {
    id: "text-set",
    title: "Набор текста",
    status: aggregateStatus(sectionNodes),
    message: `Проверено страниц: ${context.checkedPages}/${context.pageCount}.`,
    children: sectionNodes,
    overlayBoxes: [],
    jumpPageNumbers: [],
    childrenCollapsedByDefault: false,
    countInSummary: false,
  };

  const documentStructureNode = buildDocumentStructureNode(context);

  const detectedBoundsDebugNode = buildDetectedTextBoundsDebugNode(
    context,
    options?.detectedTextBoxesByPage ??
      context.pages.map((page) => page.textRuns.map((run) => run.bounds)),
  );
  const detectedParagraphBoundsDebugNode =
    buildDetectedParagraphBoundsDebugNode(context);

  const rootMessage =
    note ?? `Проверка выполнена.`;

  const root: RuleResult = {
    id: "formatting",
    title: "Требования к оформлению отчета по практике",
    status: aggregateStatus([textSetNode, documentStructureNode]),
    message: rootMessage,
    children: [
      textSetNode,
      documentStructureNode,
      detectedBoundsDebugNode,
      detectedParagraphBoundsDebugNode,
    ],
    overlayBoxes: [],
    jumpPageNumbers: [],
    childrenCollapsedByDefault: false,
    countInSummary: false,
  };

  const processedRoot = applyRuleSettings(root, config.rules ?? {}) ?? root;

  return {
    pageCount: context.pageCount,
    checkedPages: context.checkedPages,
    rules: [processedRoot],
    note: note ?? null,
  };
}

function applyRuleSettings(
  rule: RuleResult,
  settings: CheckerConfig["rules"],
): RuleResult | null {
  const ruleSettings = settings[rule.id];
  if (ruleSettings?.enabled === false) {
    return null;
  }

  const processedChildren = rule.children
    .map((child) => applyRuleSettings(child, settings))
    .filter((child): child is RuleResult => child !== null);

  let status: RuleStatus =
    processedChildren.length > 0
      ? aggregateStatus(processedChildren)
      : rule.status;

  if (ruleSettings?.severity === "warning" && status === "fail") {
    status = "warn";
  }

  return {
    ...rule,
    status,
    children: processedChildren,
    countInSummary: ruleSettings?.countInSummary ?? false,
  };
}

function mergeOptionalNotes(
  left: string | undefined,
  right: string | undefined,
): string | undefined {
  if (left && right) {
    return `${left}\n${right}`;
  }

  return left ?? right;
}

function buildDetectedTextBoundsDebugNode(
  context: ReturnType<typeof buildEngineContext>,
  detectedTextBoxesByPage: Array<PdfRect[]>,
): RuleResult {
  const overlayBoxes = [];
  const children: RuleResult[] = [];
  const missingPages: number[] = [];

  for (const [index, page] of context.pages.entries()) {
    const pageBox = page.pageBox;
    if (!pageBox) {
      missingPages.push(page.pageNumber);
      continue;
    }

    const pageTextBoxes = (detectedTextBoxesByPage[index] ?? [])
      .map(normalizeRect)
      .filter((rect) => rect.right > rect.left && rect.top > rect.bottom);
    if (pageTextBoxes.length === 0) {
      missingPages.push(page.pageNumber);
      continue;
    }

    const pageOverlayBoxes = pageTextBoxes.map((textRect) =>
      overlayBox(page.pageNumber, pageBox, textRect, styleForDetectedBounds()),
    );
    overlayBoxes.push(...pageOverlayBoxes);

    children.push({
      id: `detected-text-bounds-page-${page.pageNumber}`,
      title: `Страница ${page.pageNumber}`,
      status: "pass",
      message: `Найдено ${pageOverlayBoxes.length} текстовых блоков.`,
      children: [],
      overlayBoxes: pageOverlayBoxes,
      jumpPageNumbers: [page.pageNumber],
      childrenCollapsedByDefault: false,
      countInSummary: false,
    });
  }

  const missingPagesText =
    missingPages.length > 0
      ? ` Нет границ на страницах: ${missingPages.join(", ")}.`
      : "";
  const status = missingPages.length === 0 ? "pass" : "warn";

  return {
    id: "detected-text-bounds",
    title: `Границы текста (${context.parserEngineLabel})`,
    status,
    message: `Найдено ${overlayBoxes.length} границ текста.${missingPagesText}`,
    children,
    overlayBoxes,
    jumpPageNumbers: context.pages.map((page) => page.pageNumber),
    childrenCollapsedByDefault: true,
    countInSummary: false,
  };
}

function buildDetectedParagraphBoundsDebugNode(
  context: ReturnType<typeof buildEngineContext>,
): RuleResult {
  const paragraphs = collectMainTextParagraphs(context);
  const overlayBoxes = [];
  const children: RuleResult[] = [];
  const missingPages: number[] = [];

  for (const page of context.pages) {
    const pageBox = page.pageBox;
    if (!pageBox) {
      missingPages.push(page.pageNumber);
      continue;
    }

    const pageParagraphs = paragraphs.filter(
      (paragraph) => paragraph.pageNumber === page.pageNumber,
    );
    if (pageParagraphs.length === 0) {
      missingPages.push(page.pageNumber);
      continue;
    }

    const pageOverlayBoxes = pageParagraphs.map((paragraph) =>
      overlayBox(
        page.pageNumber,
        pageBox,
        normalizeRect(paragraph.bounds),
        styleForDetectedParagraphBounds(),
      ),
    );
    overlayBoxes.push(...pageOverlayBoxes);

    children.push({
      id: `detected-paragraph-bounds-page-${page.pageNumber}`,
      title: `Страница ${page.pageNumber}`,
      status: "pass",
      message: `Найдено ${pageParagraphs.length} абзацев.`,
      children: [],
      overlayBoxes: pageOverlayBoxes,
      jumpPageNumbers: [page.pageNumber],
      childrenCollapsedByDefault: false,
      countInSummary: false,
    });
  }

  const missingPagesText =
    missingPages.length > 0
      ? ` Нет абзацных границ на страницах: ${missingPages.join(", ")}.`
      : "";
  const status = missingPages.length === 0 ? "pass" : "warn";

  return {
    id: "detected-paragraph-bounds",
    title: "Границы абзацев (эвристика)",
    status,
    message: `Найдено ${overlayBoxes.length} абзацных границ.${missingPagesText}`,
    children,
    overlayBoxes,
    jumpPageNumbers: context.pages.map((page) => page.pageNumber),
    childrenCollapsedByDefault: true,
    countInSummary: false,
  };
}

function styleForDetectedBounds(): OverlayStyle {
  return {
    borderColor: "#1d4ed8",
    fillColor: "rgba(37, 99, 235, 0.08)",
    borderWidth: 1.5,
    dashed: true,
  };
}

function styleForDetectedParagraphBounds(): OverlayStyle {
  return {
    borderColor: "#b45309",
    fillColor: "rgba(245, 158, 11, 0.10)",
    borderWidth: 1.5,
    dashed: true,
  };
}

function normalizeRect(rect: PdfRect): PdfRect {
  return {
    left: Math.min(rect.left, rect.right),
    right: Math.max(rect.left, rect.right),
    bottom: Math.min(rect.bottom, rect.top),
    top: Math.max(rect.bottom, rect.top),
  };
}
