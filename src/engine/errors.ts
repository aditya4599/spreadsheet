/**
 * Thrown by the tokenizer and parser when a formula is written incorrectly.
 * `position` is an index into the full cell text (including the leading "="),
 * so the UI can draw a caret (^) under the exact character.
 */
export class FormulaSyntaxError extends Error {
  constructor(
    message: string,
    public readonly position: number,
    public readonly suggestion?: string,
    /** Shown in the cell. Unknown functions use #NAME?, everything else #ERROR!. */
    public readonly code: "#ERROR!" | "#NAME?" = "#ERROR!",
  ) {
    super(message);
    this.name = "FormulaSyntaxError";
  }
}

/** Builds the two-line "formula + caret" picture used in error messages. */
export function caretDiagram(formula: string, position: number): string {
  const safePosition = Math.max(0, Math.min(position, formula.length));
  return `${formula}\n${" ".repeat(safePosition)}^`;
}

/**
 * Classic edit distance between two words. Used to suggest "Did you mean SUM?"
 * when someone types SUMM. Small inputs only, so the simple O(n·m) table is fine.
 */
export function editDistance(a: string, b: string): number {
  const table: number[][] = [];
  for (let i = 0; i <= a.length; i++) table.push([i]);
  for (let j = 1; j <= b.length; j++) table[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      table[i][j] = Math.min(
        table[i - 1][j] + 1, // delete
        table[i][j - 1] + 1, // insert
        table[i - 1][j - 1] + cost, // replace
      );
    }
  }
  return table[a.length][b.length];
}

/** Finds the closest name from a list, or undefined if nothing is close enough. */
export function closestMatch(word: string, candidates: string[]): string | undefined {
  let best: string | undefined;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = editDistance(word.toUpperCase(), candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  // Only suggest names that are reasonably close (about one typo per 3 letters).
  const limit = Math.max(1, Math.floor(word.length / 3));
  return bestDistance <= limit ? best : undefined;
}
