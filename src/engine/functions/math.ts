// Math and statistics functions, including the conditional SUMIF family.

import { CellError, isError, isRange, type ArgumentValue, type CellValue } from "../values";
import { allValues, collectNumbers, makeCriteria, numberArg, single, type FunctionDefinition } from "./helpers";

/** Rounds `n` to `digits` decimals using the given rounding method (works for negative digits too). */
function roundWith(n: number, digits: number, method: (x: number) => number): number {
  const factor = 10 ** Math.trunc(digits);
  // toPrecision(15) removes binary noise so 1.005 * 100 becomes 100.5 instead of 100.49999…
  const scaled = Number((Math.abs(n) * factor).toPrecision(15));
  return (Math.sign(n) * method(scaled)) / factor;
}

/** Shared code for ROUND, ROUNDUP and ROUNDDOWN. */
function makeRounding(name: string, description: string, method: (x: number) => number): FunctionDefinition {
  return {
    name,
    category: "Math",
    syntax: `${name}(number, [digits])`,
    description,
    minArgs: 1,
    maxArgs: 2,
    call: ([value, digitsArg]) => {
      const n = numberArg(value);
      const digits = numberArg(digitsArg, 0);
      if (isError(n)) return n;
      if (isError(digits)) return digits;
      return roundWith(n, digits, method);
    },
  };
}

/** Pairs each cell of `range` with the cell at the same position in `other`. */
function pairedCells(range: ArgumentValue, other: ArgumentValue | undefined): [CellValue, CellValue][] {
  const rows = isRange(range) ? range.values : [[range]];
  const otherRows = other === undefined ? rows : isRange(other) ? other.values : [[other]];
  const pairs: [CellValue, CellValue][] = [];
  rows.forEach((row, r) =>
    row.forEach((value, c) => pairs.push([value, otherRows[r]?.[c] ?? null])),
  );
  return pairs;
}

export const mathFunctions: FunctionDefinition[] = [
  {
    name: "SUM",
    category: "Math",
    syntax: "SUM(value1, [value2], ...)",
    description: "Adds numbers and ranges.",
    minArgs: 1,
    maxArgs: Infinity,
    call: (args) => {
      const numbers = collectNumbers(args);
      return isError(numbers) ? numbers : numbers.reduce((total, n) => total + n, 0);
    },
  },
  {
    name: "AVERAGE",
    category: "Math",
    syntax: "AVERAGE(value1, [value2], ...)",
    description: "Arithmetic mean of the numbers.",
    minArgs: 1,
    maxArgs: Infinity,
    call: (args) => {
      const numbers = collectNumbers(args);
      if (isError(numbers)) return numbers;
      if (numbers.length === 0) return new CellError("#DIV/0!", "AVERAGE has no numbers to average.");
      return numbers.reduce((total, n) => total + n, 0) / numbers.length;
    },
  },
  {
    name: "MIN",
    category: "Math",
    syntax: "MIN(value1, [value2], ...)",
    description: "Smallest number (0 if there are none).",
    minArgs: 1,
    maxArgs: Infinity,
    call: (args) => {
      const numbers = collectNumbers(args);
      if (isError(numbers)) return numbers;
      return numbers.length === 0 ? 0 : Math.min(...numbers);
    },
  },
  {
    name: "MAX",
    category: "Math",
    syntax: "MAX(value1, [value2], ...)",
    description: "Largest number (0 if there are none).",
    minArgs: 1,
    maxArgs: Infinity,
    call: (args) => {
      const numbers = collectNumbers(args);
      if (isError(numbers)) return numbers;
      return numbers.length === 0 ? 0 : Math.max(...numbers);
    },
  },
  {
    name: "MEDIAN",
    category: "Math",
    syntax: "MEDIAN(value1, [value2], ...)",
    description: "Middle number when sorted.",
    minArgs: 1,
    maxArgs: Infinity,
    call: (args) => {
      const numbers = collectNumbers(args);
      if (isError(numbers)) return numbers;
      if (numbers.length === 0) return new CellError("#NUM!", "MEDIAN has no numbers.");
      const sorted = [...numbers].sort((a, b) => a - b);
      const middle = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    },
  },
  {
    name: "PRODUCT",
    category: "Math",
    syntax: "PRODUCT(value1, [value2], ...)",
    description: "Multiplies all the numbers.",
    minArgs: 1,
    maxArgs: Infinity,
    call: (args) => {
      const numbers = collectNumbers(args);
      if (isError(numbers)) return numbers;
      return numbers.length === 0 ? 0 : numbers.reduce((total, n) => total * n, 1);
    },
  },
  {
    name: "COUNT",
    category: "Math",
    syntax: "COUNT(value1, [value2], ...)",
    description: "Counts cells that contain numbers.",
    minArgs: 1,
    maxArgs: Infinity,
    call: (args) => allValues(args).filter((v) => typeof v === "number").length,
  },
  {
    name: "COUNTA",
    category: "Math",
    syntax: "COUNTA(value1, [value2], ...)",
    description: "Counts cells that are not empty.",
    minArgs: 1,
    maxArgs: Infinity,
    call: (args) => allValues(args).filter((v) => v !== null && v !== "").length,
  },
  {
    name: "COUNTBLANK",
    category: "Math",
    syntax: "COUNTBLANK(range)",
    description: "Counts empty cells in a range.",
    minArgs: 1,
    maxArgs: 1,
    call: (args) => allValues(args).filter((v) => v === null || v === "").length,
  },
  makeRounding("ROUND", "Rounds to a number of decimal places.", Math.round),
  makeRounding("ROUNDUP", "Rounds away from zero.", Math.ceil),
  makeRounding("ROUNDDOWN", "Rounds toward zero.", Math.floor),
  {
    name: "INT",
    category: "Math",
    syntax: "INT(number)",
    description: "Rounds down to the nearest whole number.",
    minArgs: 1,
    maxArgs: 1,
    call: ([value]) => {
      const n = numberArg(value);
      return isError(n) ? n : Math.floor(n);
    },
  },
  {
    name: "ABS",
    category: "Math",
    syntax: "ABS(number)",
    description: "Absolute value (removes the minus sign).",
    minArgs: 1,
    maxArgs: 1,
    call: ([value]) => {
      const n = numberArg(value);
      return isError(n) ? n : Math.abs(n);
    },
  },
  {
    name: "SQRT",
    category: "Math",
    syntax: "SQRT(number)",
    description: "Square root.",
    minArgs: 1,
    maxArgs: 1,
    call: ([value]) => {
      const n = numberArg(value);
      if (isError(n)) return n;
      if (n < 0) return new CellError("#NUM!", "SQRT can't take the square root of a negative number.");
      return Math.sqrt(n);
    },
  },
  {
    name: "POWER",
    category: "Math",
    syntax: "POWER(base, exponent)",
    description: "Raises a number to a power (same as base ^ exponent).",
    minArgs: 2,
    maxArgs: 2,
    call: ([baseArg, exponentArg]) => {
      const base = numberArg(baseArg);
      const exponent = numberArg(exponentArg);
      if (isError(base)) return base;
      if (isError(exponent)) return exponent;
      const result = base ** exponent;
      if (!Number.isFinite(result)) return new CellError("#NUM!", "POWER gave a result that isn't a valid number.");
      return result;
    },
  },
  {
    name: "MOD",
    category: "Math",
    syntax: "MOD(number, divisor)",
    description: "Remainder after division (takes the sign of the divisor).",
    minArgs: 2,
    maxArgs: 2,
    call: ([numberValue, divisorValue]) => {
      const n = numberArg(numberValue);
      const d = numberArg(divisorValue);
      if (isError(n)) return n;
      if (isError(d)) return d;
      if (d === 0) return new CellError("#DIV/0!", "MOD can't divide by zero.");
      return n - d * Math.floor(n / d);
    },
  },
  {
    name: "SUMIF",
    category: "Math",
    syntax: "SUMIF(range, criteria, [sum_range])",
    description: 'Adds cells that match a condition, e.g. SUMIF(B2:B9, ">10").',
    minArgs: 2,
    maxArgs: 3,
    call: ([range, criteriaArg, sumRange]) => {
      const test = makeCriteria(single(criteriaArg));
      let total = 0;
      for (const [value, sumValue] of pairedCells(range, sumRange)) {
        if (!test(value)) continue;
        if (isError(sumValue)) return sumValue;
        if (typeof sumValue === "number") total += sumValue;
      }
      return total;
    },
  },
  {
    name: "COUNTIF",
    category: "Math",
    syntax: "COUNTIF(range, criteria)",
    description: 'Counts cells that match a condition, e.g. COUNTIF(A1:A9, "yes").',
    minArgs: 2,
    maxArgs: 2,
    call: ([range, criteriaArg]) => {
      const test = makeCriteria(single(criteriaArg));
      return pairedCells(range, undefined).filter(([value]) => test(value)).length;
    },
  },
  {
    name: "AVERAGEIF",
    category: "Math",
    syntax: "AVERAGEIF(range, criteria, [average_range])",
    description: "Averages cells that match a condition.",
    minArgs: 2,
    maxArgs: 3,
    call: ([range, criteriaArg, averageRange]) => {
      const test = makeCriteria(single(criteriaArg));
      const matches: number[] = [];
      for (const [value, averageValue] of pairedCells(range, averageRange)) {
        if (!test(value)) continue;
        if (isError(averageValue)) return averageValue;
        if (typeof averageValue === "number") matches.push(averageValue);
      }
      if (matches.length === 0) return new CellError("#DIV/0!", "AVERAGEIF found no matching numbers.");
      return matches.reduce((total, n) => total + n, 0) / matches.length;
    },
  },
];
