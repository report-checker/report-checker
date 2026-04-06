import type { CheckerConfig } from "../../../checker-config";
import { aggregateStatus } from "../../status";
import type { EnginePage, RuleResult } from "../../types";
import type { TocEntry } from "../types";
import { detectTables } from "./detection";
import { buildTableCaptionFormatRule } from "./rule-caption-format";
import { buildTableNumberingRule } from "./rule-numbering";
import { buildTablePlacementByReferenceRule } from "./rule-placement";
import { buildTableReferencesRule } from "./rule-references";

export function buildTablesNode(
  pages: EnginePage[],
  config: CheckerConfig,
  tocEntries: TocEntry[],
): RuleResult {
  const detection = detectTables(pages, config, tocEntries);
  const children: RuleResult[] = [
    buildTableCaptionFormatRule(detection),
    buildTableNumberingRule(detection),
    buildTableReferencesRule(detection),
    buildTablePlacementByReferenceRule(detection),
  ];

  return {
    id: "tables",
    title: "Оформление таблиц",
    status: aggregateStatus(children),
    message:
      "Проверка названий таблиц, нумерации и ссылок в тексте на основе текстовых блоков PDF.",
    children,
    overlayBoxes: [],
    jumpPageNumbers: [],
    childrenCollapsedByDefault: false,
    countInSummary: false,
  };
}

