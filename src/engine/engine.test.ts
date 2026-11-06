import { describe, expect, it } from "vitest";
import { FormulaSyntaxError } from "./errors";
import { buildFillChanges, shiftFormula } from "./fill";
import { ALL_FUNCTIONS } from "./functions";
import { parseFormula } from "./parser";
import { Sheet } from "./sheet";
import { CellError, formatValue } from "./values";

/** Builds a sheet from { A1: "...", ... } and returns a helper to read display values. */
function makeSheet(cells: Record<string, string>) {
  const sheet = new Sheet();
  sheet.setCells(Object.entries(cells).map(([address, raw]) => ({ address, raw })));
  const show = (address: string) => formatValue(sheet.getValue(address));
  return { sheet, show };
}

function calc(formula: string, cells: Record<string, string> = {}) {
  const { show } = makeSheet({ ...cells, Z1000: formula });
  return show("Z1000");
}

function syntaxError(formula: string): FormulaSyntaxError {
  try {
    parseFormula(formula);
  } catch (error) {
    if (error instanceof FormulaSyntaxError) return error;
    throw error;
  }
  throw new Error(`Expected ${formula} to fail`);
}

describe("arithmetic and precedence", () => {
  it.each([
    ["=1+2*3", "7"],
    ["=(1+2)*3", "9"],
    ["=2^3^2", "64"], // left to right, like Excel
    ["=-2^2", "4"], // unary minus binds tighter, like Excel
    ["=10/4", "2.5"],
    ["=0.1+0.2", "0.3"],
    ["=1/0", "#DIV/0!"],
    ['="a"&"b"&1', "ab1"],
    ["=1+2=3", "TRUE"],
    ['="apple"<"Banana"', "TRUE"],
    ["=5<>5", "FALSE"],
    ['=1+"x"', "#VALUE!"],
    ['=1+"2"', "3"],
  ])("%s → %s", (formula, expected) => {
    expect(calc(formula)).toBe(expected);
  });
});

describe("references and ranges", () => {
  it("reads cells and treats blanks as 0", () => {
    expect(calc("=A1*B1+C1", { A1: "3", B1: "4" })).toBe("12");
  });
  it("evaluates nested functions", () => {
    expect(calc("=ROUND(AVERAGE(A1:A3)*IF(SUM(A1:A3)>5,2,1),1)", { A1: "1", A2: "2", A3: "4" })).toBe("4.7");
  });
  it("rejects a bare multi-cell range", () => {
    expect(calc("=A1:A3", { A1: "1" })).toBe("#VALUE!");
  });
  it("returns #REF! outside the grid", () => {
    expect(calc("=AA1")).toBe("#REF!");
  });
});

describe("functions", () => {
  const data = {
    A1: "Pen", B1: "Stationery", C1: "10",
    A2: "Bag", B2: "Accessories", C2: "40",
    A3: "Ink", B3: "stationery", C3: "25",
  };
  it.each([
    ["=SUM(C1:C3)", "75"],
    ["=SUM(A1:C3)", "75"], // text in ranges is skipped
    ["=AVERAGE(C1:C3)", "25"],
    ["=MIN(C1:C3)", "10"],
    ["=MAX(C1:C3,100)", "100"],
    ["=MEDIAN(C1:C3)", "25"],
    ["=COUNT(A1:C3)", "3"],
    ["=COUNTA(A1:C3)", "9"],
    ["=COUNTBLANK(D1:D3)", "3"],
    ["=PRODUCT(2,3,4)", "24"],
    ["=ROUND(2.345,2)", "2.35"],
    ["=ROUND(-2.5,0)", "-3"],
    ["=ROUNDUP(2.341,2)", "2.35"],
    ["=ROUNDDOWN(2.349,2)", "2.34"],
    ["=INT(-2.5)", "-3"],
    ["=ABS(-4)", "4"],
    ["=SQRT(16)", "4"],
    ["=SQRT(-1)", "#NUM!"],
    ["=POWER(2,10)", "1024"],
    ["=MOD(-7,3)", "2"],
    ['=SUMIF(B1:B3,"stationery",C1:C3)', "35"],
    ['=SUMIF(C1:C3,">20")', "65"],
    ['=COUNTIF(C1:C3,"<=25")', "2"],
    ['=AVERAGEIF(B1:B3,"<>Accessories",C1:C3)', "17.5"],
    ['=IF(C2>30,"big","small")', "big"],
    ["=IF(FALSE,1)", "FALSE"],
    ["=IFERROR(1/0,-1)", "-1"],
    ["=AND(TRUE,C1>5)", "TRUE"],
    ["=OR(FALSE,C1>50)", "FALSE"],
    ["=NOT(TRUE)", "FALSE"],
    ["=ISBLANK(D1)", "TRUE"],
    ["=ISNUMBER(C1)", "TRUE"],
    ["=ISTEXT(A1)", "TRUE"],
    ["=ISERROR(1/0)", "TRUE"],
    ['=VLOOKUP("bag",A1:C3,3,FALSE)', "40"],
    ['=VLOOKUP("Cup",A1:C3,3,FALSE)', "#N/A"],
    ['=VLOOKUP("Pen",A1:C3,5,FALSE)', "#REF!"],
    ['=HLOOKUP("Accessories",A2:C3,2,FALSE)', "stationery"],
    ['=HLOOKUP("Bag",A2:C2,3,FALSE)', "#REF!"],    ["=INDEX(A1:C3,2,1)", "Bag"],
    ['=MATCH("Ink",A1:A3,0)', "3"],
    ["=MATCH(30,C1:C2,1)", "1"],
    ['=CONCAT(A1,"-",C1)', "Pen-10"],
    ['=LEN("hello")', "5"],
    ['=UPPER("abc")&LOWER("DEF")', "ABCdef"],
    ['=PROPER("hello wORLD")', "Hello World"],
    ['=TRIM("  a   b ")', "a b"],
    ['=LEFT("spreadsheet",6)', "spread"],
    ['=RIGHT("spreadsheet",5)', "sheet"],
    ['=MID("spreadsheet",7,5)', "sheet"],
    ['=SUBSTITUTE("a-b-c","-","+")', "a+b+c"],
  ])("%s → %s", (formula, expected) => {
    expect(calc(formula, data)).toBe(expected);
  });

  it("has at least 30 functions", () => {
    expect(ALL_FUNCTIONS.length).toBeGreaterThanOrEqual(30);
  });
});

describe("syntax errors", () => {
  it("reports a missing closing parenthesis at the end", () => {
    const error = syntaxError("=SUM(A1, B2");
    expect(error.message).toBe("Missing closing parenthesis.");
    expect(error.position).toBe("=SUM(A1, B2".length);
    expect(error.suggestion).toBe("Add ')' at the end of the formula.");
  });
  it("suggests a close function name", () => {
    const error = syntaxError("=SUMM(A1)");
    expect(error.code).toBe("#NAME?");
    expect(error.suggestion).toBe("Did you mean SUM?");
    expect(error.position).toBe(1);
  });
  it("checks argument counts", () => {
    expect(syntaxError("=IF(A1)").message).toBe("IF expects 2 to 3 arguments, but got 1.");
  });
  it("points at a dangling operator", () => {
    const error = syntaxError("=1+");
    expect(error.position).toBe(3);
  });
  it("points at an extra parenthesis", () => {
    expect(syntaxError("=(1+2))").position).toBe(6);
  });
  it("catches missing operators", () => {
    expect(syntaxError("=A1 B1").position).toBe(4);
  });
  it("catches unterminated text", () => {
    expect(syntaxError('="abc').position).toBe(1);
  });
  it("shows #ERROR! in the cell", () => {
    expect(calc("=SUM(A1")).toBe("#ERROR!");
  });
});

describe("dependency tracking", () => {
  it("recalculates only affected cells", () => {
    const { sheet, show } = makeSheet({ A1: "1", B1: "=A1*2", C1: "=B1+1", D1: "=5", E1: "=D1" });
    const result = sheet.setCells([{ address: "A1", raw: "10" }]);
    expect(show("C1")).toBe("21");
    expect(result.recalculated.sort()).toEqual(["B1", "C1"]);
  });

  it("updates when a referenced empty cell gets a value", () => {
    const { sheet, show } = makeSheet({ B1: "=SUM(A1:A3)" });
    sheet.setCells([{ address: "A2", raw: "7" }]);
    expect(show("B1")).toBe("7");
  });

  it("drops old dependencies when a formula changes", () => {
    const { sheet } = makeSheet({ A1: "1", B1: "=A1" });
    sheet.setCells([{ address: "B1", raw: "=5" }]);
    expect(sheet.setCells([{ address: "A1", raw: "2" }]).recalculated).toEqual([]);
  });

  it("handles a 1,000-cell chain of formulas", () => {
    const cells: Record<string, string> = { A1: "1" };
    for (let row = 2; row <= 1000; row++) cells[`A${row}`] = `=A${row - 1}+1`;
    const { sheet, show } = makeSheet(cells);
    expect(show("A1000")).toBe("1000");
    const result = sheet.setCells([{ address: "A1", raw: "5" }]);
    expect(show("A1000")).toBe("1004");
    expect(result.recalculated.length).toBe(999);
  });

  it("passes errors along and remembers where they started", () => {
    const { sheet, show } = makeSheet({ A1: "=1/0", B1: "=A1+1", C1: "=B1" });
    expect(show("C1")).toBe("#DIV/0!");
    expect((sheet.getValue("C1") as CellError).origin).toBe("A1");
  });
});

describe("circular references", () => {
  it("detects a self reference", () => {
    const { show } = makeSheet({ A1: "=A1+1" });
    expect(show("A1")).toBe("#CIRC!");
  });

  it("detects an indirect cycle and explains the path", () => {
    const { sheet, show } = makeSheet({ A1: "=C1", B1: "=A1", C1: "=B1", D1: "=A1*2" });
    expect(show("A1")).toBe("#CIRC!");
    expect(show("B1")).toBe("#CIRC!");
    expect(show("C1")).toBe("#CIRC!");
    expect(show("D1")).toBe("#CIRC!");
    expect((sheet.getValue("A1") as CellError).message).toContain("→");
  });

  it("recovers when the cycle is broken", () => {
    const { sheet, show } = makeSheet({ A1: "=B1", B1: "=A1" });
    sheet.setCells([{ address: "B1", raw: "4" }]);
    expect(show("A1")).toBe("4");
  });
});

describe("fill and reference shifting", () => {
  it("moves relative references and keeps $ references", () => {
    expect(shiftFormula("=A1+$B$1+B$2+$C3", 2, 1)).toBe("=B3+$B$1+C$2+$C5");
  });
  it("turns references pushed off the sheet into #REF!", () => {
    expect(shiftFormula("=A1", -1, 0)).toBe("=#REF!");
  });
  it("continues number series and copies formulas", () => {
    const { sheet } = makeSheet({ A1: "1", A2: "3", B1: "=A1*2" });
    const changes = buildFillChanges(
      { start: { row: 0, col: 0 }, end: { row: 1, col: 1 } },
      { start: { row: 0, col: 0 }, end: { row: 3, col: 1 } },
      (address) => sheet.getRaw(address),
    );
    expect(changes).toEqual([
      { address: "A3", raw: "5" },
      { address: "A4", raw: "7" },
      { address: "B3", raw: "=A3*2" },
      { address: "B4", raw: "" },
    ]);
  });
});
