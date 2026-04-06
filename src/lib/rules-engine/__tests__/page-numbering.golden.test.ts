import { describe, expect, it } from "vitest";
import expectedFixture from "../__fixtures__/expected/page-numbering-group.json";
import parsedFixture from "../__fixtures__/parsed/page-numbering-group.json";
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

describe("golden:page-numbering", () => {
  it("matches expected page numbering output", () => {
    const result = evaluateParsedPdf(
      parsedFixture.parsed,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      parsedFixture.config as any,
    );

    const pageNumbering = findRuleNodeById(result.rules, "page-numbering");
    expect(pageNumbering).not.toBeNull();

    const projection = {
      note: result.note ?? null,
      pageNumbering: {
        status: pageNumbering?.status,
        message: pageNumbering?.message,
        failedRuleIds: pageNumbering?.children.map((child) => child.id) ?? [],
        hasFirstPageFailure:
          pageNumbering?.children.some(
            (child) => child.id === "page-numbering-page-1",
          ) ?? false,
        jumpPageNumbers: pageNumbering?.jumpPageNumbers ?? [],
      },
    };

    expect(projection).toEqual(expectedFixture);
  });
});
