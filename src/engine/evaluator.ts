// Step 3: walk the tree from the parser and compute a value.

import { isInsideGrid, toAddress, type CellPosition } from "./cellAddress";
import { getFunction } from "./functions";
import { compareValues, single, toNumber, toText } from "./functions/helpers";
import type { Expression } from "./parser";
import { CellError, isError, isRange, type ArgumentValue, type CellValue, type RangeValue } from "./values";

/** The evaluator only needs one thing from the sheet: a way to read another cell's value. */
export type ReadCell = (position: CellPosition) => CellValue;

/** Evaluates a parsed formula to the single value shown in the cell. */
export function evaluateFormula(expression: Expression, readCell: ReadCell): CellValue {
  const result = evaluate(expression, readCell);
  if (isRange(result)) {
    // =A1:A1 is fine, but =A1:B5 can't be shown in one cell.
    const value = single(result);
    if (isError(value)) {
      return new CellError("#VALUE!", "A range can't be shown in a single cell. Wrap it in a function, such as SUM(...).");
    }
    return value;
  }
  return result;
}

function evaluate(expression: Expression, readCell: ReadCell): ArgumentValue {
  switch (expression.type) {
    case "number":
    case "string":
    case "boolean":
      return expression.value;

    case "error":
      return new CellError(expression.code, `The formula contains the error value ${expression.code}.`);

    case "cell":
      return readReference(expression.position, readCell);

    case "range":
      return readRange(expression.start, expression.end, readCell);

    case "unary": {
      const operand = toNumber(asScalar(evaluate(expression.operand, readCell)));
      if (isError(operand)) return operand;
      return expression.operator === "-" ? -operand : operand;
    }

    case "binary":
      return evaluateBinary(
        expression.operator,
        asScalar(evaluate(expression.left, readCell)),
        asScalar(evaluate(expression.right, readCell)),
      );

    case "call": {
      // Cell references are passed to functions as 1×1 ranges, so SUM(A1) can
      // skip text in A1 the same way SUM(A1:A5) does. See functions/helpers.ts.
      const args = expression.args.map((arg): ArgumentValue => {
        if (arg.type === "cell") {
          const value = readReference(arg.position, readCell);
          return isError(value) && value.code === "#REF!" ? value : { kind: "range", values: [[value]] };
        }
        return evaluate(arg, readCell);
      });
      // The parser already checked that the function exists.
      return getFunction(expression.name)!.call(args);
    }
  }
}

function readReference(position: CellPosition, readCell: ReadCell): CellValue {
  if (!isInsideGrid(position)) {
    return new CellError("#REF!", `${toAddress(position)} is outside the sheet.`);
  }
  const value = readCell(position);
  // Remember where an error came from so the UI can say "comes from B4".
  return isError(value) ? value.withOrigin(toAddress(position)) : value;
}

function readRange(start: CellPosition, end: CellPosition, readCell: ReadCell): RangeValue | CellError {
  if (!isInsideGrid(start) || !isInsideGrid(end)) {
    return new CellError("#REF!", `The range ${toAddress(start)}:${toAddress(end)} goes outside the sheet.`);
  }
  const values: CellValue[][] = [];
  for (let row = start.row; row <= end.row; row++) {
    const rowValues: CellValue[] = [];
    for (let col = start.col; col <= end.col; col++) {
      rowValues.push(readReference({ row, col }, readCell));
    }
    values.push(rowValues);
  }
  return { kind: "range", values };
}

/** Operators work on single values, so a range used directly (=A1:A3 + 1) is an error. */
function asScalar(value: ArgumentValue): CellValue {
  if (!isRange(value)) return value;
  const unwrapped = single(value);
  if (isError(unwrapped)) {
    return new CellError("#VALUE!", "Operators like + and * work on single values. Use a function such as SUM for ranges.");
  }
  return unwrapped;
}

function evaluateBinary(operator: string, left: CellValue, right: CellValue): CellValue {
  // Errors spread: if either side is already an error, the result is that error.
  if (isError(left)) return left;
  if (isError(right)) return right;

  if (operator === "&") {
    return (toText(left) as string) + (toText(right) as string);
  }

  if (["=", "<>", "<", ">", "<=", ">="].includes(operator)) {
    const diff = compareValues(left, right);
    switch (operator) {
      case "=": return diff === 0;
      case "<>": return diff !== 0;
      case "<": return diff < 0;
      case ">": return diff > 0;
      case "<=": return diff <= 0;
      default: return diff >= 0;
    }
  }

  // Arithmetic
  const a = toNumber(left);
  const b = toNumber(right);
  if (isError(a)) return a;
  if (isError(b)) return b;

  switch (operator) {
    case "+": return a + b;
    case "-": return a - b;
    case "*": return a * b;
    case "/":
      if (b === 0) return new CellError("#DIV/0!", "Division by zero.");
      return a / b;
    case "^": {
      const result = a ** b;
      if (!Number.isFinite(result)) return new CellError("#NUM!", `${a}^${b} is not a valid number.`);
      return result;
    }
  }
  return new CellError("#ERROR!", `Unknown operator ${operator}.`);
}

/**
 * Lists every cell a formula reads, so the sheet can build its dependency graph.
 * Ranges are expanded into their individual cells. Cells outside the grid are skipped.
 */
export function collectReferences(expression: Expression): CellPosition[] {
  const found: CellPosition[] = [];
  const visit = (node: Expression) => {
    switch (node.type) {
      case "cell":
        if (isInsideGrid(node.position)) found.push(node.position);
        break;
      case "range":
        if (!isInsideGrid(node.start) || !isInsideGrid(node.end)) break;
        for (let row = node.start.row; row <= node.end.row; row++) {
          for (let col = node.start.col; col <= node.end.col; col++) found.push({ row, col });
        }
        break;
      case "unary":
        visit(node.operand);
        break;
      case "binary":
        visit(node.left);
        visit(node.right);
        break;
      case "call":
        node.args.forEach(visit);
        break;
    }
  };
  visit(expression);
  return found;
}
