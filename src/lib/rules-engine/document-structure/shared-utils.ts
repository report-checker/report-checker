import type { PdfRect } from "../types";

export type ParsedStructuredNumber =
  | {
      scheme: "continuous";
      continuousIndex: number;
      sectionIndex: null;
      sectionItemIndex: null;
    }
  | {
      scheme: "sectioned";
      continuousIndex: null;
      sectionIndex: number;
      sectionItemIndex: number;
    };

export function parseStructuredNumber(
  raw: string,
): ParsedStructuredNumber | null {
  const trimmed = raw.trim();
  if (/^\d+$/u.test(trimmed)) {
    const value = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(value) || value <= 0) {
      return null;
    }

    return {
      scheme: "continuous",
      continuousIndex: value,
      sectionIndex: null,
      sectionItemIndex: null,
    };
  }

  const sectionMatch = /^(\d+)\.(\d+)$/u.exec(trimmed);
  if (!sectionMatch) {
    return null;
  }

  const sectionIndex = Number.parseInt(sectionMatch[1], 10);
  const sectionItemIndex = Number.parseInt(sectionMatch[2], 10);
  if (
    !Number.isFinite(sectionIndex) ||
    !Number.isFinite(sectionItemIndex) ||
    sectionIndex <= 0 ||
    sectionItemIndex <= 0
  ) {
    return null;
  }

  return {
    scheme: "sectioned",
    continuousIndex: null,
    sectionIndex,
    sectionItemIndex,
  };
}

export function compareByDocumentOrder(
  leftPageNumber: number,
  leftCenterY: number,
  rightPageNumber: number,
  rightCenterY: number,
): number {
  if (leftPageNumber !== rightPageNumber) {
    return leftPageNumber - rightPageNumber;
  }

  // On a page, higher Y appears earlier in reading order.
  return rightCenterY - leftCenterY;
}

export function sortByDocumentOrder<
  T extends { pageNumber: number; centerY: number },
>(values: T[]): T[] {
  return values
    .slice()
    .sort((left, right) =>
      compareByDocumentOrder(
        left.pageNumber,
        left.centerY,
        right.pageNumber,
        right.centerY,
      ),
    );
}

export function pushMapEntry<T>(
  map: Map<string, T[]>,
  key: string,
  value: T,
): void {
  const existing = map.get(key);
  if (existing) {
    existing.push(value);
    return;
  }

  map.set(key, [value]);
}

export function flattenMapValues<T>(map: Map<string, T[]>): T[] {
  return [...map.values()].flat();
}

export function isCenteredWithinTolerance(
  bounds: PdfRect,
  referenceBox: PdfRect,
  tolerancePt: number,
): boolean {
  const lineCenterX = (bounds.left + bounds.right) / 2;
  const areaCenterX = (referenceBox.left + referenceBox.right) / 2;
  return Math.abs(lineCenterX - areaCenterX) <= tolerancePt;
}
