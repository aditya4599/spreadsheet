// The Sheet stores every cell and keeps calculated values up to date.
//
// For each cell we keep:
//   - raw:   exactly what the user typed ("=A1*2", "42", "hello")
//   - value: the calculated result shown in the grid (84, 42, "hello")
//
// Dependency tracking
// -------------------
// When B1 contains =A1*2, B1 "depends on" A1. We store that edge in both directions:
//   precedents.get("B1")  = { "A1" }   (cells B1 reads)
//   dependents.get("A1")  = { "B1" }   (cells that read A1)
//
// When A1 changes, we follow `dependents` to find every cell that might change
// (B1, then anything that reads B1, and so on) and recalculate only those,
// in an order where each cell is calculated after the cells it reads.

import { parseAddress, toAddress } from "./cellAddress";
import { FormulaSyntaxError } from "./errors";
import { collectReferences, evaluateFormula } from "./evaluator";
import { parseFormula, type Expression } from "./parser";
import { CellError, parseLiteralInput, type CellValue } from "./values";

interface CellRecord {
  raw: string;
  value: CellValue;
  /** Present when raw is a formula that parsed successfully. */
  formula?: Expression;
  /** Present when raw is a formula with a syntax mistake. */
  syntaxError?: FormulaSyntaxError;
}

export interface CellChange {
  address: string;
  raw: string;
}

export interface RecalcResult {
  /** Formula cells that were recalculated because of this change. */
  recalculated: string[];
}

export class Sheet {
  private cells = new Map<string, CellRecord>();
  private precedents = new Map<string, Set<string>>();
  private dependents = new Map<string, Set<string>>();

  // ---- reading ----

  getRaw(address: string): string {
    return this.cells.get(address)?.raw ?? "";
  }

  getValue(address: string): CellValue {
    return this.cells.get(address)?.value ?? null;
  }

  getSyntaxError(address: string): FormulaSyntaxError | undefined {
    return this.cells.get(address)?.syntaxError;
  }

  /** Every non-empty cell as [address, raw] pairs. */
  entries(): [string, string][] {
    return [...this.cells].map(([address, cell]) => [address, cell.raw]);
  }

  // ---- writing ----

  /** Changes one or more cells, then recalculates everything affected. */
  setCells(changes: CellChange[]): RecalcResult {
    for (const { address, raw } of changes) {
      this.storeCell(address, raw);
    }
    return this.recalculate(changes.map((change) => change.address));
  }

  clear(): void {
    this.cells.clear();
    this.precedents.clear();
    this.dependents.clear();
  }

  /** Saves the raw input, parses formulas, and updates the dependency edges. */
  private storeCell(address: string, raw: string): void {
    this.removeEdges(address);

    if (raw.trim() === "") {
      this.cells.delete(address);
      return;
    }

    if (!raw.startsWith("=")) {
      this.cells.set(address, { raw, value: parseLiteralInput(raw) });
      return;
    }

    try {
      const formula = parseFormula(raw);
      // The value is filled in by recalculate().
      this.cells.set(address, { raw, value: null, formula });
      for (const position of collectReferences(formula)) {
        this.addEdge(address, toAddress(position));
      }
    } catch (error) {
      if (!(error instanceof FormulaSyntaxError)) throw error;
      this.cells.set(address, {
        raw,
        syntaxError: error,
        value: new CellError(error.code, error.message),
      });
    }
  }

  private addEdge(from: string, to: string): void {
    if (!this.precedents.has(from)) this.precedents.set(from, new Set());
    if (!this.dependents.has(to)) this.dependents.set(to, new Set());
    this.precedents.get(from)!.add(to);
    this.dependents.get(to)!.add(from);
  }

  private removeEdges(address: string): void {
    for (const target of this.precedents.get(address) ?? []) {
      this.dependents.get(target)?.delete(address);
    }
    this.precedents.delete(address);
  }

  // ---- recalculation ----

  private recalculate(changedAddresses: string[]): RecalcResult {
    // 1. Find every cell affected by the change: the changed cells plus
    //    everything that depends on them, directly or indirectly.
    const affected = new Set<string>();
    const queue = [...changedAddresses];
    while (queue.length > 0) {
      const address = queue.pop()!;
      if (affected.has(address)) continue;
      affected.add(address);
      for (const dependent of this.dependents.get(address) ?? []) queue.push(dependent);
    }

    // 2. Put them in calculation order and find circular references.
    const { order, cycles } = this.orderForCalculation(affected);

    // 3. Cells in a cycle get a #CIRC! error instead of being calculated.
    const inCycle = new Set<string>();
    for (const cycle of cycles) {
      const path = [...cycle, cycle[0]].join(" → ");
      for (const address of cycle) {
        inCycle.add(address);
        const cell = this.cells.get(address);
        if (cell) {
          cell.value = new CellError("#CIRC!", `Circular reference: ${path}. A formula can't depend on its own result.`);
        }
      }
    }

    // 4. Calculate the remaining formulas in order.
    const recalculated: string[] = [];
    const readCell = (position: { row: number; col: number }) => this.getValue(toAddress(position));
    for (const address of order) {
      const cell = this.cells.get(address);
      if (!cell?.formula) continue;
      recalculated.push(address);
      if (inCycle.has(address)) continue;
      cell.value = evaluateFormula(cell.formula, readCell);
    }

    return { recalculated };
  }

  /**
   * Orders cells so every cell comes after the cells it reads (a "topological sort"),
   * using depth-first search. While searching we mark cells as:
   *   "visiting" – we are in the middle of exploring it
   *   "done"     – it and everything it reads is already in `order`
   * If we reach a cell that is still "visiting", we have walked in a circle:
   * the cells on the current path from that cell onwards form a cycle.
   */
  private orderForCalculation(affected: Set<string>): { order: string[]; cycles: string[][] } {
    const order: string[] = [];
    const cycles: string[][] = [];
    const state = new Map<string, "visiting" | "done">();
    const path: string[] = [];

    const visit = (address: string) => {
      const current = state.get(address);
      if (current === "done") return;
      if (current === "visiting") {
        cycles.push(path.slice(path.indexOf(address)));
        return;
      }
      state.set(address, "visiting");
      path.push(address);
      // Only cells inside `affected` need ordering; the rest already have up-to-date values.
      for (const precedent of this.precedents.get(address) ?? []) {
        if (affected.has(precedent)) visit(precedent);
      }
      path.pop();
      state.set(address, "done");
      order.push(address);
    };

    // Sort for a stable, predictable order (A1, A2, ... rather than insertion order).
    for (const address of [...affected].sort(compareAddresses)) visit(address);
    return { order, cycles };
  }
}

function compareAddresses(a: string, b: string): number {
  const pa = parseAddress(a)!;
  const pb = parseAddress(b)!;
  return pa.row - pb.row || pa.col - pb.col;
}
