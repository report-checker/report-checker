import { describe, expect, it } from "vitest";
import type { CheckerConfig } from "../../checker-config";
import { normalizeCheckerConfig } from "../../checker-config";
import parsedFixture from "../__fixtures__/parsed/margins-group.json";
import { evaluateParsedPdf } from "../engine";
import { summarizeRules } from "../status";
import type { ParsedPdfResult, RuleResult } from "../types";

function findRuleNodeById(nodes: RuleResult[], id: string): RuleResult | null {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }

    const nested = findRuleNodeById(node.children, id);
    if (nested) {
      return nested;
    }
  }

  return null;
}

function fixtureParsed(): ParsedPdfResult {
  return parsedFixture.parsed as unknown as ParsedPdfResult;
}

function fixtureConfig(): CheckerConfig {
  return normalizeCheckerConfig(parsedFixture.config);
}

describe("rule settings", () => {
  it("migrates legacy rule maps into unified rules config", () => {
    const normalized = normalizeCheckerConfig({
      ...parsedFixture.config,
      ruleEnabled: {
        "margin-left": false,
      },
      ruleSeverities: {
        "page-format-a4": "warning",
      },
    });

    expect(normalized.rules["margin-left"]?.enabled).toBe(false);
    expect(normalized.rules["page-format"]?.severity).toBe("warning");
  });

  it("applies enabled flag from unified per-rule config", () => {
    const config = fixtureConfig();
    config.rules = {
      "margin-right": {
        enabled: false,
      },
    };

    const result = evaluateParsedPdf(fixtureParsed(), config);
    const marginRight = findRuleNodeById(result.rules, "margin-right");
    expect(marginRight).toBeNull();
  });

  it("takes summary counting from unified per-rule config", () => {
    const config = fixtureConfig();
    config.rules = {
      "margin-right": {
        enabled: true,
        severity: "error",
        countInSummary: true,
      },
    };

    const result = evaluateParsedPdf(fixtureParsed(), config);
    const summary = summarizeRules(result.rules);
    expect(summary).toEqual({
      pass: 0,
      fail: 1,
      warn: 0,
      total: 1,
    });
  });
});
