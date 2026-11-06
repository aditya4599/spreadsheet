# Spreadsheet

A browser spreadsheet built with React, TypeScript and Vite. It has its own formula
engine (tokenizer, parser and evaluator — no spreadsheet library), dependency tracking
that recalculates only the cells affected by a change, circular-reference detection,
and error messages that point at the exact problem in a formula.

## Running it

You need [Node.js](https://nodejs.org) 18 or newer.

```bash
cd spreadsheet-app
npm install
npm run dev
```

Then open the address Vite prints (usually http://localhost:5173).

Other commands:

| Command | What it does |
| --- | --- |
| `npm test` | Runs the formula-engine tests (Vitest) |
| `npm run typecheck` | Checks the TypeScript types |
| `npm run build` | Type-checks and builds a production version into `dist/` |
| `npm run preview` | Serves the production build locally |

## Features

- **Grid**: 1,000 rows × 26 columns (A–Z), 26,000 cells. Only the cells on screen are rendered.
- **Selection**: click a cell, drag or Shift+click to select a range, click a row or column
  header to select the whole row or column, click the top-left corner to select everything.
- **Editing**: type directly into a cell, double-click or press Enter/F2 to edit, or use the formula bar.
- **Formula bar**: shows the selected cell's raw content (the formula, not its result).
- **Formulas**: arithmetic, comparisons, text joining, cell references, ranges, nested formulas
  and nested function calls, with 43 functions (listed below).
- **Dependency tracking**: editing a cell recalculates only the formulas that depend on it.
  The status bar shows how many formulas were recalculated.
- **Circular references**: shown as `#CIRC!` with the loop spelled out, e.g. `J3 → J4 → J3`.
- **Drag-to-fill**: drag the small square at the corner of the selection. Formulas are copied with
  their references adjusted, two or more numbers continue as a series (1, 2 → 3, 4, 5), other values repeat.
- **Copy and paste**: Ctrl+C / Ctrl+V. Uses tab-separated text, so you can paste to and from other
  spreadsheet apps. Formulas copied within the app have their references adjusted.
- **Undo and redo** for every change, including fills, pastes, clearing, and loading/clearing the sheet.
- **Error details**: selecting a cell with an error explains it under the formula bar. Syntax errors
  show the formula with a `^` under the problem and a suggested fix. Errors that came from another
  cell say which one, with a link to jump there.
- **Status bar**: Count, Sum and Average of the selected cells.
- **Function list**: the "Functions" button opens a searchable list of every function.
- **Sample data**: the app starts with a small order sheet. "New blank sheet" clears it and
  "Load sample data" brings it back (both can be undone).

### Try this with the sample data

- Change a quantity in column C and watch the totals and summary update.
- Select H13: it shows `#DIV/0!` because H12 (Stores) is empty. Type a number into H12.
- Type `=SUM(E2:E7` (no closing parenthesis) into an empty cell, press Enter, then select it again.
- Type `=SUMM(E2:E7)` to see the "Did you mean SUM?" suggestion.

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| Arrow keys | Move the selection |
| Shift + Arrow keys | Extend the selection |
| Tab / Shift+Tab | Move right / left |
| Enter or F2 | Edit the selected cell |
| Any character | Start typing over the selected cell |
| Enter (while editing) | Save and move down (Shift+Enter: up) |
| Tab (while editing) | Save and move right |
| Esc (while editing) | Cancel the edit |
| Delete / Backspace | Clear the selected cells |
| Home | Go to column A |
| Ctrl+Home | Go to A1 |
| Page Up / Page Down | Move one screen up / down |
| Ctrl+A | Select all |
| Ctrl+C / Ctrl+V | Copy / paste |
| Ctrl+D | Fill down (copy the top row of the selection into the rows below) |
| Ctrl+Z | Undo |
| Ctrl+Y or Ctrl+Shift+Z | Redo |

On a Mac, Cmd works in place of Ctrl.

## Formula language

A cell is a formula if it starts with `=`. Anything else is a number (`42`, `-3.5`, `1e3`),
`TRUE`/`FALSE`, or text.

| Kind | Examples |
| --- | --- |
| Numbers | `12`, `3.5`, `.5`, `1e3` |
| Text | `"hello"` (write `""` for a quote inside text) |
| Booleans | `TRUE`, `FALSE` |
| Cell references | `A1`, `$A$1` (the `$` keeps a column or row fixed when filling or pasting) |
| Ranges | `A1:B10` (only inside functions such as `SUM(A1:B10)`) |
| Functions | `SUM(A1:A3, 10)`, `IF(A1 > 5, "big", "small")` |

Operators, from loosest to tightest binding:

| Operators | Meaning |
| --- | --- |
| `=` `<>` `<` `>` `<=` `>=` | Comparisons (text comparisons ignore upper/lower case) |
| `&` | Join text |
| `+` `-` | Add, subtract |
| `*` `/` | Multiply, divide |
| `^` | Power |
| `-x` `+x` | Negative / positive sign |

Like Excel, the minus sign binds tighter than `^`, so `=-2^2` is `4`. Write `=-(2^2)` for `-4`.
Parentheses can always be used to control the order.

### Error values

| Error | Meaning |
| --- | --- |
| `#ERROR!` | The formula couldn't be read (a syntax mistake) |
| `#NAME?` | Unknown function or name |
| `#VALUE!` | Wrong type of value, e.g. `="abc" + 1` |
| `#DIV/0!` | Division by zero |
| `#REF!` | Reference to a cell outside the sheet |
| `#N/A` | A lookup didn't find its value |
| `#NUM!` | Invalid number, e.g. `SQRT(-1)` |
| `#CIRC!` | Circular reference |

Errors spread: if A1 is `#DIV/0!`, then `=A1+1` is `#DIV/0!` too. Use `IFERROR` to catch them.

## Supported functions (43)

**Math (20)**

| Function | Description |
| --- | --- |
| `SUM(value1, ...)` | Adds numbers and ranges |
| `AVERAGE(value1, ...)` | Arithmetic mean |
| `MIN(value1, ...)` | Smallest number |
| `MAX(value1, ...)` | Largest number |
| `MEDIAN(value1, ...)` | Middle number when sorted |
| `PRODUCT(value1, ...)` | Multiplies all numbers |
| `COUNT(value1, ...)` | Counts cells containing numbers |
| `COUNTA(value1, ...)` | Counts non-empty cells |
| `COUNTBLANK(range)` | Counts empty cells |
| `ROUND(number, [digits])` | Rounds to a number of decimals (half away from zero) |
| `ROUNDUP(number, [digits])` | Rounds away from zero |
| `ROUNDDOWN(number, [digits])` | Rounds toward zero |
| `INT(number)` | Rounds down to a whole number |
| `ABS(number)` | Absolute value |
| `SQRT(number)` | Square root |
| `POWER(base, exponent)` | Same as `base ^ exponent` |
| `MOD(number, divisor)` | Remainder (takes the sign of the divisor) |
| `SUMIF(range, criteria, [sum_range])` | Adds cells that match a condition |
| `COUNTIF(range, criteria)` | Counts cells that match a condition |
| `AVERAGEIF(range, criteria, [average_range])` | Averages cells that match a condition |

Criteria can be a value (`"Stationery"`, `10`) or a comparison in quotes (`">50"`, `"<>Bags"`, `"<=3"`).
`"="` matches empty cells and `"<>"` matches non-empty ones.

**Logical (9)**

| Function | Description |
| --- | --- |
| `IF(condition, value_if_true, [value_if_false])` | Picks a value based on a condition |
| `IFERROR(value, value_if_error)` | Replaces an error with a fallback |
| `AND(condition1, ...)` | TRUE if all are TRUE |
| `OR(condition1, ...)` | TRUE if any is TRUE |
| `NOT(condition)` | Flips TRUE/FALSE |
| `ISBLANK(value)` | TRUE if empty |
| `ISNUMBER(value)` | TRUE if a number |
| `ISTEXT(value)` | TRUE if text |
| `ISERROR(value)` | TRUE if any error |

**Lookup (4)**

| Function | Description |
| --- | --- |
| `VLOOKUP(search_key, range, column, [is_sorted])` | Finds a value in the first column, returns a value from another column. Pass `FALSE` as the last argument for an exact match (the default `TRUE` expects the first column to be sorted) |
| `HLOOKUP(search_key, range, row, [is_sorted])` | Same as VLOOKUP but searches the first row |
| `INDEX(range, row, [column])` | Value at a position inside a range (counting from 1) |
| `MATCH(search_key, range, [match_type])` | Position of a value in a row or column. `0` = exact, `1` = sorted ascending (default), `-1` = sorted descending |

**Text (10)**

| Function | Description |
| --- | --- |
| `CONCAT(text1, ...)` | Joins text (also accepts ranges) |
| `LEN(text)` | Number of characters |
| `UPPER(text)` | UPPER CASE |
| `LOWER(text)` | lower case |
| `PROPER(text)` | Capitalizes Each Word |
| `TRIM(text)` | Removes extra spaces |
| `LEFT(text, [count])` | First characters |
| `RIGHT(text, [count])` | Last characters |
| `MID(text, start, count)` | Characters from the middle |
| `SUBSTITUTE(text, find, replace_with)` | Replaces all occurrences |

## How it works

The code is split into the **engine** (`src/engine/`, plain TypeScript, no React) and the
**UI** (`src/components/` and `src/hooks/`). The engine can be tested on its own, which is what
`src/engine/engine.test.ts` does.

```
src/
  engine/
    cellAddress.ts   "B3" ⇄ { row: 2, col: 1 }, grid size
    values.ts        cell value types, error values, display formatting
    tokenizer.ts     step 1: text → tokens
    parser.ts        step 2: tokens → tree
    evaluator.ts     step 3: tree → value; also lists the cells a formula reads
    functions/       the 43 functions, one file per group
    sheet.ts         stores cells, dependency graph, recalculation, cycle detection
    fill.ts          drag-to-fill and moving references when copying formulas
    errors.ts        syntax error type, caret diagram, "did you mean" suggestions
  hooks/
    useSpreadsheet.ts  selection, editing, undo/redo — the bridge between engine and UI
  components/          Grid, Cell, CellEditor, FormulaBar, ErrorDetails, Toolbar, StatusBar, FunctionList
  sampleData.ts
```

### Raw input vs. calculated value

Every cell keeps two things: the **raw** text you typed (`=C2*D2`) and the **value** it
calculates to (`42`). The formula bar shows the raw text; the grid shows the value.

### Step 1: the tokenizer (`tokenizer.ts`)

The tokenizer reads the formula one character at a time and groups characters into
**tokens** — the "words" of the formula. `=SUM(A1:A3) * 2` becomes:

```
name SUM   (   cell A1   :   cell A3   )   operator *   number 2
```

Each token remembers where it started in the text. That position is what lets error
messages put a `^` under the exact character that caused the problem.

### Step 2: the parser (`parser.ts`)

The parser turns the flat list of tokens into a **tree** that shows the order of operations.
`=1 + 2 * A1` becomes:

```
      +
     / \
    1   *
       / \
      2   A1
```

It is a *recursive descent* parser: there is one small function per precedence level
(`parseComparison`, `parseAdditive`, `parseMultiplicative`, …). Each one first asks the
next-tighter level for its left side, then loops while it sees one of its own operators.
Because multiplication is handled one level "deeper" than addition, `*` naturally ends up
lower in the tree and is calculated first. Parentheses restart the process from the top,
which is why `(1 + 2) * 3` works.

The parser is also where most error messages come from. When it expects something and finds
something else (for example, the formula ends where a `)` should be) it throws a
`FormulaSyntaxError` with the position and a suggestion. It also checks that functions exist
and get the right number of arguments, so mistakes show up as soon as you press Enter.

### Step 3: the evaluator (`evaluator.ts`)

The evaluator walks the tree from the bottom up. Numbers and text are returned as they are.
A cell reference asks the sheet for that cell's current value. An operator evaluates both
sides and combines them. A function call evaluates its arguments, then passes them to the
function's code in `functions/`.

Errors are ordinary values: dividing by zero produces a `#DIV/0!` value instead of throwing,
and any operator or function that receives an error passes it along. Each error remembers the
cell it started in, so the UI can say "This error comes from H12".

### Dependency tracking (`sheet.ts`)

When a formula is saved, the sheet asks the evaluator which cells the formula reads
(`=SUM(A1:A3)` reads A1, A2 and A3) and records an edge in two maps:

```
precedents:  B1 → {A1, A2, A3}     "cells B1 reads"
dependents:  A1 → {B1}             "cells that read A1"
```

When a cell changes:

1. **Find what's affected.** Starting from the changed cell, follow `dependents` again and
   again: A1 → B1 → anything that reads B1 → … Everything else is left alone, which is why
   only the affected formulas are recalculated.
2. **Order them.** A cell must be calculated after the cells it reads. A depth-first search
   over `precedents` produces that order (a *topological sort*).
3. **Calculate** each affected formula in that order.

### Circular references

During the depth-first search, each cell is marked "visiting" while we explore the cells it
reads, and "done" afterwards. If the search reaches a cell that is still "visiting", it has
walked in a circle — for example J3 reads J4, which reads J3. Every cell on that loop gets a
`#CIRC!` error with the loop written out (`J3 → J4 → J3`) and is not calculated, so there is
no infinite loop. Cells that read from the loop show the same error. When you change one of
the cells to break the loop, everything recalculates normally.

### Virtualization (`Grid.tsx`)

Rendering 26,000 elements would make scrolling slow. Instead, the grid contains one large
empty element with the full size of the sheet, so the scrollbars behave as if every cell were
there. Because every row and column has a fixed size, the grid can work out from the scroll
position which rows and columns are on screen (plus a few extra around the edges) and only
renders those — usually around 500 cells. Clicks are handled once on the grid by turning the
mouse position into a row and column, instead of attaching handlers to every cell.

### Undo and redo (`useSpreadsheet.ts`)

Every change is a list of `{ address, before, after }`. Undo writes the `before` texts back
through the normal `setCells` path, so dependent formulas recalculate as usual; redo writes the
`after` texts. A fill or paste is one undo step.

## Limitations

These are simplified or not implemented:

- The grid is a fixed 1,000 × 26 (A–Z). Columns can't be resized, and rows/columns can't be inserted or deleted.
- No cell formatting (bold, colors, number formats, dates). Numbers display with up to 12 significant digits.
- No date/time functions, and no functions that change on their own such as `TODAY()` or `RAND()`.
- Whole-column references like `A:A`, named ranges, multiple sheets and array formulas are not supported.
- Text criteria in `SUMIF`/`COUNTIF` don't support `*` and `?` wildcards.
- Clicking a cell while typing a formula doesn't insert its reference (unlike Excel); it saves the edit instead.
- Cut (Ctrl+X) isn't implemented; use copy, then Delete.
- Text doesn't spill over into empty neighboring cells; long text is cut off with "…" (hover to see it all).
- Some cells inside a more tangled cycle may show `#CIRC!` with "comes from" another cell in the loop
  instead of listing their own loop. They still show the error and never loop forever.
- Approximate-match lookups (`VLOOKUP` with `TRUE`, `MATCH` with 1 or -1) assume the data is sorted, like Excel.
- Nothing is saved: reloading the page starts again from the sample data.
- Very long dependency chains (tens of thousands of formulas each reading the one before) could hit the
  browser's recursion limit. Chains of 1,000 are tested.
