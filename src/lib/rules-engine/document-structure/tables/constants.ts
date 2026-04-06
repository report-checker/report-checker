export const TABLE_CAPTION_REGEX =
  /^\s*(Таблица)\s*(?:№\s*)?(\d+(?:\.\d+)?)(?:\s*[—–-]\s*(.+?))?\s*$/iu;

export const TABLE_CONTINUATION_REGEX =
  /^\s*(Продолжение\s+таблицы)\s*(?:№\s*)?(\d+(?:\.\d+)?)(?:\s*[—–-]\s*(.+?))?\s*$/iu;

export const TABLE_REFERENCE_REGEX =
  /(табл(?:ица|ице|ицу|ицей|ицей|ицей|ицы|ицам|ицами|ицах)?|табл\.)\s*(?:№\s*)?(\d+(?:\.\d+)?)/giu;

export function isTableCaptionOrContinuationLine(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) {
    return false;
  }
  return (
    TABLE_CAPTION_REGEX.test(normalized) ||
    TABLE_CONTINUATION_REGEX.test(normalized)
  );
}

export function hasTableReferenceInText(text: string): boolean {
  TABLE_REFERENCE_REGEX.lastIndex = 0;
  return TABLE_REFERENCE_REGEX.test(text);
}
