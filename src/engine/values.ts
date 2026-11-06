// The kinds of values a cell can hold after it has been calculated.

/** Error codes shown inside a cell, matching what Excel and Google Sheets use. */
export type ErrorCode =
  | "#ERROR!" // the formula could not be parsed
  | "#NAME?" // unknown function or name
  | "#REF!" // reference to a cell outside the grid
  | "#VALUE!" // wrong type of value, e.g. "abc" + 1
  | "#DIV/0!" // division by zero
  | "#N/A" // lookup found nothing
  | "#NUM!" // invalid number, e.g. SQRT(-1)
  | "#CIRC!"; // circular reference

/**
 * An error value. It is stored in a cell like any other value, so formulas
 * that read the cell can pass the error along (=A1+1 where A1 is #DIV/0!).
 */
export class CellError {
  constructor(
    public readonly code: ErrorCode,
    /** A plain-English explanation shown under the formula bar. */
    public readonly message: string,
    /** The cell where the error started, if it came from another cell. */
    public readonly origin?: string,
  ) {}

  /** Returns a copy that remembers which cell the error came from. */
  withOrigin(address: string): CellError {
    return this.origin ? this : new CellError(this.code, this.message, address);
  }
}

/** null means the cell is empty. */
export type CellValue = number | string | boolean | null | CellError;

/** A block of values, produced by a range like A1:B3. Only functions accept these. */
export interface RangeValue {
  kind: "range";
  /** values[row][col], relative to the top-left corner of the range */
  values: CellValue[][];
}

/** What a function receives for each argument. */
export type ArgumentValue = CellValue | RangeValue;

export function isRange(value: ArgumentValue): value is RangeValue {
  return typeof value === "object" && value !== null && "kind" in value && value.kind === "range";
}

export function isError(value: unknown): value is CellError {
  return value instanceof CellError;
}

/**
 * Turns what the user typed into a value: "12" → 12, "true" → true, "hi" → "hi".
 * Formulas (starting with "=") are handled elsewhere.
 */
export function parseLiteralInput(raw: string): CellValue {
  const text = raw.trim();
  if (text === "") return null;
  if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(text)) return Number(text);
  const upper = text.toUpperCase();
  if (upper === "TRUE") return true;
  if (upper === "FALSE") return false;
  return raw;
}

/** How a value is displayed inside a grid cell. */
export function formatValue(value: CellValue): string {
  if (value === null) return "";
  if (value instanceof CellError) return value.code;
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return formatNumber(value);
  return value;
}

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  // Hide floating-point noise like 0.1 + 0.2 = 0.30000000000000004
  return String(parseFloat(n.toPrecision(12)));
}
