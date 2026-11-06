// Drag-to-fill and paste helpers: moving formulas and continuing number series.

import { columnToLetters, lettersToColumn, toAddress, type CellPosition, type CellRange } from "./cellAddress";
import type { CellChange } from "./sheet";
import { tokenize } from "./tokenizer";

/**
 * Moves the relative references in a formula, the way a spreadsheet does when
 * you copy a formula to another cell.
 *   shiftFormula("=A1+$B$1", 1, 0)  →  "=A2+$B$1"
 * A "$" pins the column or row so it doesn't move. References pushed off the
 * top or left edge become #REF!. Non-formulas are returned unchanged.
 */
export function shiftFormula(raw: string, rowOffset: number, colOffset: number): string {
  if (!raw.startsWith("=")) return raw;

  let tokens;
  try {
    tokens = tokenize(raw);
  } catch {
    return raw; // a broken formula is copied as-is
  }

  let result = "";
  let copiedUpTo = 0;
  for (const token of tokens) {
    if (token.type !== "cell") continue;
    const original = raw.slice(token.start, token.start + token.text.length);
    result += raw.slice(copiedUpTo, token.start) + shiftReference(original, rowOffset, colOffset);
    copiedUpTo = token.start + token.text.length;
  }
  return result + raw.slice(copiedUpTo);
}

function shiftReference(reference: string, rowOffset: number, colOffset: number): string {
  const match = /^(\$?)([A-Za-z]+)(\$?)(\d+)$/.exec(reference)!;
  const [, colPinned, letters, rowPinned, digits] = match;

  const col = colPinned ? lettersToColumn(letters) : lettersToColumn(letters) + colOffset;
  const row = rowPinned ? Number(digits) - 1 : Number(digits) - 1 + rowOffset;
  if (col < 0 || row < 0) return "#REF!";
  return `${colPinned}${columnToLetters(col)}${rowPinned}${row + 1}`;
}

/**
 * Works out what to write into the new cells when the user drags the fill handle
 * from `source` to `target` (target includes source and extends it in one direction).
 *
 * Along each row/column of the source:
 * - formulas are copied with their references moved,
 * - two or more numbers continue as a series (1, 2 → 3, 4, 5),
 * - everything else repeats in a cycle.
 */
export function buildFillChanges(
  source: CellRange,
  target: CellRange,
  getRaw: (address: string) => string,
): CellChange[] {
  const vertical = target.start.row < source.start.row || target.end.row > source.end.row;
  const changes: CellChange[] = [];

  // A "line" is one column (when filling up/down) or one row (when filling left/right).
  const lineStart = vertical ? source.start.col : source.start.row;
  const lineEnd = vertical ? source.end.col : source.end.row;
  const sourceFirst = vertical ? source.start.row : source.start.col;
  const sourceLast = vertical ? source.end.row : source.end.col;
  const targetFirst = vertical ? target.start.row : target.start.col;
  const targetLast = vertical ? target.end.row : target.end.col;
  const length = sourceLast - sourceFirst + 1;

  // Converts (line, step) back into a cell position.
  const positionOf = (line: number, step: number): CellPosition =>
    vertical ? { row: step, col: line } : { row: line, col: step };

  for (let line = lineStart; line <= lineEnd; line++) {
    const sourceRaws: string[] = [];
    for (let step = sourceFirst; step <= sourceLast; step++) {
      sourceRaws.push(getRaw(toAddress(positionOf(line, step))));
    }
    const series = numberSeries(sourceRaws);

    for (let step = targetFirst; step <= targetLast; step++) {
      if (step >= sourceFirst && step <= sourceLast) continue; // the source itself

      const address = toAddress(positionOf(line, step));
      if (series) {
        const value = series.first + series.step * (step - sourceFirst);
        changes.push({ address, raw: String(parseFloat(value.toPrecision(12))) });
        continue;
      }

      // Which source cell does this new cell copy? Repeat the source pattern in both directions.
      const index = (((step - sourceFirst) % length) + length) % length;
      const raw = sourceRaws[index];
      const distance = step - (sourceFirst + index);
      changes.push({
        address,
        raw: vertical ? shiftFormula(raw, distance, 0) : shiftFormula(raw, 0, distance),
      });
    }
  }
  return changes;
}

/** Returns the start and step if every value is a plain number and there are at least two. */
function numberSeries(raws: string[]): { first: number; step: number } | null {
  if (raws.length < 2) return null;
  const numbers = raws.map((raw) => (raw.trim() === "" ? NaN : Number(raw)));
  if (numbers.some(isNaN)) return null;
  const step = (numbers[numbers.length - 1] - numbers[0]) / (numbers.length - 1);
  return { first: numbers[0], step };
}
