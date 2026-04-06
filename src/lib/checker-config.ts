import configJson from "./checker.config.json";

export type MarginsConfig = {
  leftCm: number;
  rightCm: number;
  topCm: number;
  bottomCm: number;
  toleranceCm: number;
};

export type PageFormatConfig = {
  widthCm: number;
  heightCm: number;
  toleranceCm: number;
};

export type TypographyConfig = {
  minFontSizePt: number;
  fontSizeTolerancePt: number;
  expectedLineSpacing: number;
  lineSpacingTolerance: number;
  lineSpacingComparisonEpsilon: number;
  lineSpacingPageFailMinViolations: number;
  lineSpacingPageFailRatioThreshold: number;
  linePairMaxFactor: number;
  minOverlapRatio: number;
  indentExpectedCm: number;
  indentToleranceCm: number;
  indentDetectionMinCm: number;
  indentDetectionMaxCm: number;
  paragraphBreakFactor: number;
  alignRightToleranceCm: number;
  bodyFontTolerancePt: number;
  minBodyLineWidthRatio: number;
  blackChannelMax: number;
  nonBlackWarnRatio: number;
  nonBlackFailRatio: number;
};

export type PageNumberingConfig = {
  baselineGroupTolerancePt: number;
  mergeDigitGapPt: number;
  patternBandPaddingPt: number;
};

export type DocumentStructureConfig = {
  structuralElementNames: string[];
  requiredStructuralElements: { name: string; id: string }[];
  sectionHeadingMinFontPt: number;
  sectionHeadingExpectedFontPt: number;
  sectionHeadingFontTolerancePt: number;
  centerToleranceCm: number;
  figureCaptionObjectMaxGapCm: number;
  figureCaptionObjectMaxCenterDistanceCm: number;
  tableCaptionContentMaxGapCm: number;
  tableCaptionLeftToleranceCm: number;
  tableContinuationRightToleranceCm: number;
  tableContinuationTopBandCm: number;
};

export type TitlePageConfig = {
  allowedEducationalPrograms: string[];
  allowedPracticeNames: string[];
  practiceNameRegexes: string[];
  allowedYears: string[];
  studentGroupRegexes: string[];
  studentNamePattern: string;
};

export type RuleSeverity = "error" | "warning";
export type RuleSettings = {
  enabled?: boolean;
  severity?: RuleSeverity;
  countInSummary?: boolean;
};

export type CheckerConfig = {
  marginGeometryEngine: "pdfium";
  showBaselineFilter: boolean;
  margins: MarginsConfig;
  pageFormat: PageFormatConfig;
  typography: TypographyConfig;
  pageNumbering: PageNumberingConfig;
  documentStructure: DocumentStructureConfig;
  titlePage: TitlePageConfig;
  rules: Record<string, RuleSettings>;
};

type LegacyCheckerConfig = CheckerConfig & {
  ruleSeverities?: Record<string, RuleSeverity>;
  ruleEnabled?: Record<string, boolean>;
};

const fallbackConfig = configJson as CheckerConfig;

const LEGACY_RULE_ID_ALIASES: Record<string, string> = {
  "page-format-a4": "page-format",
  "font-size-min-12pt": "font-size",
  "font-color-black": "font-color",
  "line-spacing-1-5": "line-spacing",
  "paragraph-indent-1-25": "paragraph-indent",
  "text-alignment-justify": "text-alignment",
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function mergeSection<T extends object>(defaults: T, value: unknown): T {
  if (!isObjectRecord(value)) {
    return { ...defaults };
  }

  return { ...defaults, ...(value as Partial<T>) };
}

function normalizeRuleId(rawRuleId: string): string {
  return LEGACY_RULE_ID_ALIASES[rawRuleId] ?? rawRuleId;
}

function normalizeRuleSettings(value: unknown): RuleSettings {
  if (!isObjectRecord(value)) {
    return {};
  }

  const ruleSettings: RuleSettings = {};
  if (typeof value.enabled === "boolean") {
    ruleSettings.enabled = value.enabled;
  }
  if (value.severity === "error" || value.severity === "warning") {
    ruleSettings.severity = value.severity;
  }
  if (typeof value.countInSummary === "boolean") {
    ruleSettings.countInSummary = value.countInSummary;
  }

  return ruleSettings;
}

function setRuleSettings(
  target: Record<string, RuleSettings>,
  rawRuleId: string,
  patch: RuleSettings,
): void {
  const ruleId = normalizeRuleId(rawRuleId.trim());
  if (!ruleId) {
    return;
  }

  const defaults: RuleSettings = {
    enabled: true,
    severity: "error",
    countInSummary: false,
  };

  target[ruleId] = {
    ...defaults,
    ...(target[ruleId] ?? {}),
    ...patch,
  };
}

function normalizeRules(
  rules: unknown,
  legacyEnabled: unknown,
  legacySeverities: unknown,
  defaultRules: Record<string, RuleSettings>,
): Record<string, RuleSettings> {
  const normalized: Record<string, RuleSettings> = {};

  for (const [ruleId, defaults] of Object.entries(defaultRules)) {
    setRuleSettings(normalized, ruleId, normalizeRuleSettings(defaults));
  }

  if (isObjectRecord(rules)) {
    for (const [ruleId, value] of Object.entries(rules)) {
      setRuleSettings(normalized, ruleId, normalizeRuleSettings(value));
    }
  }

  if (isObjectRecord(legacyEnabled)) {
    for (const [ruleId, enabled] of Object.entries(legacyEnabled)) {
      if (typeof enabled === "boolean") {
        setRuleSettings(normalized, ruleId, { enabled });
      }
    }
  }

  if (isObjectRecord(legacySeverities)) {
    for (const [ruleId, severity] of Object.entries(legacySeverities)) {
      if (severity === "error" || severity === "warning") {
        setRuleSettings(normalized, ruleId, { severity });
      }
    }
  }

  return normalized;
}

function isMarginGeometryEngine(
  value: unknown,
): value is CheckerConfig["marginGeometryEngine"] {
  return value === "pdfium";
}

export function normalizeCheckerConfig(raw: unknown): CheckerConfig {
  const config = isObjectRecord(raw)
    ? (raw as Partial<LegacyCheckerConfig>)
    : {};

  return {
    marginGeometryEngine: isMarginGeometryEngine(config.marginGeometryEngine)
      ? config.marginGeometryEngine
      : fallbackConfig.marginGeometryEngine,
    showBaselineFilter:
      typeof config.showBaselineFilter === "boolean"
        ? config.showBaselineFilter
        : fallbackConfig.showBaselineFilter,
    margins: mergeSection(fallbackConfig.margins, config.margins),
    pageFormat: mergeSection(fallbackConfig.pageFormat, config.pageFormat),
    typography: mergeSection(fallbackConfig.typography, config.typography),
    pageNumbering: mergeSection(
      fallbackConfig.pageNumbering,
      config.pageNumbering,
    ),
    documentStructure: mergeSection(
      fallbackConfig.documentStructure,
      config.documentStructure,
    ),
    titlePage: mergeSection(fallbackConfig.titlePage, config.titlePage),
    rules: normalizeRules(
      config.rules,
      config.ruleEnabled,
      config.ruleSeverities,
      fallbackConfig.rules,
    ),
  };
}

export const defaultCheckerConfig: CheckerConfig =
  normalizeCheckerConfig(configJson);
