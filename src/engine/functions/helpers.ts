// Small conversion helpers shared by all spreadsheet functions.

import { CellError, isError, isRange, type ArgumentValue, type CellValue } from "../values";

/**
 * Describes one spreadsheet function. Every function receives its arguments
 * already evaluated. Cell references like A1 arrive as a 1×1 range, so
 * functions such as SUM can ignore text in a referenced cell (like Excel does),
 * while functions that want a single value call `single()` to unwrap it.
 */
export interface FunctionDefinition {
  name: string;
  category: "Math" | "Logical" | "Lookup" | "Text";
  syntax: string;
  description: string;
  minArgs: number;
  maxArgs: number; // use Infinity for "any number"
  call: (args: ArgumentValue[]) => CellValue;
}

/** Unwraps a 1×1 range to its value. Bigger ranges are a #VALUE! error. */
export function single(arg: ArgumentValue | undefined): CellValue {
  if (arg === undefined) return null;
  if (!isRange(arg)) return arg;
  if (arg.values.length === 1 && arg.values[0].length === 1) return arg.values[0][0];
  return new CellError("#VALUE!", "Expected a single cell here, but got a range of several cells.");
}

/** Converts a value to a number, the way arithmetic does. */
export function toNumber(value: CellValue): number | CellError {
  if (isError(value)) return value;
  if (value === null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  const trimmed = value.trim();
  if (trimmed !== "" && !isNaN(Number(trimmed))) return Number(trimmed);
  return new CellError("#VALUE!", `Expected a number, but got the text "${value}".`);
}

export function toText(value: CellValue): string | CellError {
  if (isError(value)) return value;
  if (value === null) return "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return String(parseFloat(value.toPrecision(12)));
  return value;
}

export function toBoolean(value: CellValue): boolean | CellError {
  if (isError(value)) return value;
  if (value === null) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const upper = value.trim().toUpperCase();
  if (upper === "TRUE") return true;
  if (upper === "FALSE") return false;
  return new CellError("#VALUE!", `Expected TRUE or FALSE, but got the text "${value}".`);
}

/** Reads an argument as a number (unwrapping single cells). */
export function numberArg(arg: ArgumentValue | undefined, fallback?: number): number | CellError {
  if (arg === undefined && fallback !== undefined) return fallback;
  return toNumber(single(arg));
}

export function textArg(arg: ArgumentValue | undefined): string | CellError {
  return toText(single(arg));
}

/** Every value from every argument, flattened into one list. */
export function allValues(args: ArgumentValue[]): CellValue[] {
  const result: CellValue[] = [];
  for (const arg of args) {
    if (isRange(arg)) {
      for (const row of arg.values) result.push(...row);
    } else {
      result.push(arg);
    }
  }
  return result;
}

/**
 * Collects numbers for SUM, AVERAGE, etc.
 * - Inside ranges (and referenced cells), only real numbers count; text and blanks are skipped.
 * - Values typed directly into the formula, like SUM(1, "2", TRUE), are converted.
 * - The first error found is returned instead.
 */
export function collectNumbers(args: ArgumentValue[]): number[] | CellError {
  const numbers: number[] = [];
  for (const arg of args) {
    if (isRange(arg)) {
      for (const row of arg.values) {
        for (const value of row) {
          if (isError(value)) return value;
          if (typeof value === "number") numbers.push(value);
        }
      }
    } else {
      const n = toNumber(arg);
      if (isError(n)) return n;
      numbers.push(n);
    }
  }
  return numbers;
}

/**
 * Compares two values: returns a negative number, zero, or a positive number.
 * Text is compared without caring about upper/lower case. Different types are
 * ordered numbers < text < booleans, like in Excel. Blank counts as 0 or "".
 */
export function compareValues(a: CellValue, b: CellValue): number {
  if (a === null && b === null) return 0;
  if (a === null) a = blankLike(b);
  if (b === null) b = blankLike(a);

  const rank = (v: CellValue) => (typeof v === "number" ? 0 : typeof v === "string" ? 1 : 2);
  if (rank(a) !== rank(b)) return rank(a) - rank(b);

  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "string" && typeof b === "string") {
    const x = a.toLowerCase();
    const y = b.toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  }
  return Number(a) - Number(b); // booleans: FALSE < TRUE
}

function blankLike(other: CellValue): CellValue {
  if (typeof other === "string") return "";
  if (typeof other === "boolean") return false;
  return 0;
}

/**
 * Turns a criteria like ">50", "<>apple", "Stationery" or 10 into a test function.
 * Used by SUMIF, COUNTIF and AVERAGEIF.
 */
export function makeCriteria(criteria: CellValue): (value: CellValue) => boolean {
  if (typeof criteria === "number" || typeof criteria === "boolean") {
    return (value) => value === criteria;
  }
  const text = criteria === null || isError(criteria) ? "" : criteria;
  const match = /^(<=|>=|<>|<|>|=)?(.*)$/s.exec(text)!;
  const operator = match[1] ?? "=";
  const operandText = match[2];

  // Compare as numbers when the operand looks like a number ("50" in ">50").
  const isNumeric = operandText.trim() !== "" && !isNaN(Number(operandText));
  const operand: CellValue = isNumeric ? Number(operandText) : operandText;

  return (value) => {
    if (isError(value)) return false;
    // Blank operand ("=" or "") matches empty cells.
    if (operandText === "") {
      const empty = value === null || value === "";
      return operator === "<>" ? !empty : empty;
    }
    // A number criteria only matches numbers, and text only matches text.
    if (isNumeric ? typeof value !== "number" : typeof value !== "string") {
      return operator === "<>";
    }
    const diff = compareValues(value, operand);
    switch (operator) {
      case "<": return diff < 0;
      case "<=": return diff <= 0;
      case ">": return diff > 0;
      case ">=": return diff >= 0;
      case "<>": return diff !== 0;
      default: return diff === 0;
    }
  };
}
