export const TOC_ENTRY_REGEX = /^(.+?)[.\s]+(\d(?:\s*\d)*)\s*$/;
export const TOC_ENTRY_NUMBER_BEFORE_DOTS_REGEX =
  /^(.+?)\s+(\d(?:\s*\d)*)(?:[.\s·•…⋯]+)+$/;
export const TOC_DOT_LEADER_ONLY_REGEX = /^[.\s·•…⋯]+$/;
export const TOC_PAGE_NUMBER_ONLY_REGEX = /^\d(?:\s*\d)*$/;
// Allow either: a period (optionally followed by spaces) or one/more spaces between number and title.
// This handles both "2.6 Title" and "2.6.Title" (no space before title).
export const SECTION_NUMBER_REGEX = /^(\d+(?:\.\d+)*)(?:(\.)\s*|\s+)(\S.*)/;
export const PERIOD_AT_END_REGEX = /\.\s*$/;
