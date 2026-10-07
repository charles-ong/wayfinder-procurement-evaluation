// Text pulled from a tender PDF carries each page's running header, page number
// and the extractor's "-- N of M --" marker, and they land mid-clause wherever a
// clause crosses a page. Left in, they break a requirement in two and stop it
// matching its source.

const PAGE_MARKER = /^-- \d+ of \d+ --$/;
const PAGE_NUMBER = /^\d+$/;
// Running headers sit in the first few lines of a page; looking further down
// would start catching body text that happens to repeat.
const HEADER_WINDOW = 3;

const leadingLineIndexes = (lines: readonly string[]): number[] =>
  lines
    .map((line, index) => ({ line: line.trim(), index }))
    .filter(({ line }) => line.length > 0)
    .slice(0, HEADER_WINDOW)
    .map(({ index }) => index);

const splitPages = (text: string): string[][] => {
  const pages: string[][] = [[]];
  for (const line of text.split("\n")) {
    if (PAGE_MARKER.test(line.trim())) {
      pages.push([]);
      continue;
    }
    pages[pages.length - 1]?.push(line);
  }
  return pages;
};

const findRunningHeaders = (pages: readonly string[][]): Set<string> => {
  const pageCounts = new Map<string, number>();
  for (const lines of pages) {
    const leading = new Set(leadingLineIndexes(lines).map((index) => (lines[index] ?? "").trim()));
    for (const line of leading) pageCounts.set(line, (pageCounts.get(line) ?? 0) + 1);
  }
  const threshold = Math.max(2, Math.ceil(pages.length / 2));
  return new Set([...pageCounts].filter(([, count]) => count >= threshold).map(([line]) => line));
};

export const removePageFurniture = (text: string): string => {
  const pages = splitPages(text);
  if (pages.length === 1) return text;

  const runningHeaders = findRunningHeaders(pages);
  const isFurniture = (line: string): boolean => runningHeaders.has(line) || PAGE_NUMBER.test(line);
  return pages
    .map((lines) => {
      const removable = new Set(leadingLineIndexes(lines).filter((index) => isFurniture((lines[index] ?? "").trim())));
      return lines.filter((_, index) => !removable.has(index)).join("\n");
    })
    .join("\n");
};

// "4. Overarching Principles" starts a section; "4.1. Standards" and a sentence
// that wraps onto a line beginning "2. per cent" do not.
const TOP_LEVEL_HEADING = /^\d+\.\s+[A-Z]/;

const splitLinesKeepingBreaks = (text: string): string[] => text.match(/[^\n]*\n|[^\n]+$/g) ?? [];

const splitAtHeadings = (text: string): string[] => {
  const sections: string[] = [];
  for (const line of splitLinesKeepingBreaks(text)) {
    if (sections.length === 0 || TOP_LEVEL_HEADING.test(line)) {
      sections.push(line);
      continue;
    }
    sections[sections.length - 1] += line;
  }
  return sections;
};

const packGreedily = (pieces: readonly string[], maxChars: number): string[] => {
  const parts: string[] = [];
  for (const piece of pieces) {
    const last = parts[parts.length - 1];
    if (last !== undefined && last.length + piece.length <= maxChars) {
      parts[parts.length - 1] = last + piece;
      continue;
    }
    parts.push(piece);
  }
  return parts;
};

// One model call cannot return every requirement of a long SOR, so the text is
// cut at top-level headings into parts of at most maxChars; a section longer
// than that is cut at line breaks. The parts rejoin to the original text.
export const splitIntoSections = (text: string, maxChars: number): string[] => {
  if (text.length <= maxChars) return [text];
  const pieces = splitAtHeadings(text).flatMap((section) =>
    section.length <= maxChars ? [section] : packGreedily(splitLinesKeepingBreaks(section), maxChars),
  );
  return packGreedily(pieces, maxChars);
};
