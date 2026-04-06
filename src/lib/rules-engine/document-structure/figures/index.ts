import type { CheckerConfig } from "../../../checker-config";
import { aggregateStatus } from "../../status";
import type { EnginePage, RuleResult } from "../../types";
import type { TocEntry } from "../types";
import { detectFigures } from "./detection";
import { buildFigureCaptionFormatRule } from "./rule-caption-format";
import { buildFigureNumberingRule } from "./rule-numbering";
import { buildFigurePlacementByReferenceRule } from "./rule-placement";
import { buildFigureReferencesRule } from "./rule-references";

export function buildFiguresNode(
  pages: EnginePage[],
  config: CheckerConfig,
  tocEntries: TocEntry[],
): RuleResult {
  const detection = detectFigures(pages, config, tocEntries);
  const children: RuleResult[] = [
    buildFigureCaptionFormatRule(detection),
    buildFigureNumberingRule(detection),
    buildFigureReferencesRule(detection),
    buildFigurePlacementByReferenceRule(detection),
  ];

  return {
    id: "figures",
    title: "Оформление рисунков",
    status: aggregateStatus(children),
    message:
      "Проверка подписей рисунков, нумерации и ссылок в тексте.",
    children,
    overlayBoxes: [],
    jumpPageNumbers: [],
    childrenCollapsedByDefault: false,
    countInSummary: false,
  };
}
