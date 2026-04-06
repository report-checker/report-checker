import type { CheckSummary, RuleResult, RuleStatus } from "./types";

export function aggregateStatus(children: RuleResult[]): RuleStatus {
  let hasWarn = false;

  for (const child of children) {
    if (child.status === "fail") {
      return "fail";
    }
    if (child.status === "warn") {
      hasWarn = true;
    }
  }

  return hasWarn ? "warn" : "pass";
}

export function summarizeRules(nodes: RuleResult[]): CheckSummary {
  let pass = 0;
  let fail = 0;
  let warn = 0;

  for (const node of nodes) {
    if (node.countInSummary) {
      if (node.status === "pass") {
        pass += 1;
      } else if (node.status === "fail") {
        fail += 1;
      } else {
        warn += 1;
      }
      continue;
    }

    if (node.children.length > 0) {
      const nested = summarizeRules(node.children);
      pass += nested.pass;
      fail += nested.fail;
      warn += nested.warn;
    }
  }

  return { pass, fail, warn, total: pass + fail + warn };
}
