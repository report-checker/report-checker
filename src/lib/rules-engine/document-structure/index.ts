import { aggregateStatus } from "../status";
import type { EngineContext, RuleResult } from "../types";
import { detectStructure } from "./detect-structure";
import {
  buildAppendicesNode,
  buildFiguresNode,
  buildNoMainPartHeadingRule,
  buildSectionHeadingsFormatRule,
  buildSectionNumberingSequenceRule,
  buildStructuralElementsNode,
  buildTablesNode,
  buildTitlePageNode,
  buildTocBodyMatchRule,
  buildTocPresenceRule,
} from "./rules";

export { detectStructure };
export type {
  DetectedStructure,
  FoundElement,
  FoundHeading,
  TocEntry,
} from "./types";

export function buildDocumentStructureNode(context: EngineContext): RuleResult {
  const structure = detectStructure(context.pages, context.config);

  const children: RuleResult[] = [
    buildTitlePageNode(structure, context.config),
    buildTocPresenceRule(structure),
    buildStructuralElementsNode(structure),
    buildSectionHeadingsFormatRule(structure),
    buildSectionNumberingSequenceRule(structure),
    buildTocBodyMatchRule(structure),
    buildNoMainPartHeadingRule(structure),
    buildAppendicesNode(context.pages, context.config, structure),
    buildFiguresNode(context.pages, context.config, structure.tocEntries),
    buildTablesNode(context.pages, context.config, structure.tocEntries),
  ];

  return {
    id: "document-structure",
    title: "Структура документа",
    status: aggregateStatus(children),
    message:
      "Проверка наличия и оформления структурных элементов.",
    children,
    overlayBoxes: [],
    jumpPageNumbers: [],
    childrenCollapsedByDefault: false,
    countInSummary: false,
  };
}
