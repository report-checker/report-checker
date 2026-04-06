import { describe, expect, it } from "vitest";
import expectedFixture from "../__fixtures__/expected/margins-group.json";
import parsedFixture from "../__fixtures__/parsed/margins-group.json";
import { evaluateParsedPdf } from "../engine";
import type { RuleResult } from "../types";

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

describe("golden:margins", () => {
  it("matches expected margin rule output", () => {
    const result = evaluateParsedPdf(
      parsedFixture.parsed,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      parsedFixture.config as any,
    );

    const marginsNode = findRuleNodeById(result.rules, "margins");
    expect(marginsNode).not.toBeNull();

    const left = findRuleNodeById(result.rules, "margin-left");
    const right = findRuleNodeById(result.rules, "margin-right");
    const top = findRuleNodeById(result.rules, "margin-top");
    const bottom = findRuleNodeById(result.rules, "margin-bottom");

    const projection = {
      note: result.note ?? null,
      margins: {
        status: marginsNode?.status,
        ruleStatuses: {
          "margin-left": left?.status,
          "margin-right": right?.status,
          "margin-top": top?.status,
          "margin-bottom": bottom?.status,
        },
        rightRuleMessage: right?.message,
        failedRuleIds: right?.children.map((child) => child.id) ?? [],
        failedMessages: right?.children.map((child) => child.message) ?? [],
      },
    };

    expect(projection).toEqual(expectedFixture);
  });
});
