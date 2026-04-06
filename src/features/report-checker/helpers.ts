import type { PreviewHighlight } from "@/components/pdf-preview";
import type {
  CheckSummary,
  FileCheckResult,
  OverlayBox,
  RuleResult,
} from "@/lib/report-checker";

export function makeFileKey(file: { name: string; size: number }): string {
  return `${file.name}-${file.size}`;
}

export function makeResultKey(result: FileCheckResult): string {
  return `${result.fileName}-${result.fileSizeBytes}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function statusBadgeClassName(status: RuleResult["status"]): string {
  if (status === "pass") {
    return "border-emerald-200 bg-emerald-100 text-emerald-800";
  }
  if (status === "fail") {
    return "border-red-200 bg-red-100 text-red-800";
  }
  return "border-amber-200 bg-amber-100 text-amber-800";
}

export function statusLabel(status: RuleResult["status"]): string {
  if (status === "pass") {
    return "OK";
  }
  if (status === "fail") {
    return "FAIL";
  }
  return "WARN";
}

function uniqueSorted(numbers: number[]): number[] {
  return Array.from(new Set(numbers)).sort((a, b) => a - b);
}

function dedupeOverlayBoxes(boxes: OverlayBox[]): OverlayBox[] {
  const seen = new Set<string>();
  const unique: OverlayBox[] = [];

  for (const box of boxes) {
    const key = [
      box.pageNumber,
      box.pageBox.left,
      box.pageBox.bottom,
      box.pageBox.right,
      box.pageBox.top,
      box.rect.left,
      box.rect.bottom,
      box.rect.right,
      box.rect.top,
      box.style.borderColor,
      box.style.fillColor,
      box.style.borderWidth,
      box.style.dashed ? "1" : "0",
    ].join("|");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(box);
  }

  return unique;
}

function collectHighlightLeaves(
  node: RuleResult,
): Array<{ overlayBoxes: OverlayBox[]; jumpPageNumbers: number[] }> {
  if (node.overlayBoxes.length > 0) {
    return [
      {
        overlayBoxes: node.overlayBoxes,
        jumpPageNumbers:
          node.jumpPageNumbers.length > 0
            ? uniqueSorted(node.jumpPageNumbers)
            : uniqueSorted(node.overlayBoxes.map((box) => box.pageNumber)),
      },
    ];
  }

  return node.children.flatMap((child) => collectHighlightLeaves(child));
}

export function collectSubtreeNodes(node: RuleResult): RuleResult[] {
  const nodes: RuleResult[] = [node];
  for (const child of node.children) {
    nodes.push(...collectSubtreeNodes(child));
  }
  return nodes;
}

export function nodeIsFullySaved(
  node: RuleResult,
  fileName: string,
  hasBaseline: (fileName: string, ruleId: string, message: string) => boolean,
): boolean {
  if (!hasBaseline(fileName, node.id, node.message)) {
    return false;
  }
  return node.children.every((child) =>
    nodeIsFullySaved(child, fileName, hasBaseline),
  );
}

export function nodeHasDifferences(
  node: RuleResult,
  fileName: string,
  hasBaseline: (fileName: string, ruleId: string, message: string) => boolean,
): boolean {
  if (!hasBaseline(fileName, node.id, node.message)) {
    return true;
  }
  return node.children.some((child) =>
    nodeHasDifferences(child, fileName, hasBaseline),
  );
}

export function computeFilteredSummary(
  rules: RuleResult[],
  fileName: string,
  hasBaseline: (fileName: string, ruleId: string, message: string) => boolean,
): CheckSummary {
  let pass = 0;
  let fail = 0;
  let warn = 0;

  const walk = (node: RuleResult) => {
    if (
      node.countInSummary &&
      !hasBaseline(fileName, node.id, node.message)
    ) {
      if (node.status === "pass") pass++;
      else if (node.status === "fail") fail++;
      else warn++;
    }
    for (const child of node.children) {
      walk(child);
    }
  };

  for (const rule of rules) {
    walk(rule);
  }

  return { pass, fail, warn, total: pass + fail + warn };
}

export function toPreviewHighlight(node: RuleResult): PreviewHighlight | null {
  const leaves = collectHighlightLeaves(node);
  if (leaves.length === 0) {
    return null;
  }

  const overlayBoxes = dedupeOverlayBoxes(
    leaves.flatMap((leaf) => leaf.overlayBoxes),
  );
  const jumpPageNumbers = uniqueSorted(
    leaves.flatMap((leaf) => leaf.jumpPageNumbers),
  );
  const fallbackJumpPages =
    jumpPageNumbers.length > 0
      ? jumpPageNumbers
      : uniqueSorted(overlayBoxes.map((box) => box.pageNumber));

  return {
    status: node.status,
    jumpPageNumbers: fallbackJumpPages,
    overlayBoxes,
  };
}
