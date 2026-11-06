// Helpers for converting between "B3"-style addresses and row/column numbers.
// Rows and columns are zero-based inside the code (A1 is row 0, col 0)
// and only become "1-based" when shown to the user.

export const ROW_COUNT = 1000;
export const COLUMN_COUNT = 26; // A to Z → 26,000 cells in total

export interface CellPosition {
  row: number;
  col: number;
}

/** 0 → "A", 25 → "Z", 26 → "AA" */
export function columnToLetters(col: number): string {
  let letters = "";
  let n = col + 1;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

/** "A" → 0, "Z" → 25, "AA" → 26 */
export function lettersToColumn(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

/** { row: 2, col: 1 } → "B3" */
export function toAddress(pos: CellPosition): string {
  return columnToLetters(pos.col) + (pos.row + 1);
}

/** "B3" or "$B$3" → { row: 2, col: 1 }, or null if it isn't a valid address. */
export function parseAddress(address: string): CellPosition | null {
  const match = /^\$?([A-Za-z]+)\$?(\d+)$/.exec(address);
  if (!match) return null;
  const row = parseInt(match[2], 10) - 1;
  if (row < 0) return null;
  return { row, col: lettersToColumn(match[1]) };
}

export function isInsideGrid(pos: CellPosition): boolean {
  return pos.row >= 0 && pos.row < ROW_COUNT && pos.col >= 0 && pos.col < COLUMN_COUNT;
}

/** A rectangular block of cells. start is always the top-left corner. */
export interface CellRange {
  start: CellPosition;
  end: CellPosition;
}

/** Builds a range from any two corners, in any order. */
export function normalizeRange(a: CellPosition, b: CellPosition): CellRange {
  return {
    start: { row: Math.min(a.row, b.row), col: Math.min(a.col, b.col) },
    end: { row: Math.max(a.row, b.row), col: Math.max(a.col, b.col) },
  };
}

export function rangeToString(range: CellRange): string {
  const start = toAddress(range.start);
  const end = toAddress(range.end);
  return start === end ? start : `${start}:${end}`;
}

/** Lists every address inside a range, row by row. */
export function addressesInRange(range: CellRange): string[] {
  const result: string[] = [];
  for (let row = range.start.row; row <= range.end.row; row++) {
    for (let col = range.start.col; col <= range.end.col; col++) {
      result.push(toAddress({ row, col }));
    }
  }
  return result;
}
