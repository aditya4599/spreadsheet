// Lookup functions: VLOOKUP, HLOOKUP, INDEX, MATCH.

import { CellError, isError, isRange, type ArgumentValue, type CellValue } from "../values";
import { compareValues, numberArg, single, toBoolean, toText, type FunctionDefinition } from "./helpers";

function asGrid(arg: ArgumentValue): CellValue[][] {
  return isRange(arg) ? arg.values : [[arg]];
}

/**
 * Finds `target` in a list of values and returns its 0-based position, or -1.
 * - exact: the first value equal to target (text is case-insensitive)
 * - ascending: the last value that is <= target (list must be sorted A→Z / small→large)
 * - descending: the last value that is >= target (list must be sorted Z→A / large→small)
 */
function findPosition(values: CellValue[], target: CellValue, mode: "exact" | "ascending" | "descending"): number {
  if (mode === "exact") {
    return values.findIndex((v) => v !== null && !isError(v) && compareValues(v, target) === 0);
  }
  let found = -1;
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (value === null || isError(value)) continue;
    const diff = compareValues(value, target);
    if (mode === "ascending" ? diff <= 0 : diff >= 0) found = i;
    else break; // sorted data: once we pass the target there is nothing better later
  }
  return found;
}

/** Shared code for VLOOKUP (search down the first column) and HLOOKUP (across the first row). */
function lookup(name: "VLOOKUP" | "HLOOKUP", args: ArgumentValue[]): CellValue {
  const [targetArg, tableArg, indexArg, approximateArg] = args;
  const target = single(targetArg);
  if (isError(target)) return target;

  const index = numberArg(indexArg);
  if (isError(index)) return index;
  const approximate = approximateArg === undefined ? true : toBoolean(single(approximateArg));
  if (isError(approximate)) return approximate;

  const table = asGrid(tableArg);
  const vertical = name === "VLOOKUP";
  const searchList = vertical ? table.map((row) => row[0]) : table[0];
  const resultCount = vertical ? table[0].length : table.length;
  const what = vertical ? "column" : "row";

  const position = Math.trunc(index);
  if (position < 1) return new CellError("#VALUE!", `${name}'s ${what} number must be 1 or more.`);
  if (position > resultCount) {
    return new CellError("#REF!", `${name} asked for ${what} ${position}, but the table only has ${resultCount}.`);
  }

  const found = findPosition(searchList, target, approximate ? "ascending" : "exact");
  if (found === -1) {
    return new CellError("#N/A", `${name} couldn't find "${toText(target)}" in the first ${what} of the table.`);
  }
  return vertical ? table[found][position - 1] : table[position - 1][found];
}

export const lookupFunctions: FunctionDefinition[] = [
  {
    name: "VLOOKUP",
    category: "Lookup",
    syntax: "VLOOKUP(search_key, range, column, [is_sorted])",
    description: "Finds a value in the first column of a range and returns the value from another column. Use FALSE as the last argument for an exact match.",
    minArgs: 3,
    maxArgs: 4,
    call: (args) => lookup("VLOOKUP", args),
  },
  {
    name: "HLOOKUP",
    category: "Lookup",
    syntax: "HLOOKUP(search_key, range, row, [is_sorted])",
    description: "Like VLOOKUP, but searches the first row and returns from another row.",
    minArgs: 3,
    maxArgs: 4,
    call: (args) => lookup("HLOOKUP", args),
  },
  {
    name: "INDEX",
    category: "Lookup",
    syntax: "INDEX(range, row, [column])",
    description: "Returns the value at a row and column inside a range (counting from 1).",
    minArgs: 2,
    maxArgs: 3,
    call: ([rangeArg, rowArg, colArg]) => {
      const grid = asGrid(rangeArg);
      let row = numberArg(rowArg);
      let col = numberArg(colArg, 1);
      if (isError(row)) return row;
      if (isError(col)) return col;
      // INDEX(A1:E1, 3) means "3rd item of a single row", so treat the one number as the column.
      if (colArg === undefined && grid.length === 1) {
        col = row;
        row = 1;
      }
      row = Math.trunc(row);
      col = Math.trunc(col);
      if (row < 1 || col < 1 || row > grid.length || col > grid[0].length) {
        return new CellError("#REF!", `INDEX position (${row}, ${col}) is outside the ${grid.length}×${grid[0].length} range.`);
      }
      return grid[row - 1][col - 1];
    },
  },
  {
    name: "MATCH",
    category: "Lookup",
    syntax: "MATCH(search_key, range, [match_type])",
    description: "Position (from 1) of a value in a single row or column. match_type 0 = exact, 1 = sorted ascending (default), -1 = sorted descending.",
    minArgs: 2,
    maxArgs: 3,
    call: ([targetArg, rangeArg, typeArg]) => {
      const target = single(targetArg);
      if (isError(target)) return target;
      const matchType = numberArg(typeArg, 1);
      if (isError(matchType)) return matchType;

      const grid = asGrid(rangeArg);
      if (grid.length > 1 && grid[0].length > 1) {
        return new CellError("#N/A", "MATCH needs a single row or a single column, not a block of cells.");
      }
      const values = grid.length === 1 ? grid[0] : grid.map((row) => row[0]);
      const mode = matchType === 0 ? "exact" : matchType > 0 ? "ascending" : "descending";
      const found = findPosition(values, target, mode);
      if (found === -1) return new CellError("#N/A", `MATCH couldn't find "${toText(target)}".`);
      return found + 1;
    },
  },
];
