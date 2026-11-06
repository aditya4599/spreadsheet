// Logical functions (IF, AND, OR, ...) and the IS* checks.

import { CellError, isError, isRange, type ArgumentValue } from "../values";
import { single, toBoolean, type FunctionDefinition } from "./helpers";

/** Reads booleans for AND/OR. In ranges, text and blanks are skipped like in Excel. */
function collectBooleans(args: ArgumentValue[]): boolean[] | CellError {
  const result: boolean[] = [];
  for (const arg of args) {
    if (isRange(arg)) {
      for (const row of arg.values) {
        for (const value of row) {
          if (isError(value)) return value;
          if (typeof value === "boolean" || typeof value === "number") result.push(toBoolean(value) as boolean);
        }
      }
    } else {
      const b = toBoolean(arg);
      if (isError(b)) return b;
      result.push(b);
    }
  }
  return result;
}

export const logicalFunctions: FunctionDefinition[] = [
  {
    name: "IF",
    category: "Logical",
    syntax: "IF(condition, value_if_true, [value_if_false])",
    description: "Returns one value if the condition is TRUE and another if it is FALSE.",
    minArgs: 2,
    maxArgs: 3,
    call: ([condition, whenTrue, whenFalse]) => {
      const test = toBoolean(single(condition));
      if (isError(test)) return test;
      if (test) return single(whenTrue);
      return whenFalse === undefined ? false : single(whenFalse);
    },
  },
  {
    name: "IFERROR",
    category: "Logical",
    syntax: "IFERROR(value, value_if_error)",
    description: "Returns the value, or the fallback if the value is an error.",
    minArgs: 2,
    maxArgs: 2,
    call: ([value, fallback]) => {
      const result = single(value);
      return isError(result) ? single(fallback) : result;
    },
  },
  {
    name: "AND",
    category: "Logical",
    syntax: "AND(condition1, [condition2], ...)",
    description: "TRUE if every condition is TRUE.",
    minArgs: 1,
    maxArgs: Infinity,
    call: (args) => {
      const values = collectBooleans(args);
      if (isError(values)) return values;
      if (values.length === 0) return new CellError("#VALUE!", "AND found no TRUE/FALSE values.");
      return values.every(Boolean);
    },
  },
  {
    name: "OR",
    category: "Logical",
    syntax: "OR(condition1, [condition2], ...)",
    description: "TRUE if at least one condition is TRUE.",
    minArgs: 1,
    maxArgs: Infinity,
    call: (args) => {
      const values = collectBooleans(args);
      if (isError(values)) return values;
      if (values.length === 0) return new CellError("#VALUE!", "OR found no TRUE/FALSE values.");
      return values.some(Boolean);
    },
  },
  {
    name: "NOT",
    category: "Logical",
    syntax: "NOT(condition)",
    description: "Flips TRUE to FALSE and FALSE to TRUE.",
    minArgs: 1,
    maxArgs: 1,
    call: ([value]) => {
      const b = toBoolean(single(value));
      return isError(b) ? b : !b;
    },
  },
  {
    name: "ISBLANK",
    category: "Logical",
    syntax: "ISBLANK(value)",
    description: "TRUE if the cell is empty.",
    minArgs: 1,
    maxArgs: 1,
    call: ([value]) => single(value) === null,
  },
  {
    name: "ISNUMBER",
    category: "Logical",
    syntax: "ISNUMBER(value)",
    description: "TRUE if the value is a number.",
    minArgs: 1,
    maxArgs: 1,
    call: ([value]) => typeof single(value) === "number",
  },
  {
    name: "ISTEXT",
    category: "Logical",
    syntax: "ISTEXT(value)",
    description: "TRUE if the value is text.",
    minArgs: 1,
    maxArgs: 1,
    call: ([value]) => typeof single(value) === "string",
  },
  {
    name: "ISERROR",
    category: "Logical",
    syntax: "ISERROR(value)",
    description: "TRUE if the value is any error, such as #DIV/0!.",
    minArgs: 1,
    maxArgs: 1,
    call: ([value]) => isError(single(value)),
  },
];
