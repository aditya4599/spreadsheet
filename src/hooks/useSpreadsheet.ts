// All spreadsheet state for the UI: the Sheet, the selection, editing, and undo/redo.
// Components call the functions returned from this hook instead of touching the Sheet directly.

import { useCallback, useMemo, useRef, useState } from "react";
import {
  COLUMN_COUNT,
  normalizeRange,
  parseAddress,
  ROW_COUNT,
  toAddress,
  type CellPosition,
  type CellRange,
} from "../engine/cellAddress";
import { buildFillChanges } from "../engine/fill";
import { Sheet, type CellChange } from "../engine/sheet";
import { SAMPLE_CELLS } from "../sampleData";

/** anchor is where the selection started (the "active" cell); focus is the opposite corner. */
export interface Selection {
  anchor: CellPosition;
  focus: CellPosition;
}

export interface EditState {
  draft: string;
  /** Where the user is typing: directly in the cell, or in the formula bar. */
  source: "cell" | "formulaBar";
}

/** One undo step: every cell that changed, with its text before and after. */
interface HistoryEntry {
  changes: { address: string; before: string; after: string }[];
  selection: Selection;
}

export interface LastUpdate {
  changedCount: number;
  recalculatedCount: number;
}

/** Keeps a position inside the grid. */
function clamp(pos: CellPosition): CellPosition {
  return {
    row: Math.max(0, Math.min(ROW_COUNT - 1, pos.row)),
    col: Math.max(0, Math.min(COLUMN_COUNT - 1, pos.col)),
  };
}

const START: Selection = { anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } };

export function useSpreadsheet() {
  // The Sheet is a normal class that changes in place, so it lives in a ref.
  // `version` is bumped after every change to tell React to re-render.
  const sheetRef = useRef<Sheet | null>(null);
  if (sheetRef.current === null) {
    sheetRef.current = new Sheet();
    sheetRef.current.setCells(SAMPLE_CELLS.map(([address, raw]) => ({ address, raw })));
  }
  const sheet = sheetRef.current;

  const [version, setVersion] = useState(0);
  const [selection, setSelection] = useState<Selection>(START);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [lastUpdate, setLastUpdate] = useState<LastUpdate | null>(null);

  const undoStack = useRef<HistoryEntry[]>([]);
  const redoStack = useRef<HistoryEntry[]>([]);

  const active = selection.anchor;
  const selectedRange = useMemo(() => normalizeRange(selection.anchor, selection.focus), [selection]);

  // ---- changing cells ----

  /** Writes cells, records an undo step, and refreshes the screen. */
  const applyChanges = useCallback(
    (changes: CellChange[]) => {
      const realChanges = changes
        .map((change) => ({ ...change, before: sheet.getRaw(change.address) }))
        .filter((change) => change.before !== change.raw);
      if (realChanges.length === 0) return;

      undoStack.current.push({
        changes: realChanges.map(({ address, before, raw }) => ({ address, before, after: raw })),
        selection,
      });
      redoStack.current = []; // a new edit makes the old "future" invalid

      const result = sheet.setCells(realChanges);
      setLastUpdate({ changedCount: realChanges.length, recalculatedCount: result.recalculated.length });
      setVersion((v) => v + 1);
    },
    [sheet, selection],
  );

  const undo = useCallback(() => {
    const entry = undoStack.current.pop();
    if (!entry) return;
    redoStack.current.push(entry);
    sheet.setCells(entry.changes.map(({ address, before }) => ({ address, raw: before })));
    setSelection(entry.selection);
    setEditing(null);
    setLastUpdate(null);
    setVersion((v) => v + 1);
  }, [sheet]);

  const redo = useCallback(() => {
    const entry = redoStack.current.pop();
    if (!entry) return;
    undoStack.current.push(entry);
    sheet.setCells(entry.changes.map(({ address, after }) => ({ address, raw: after })));
    setSelection(entry.selection);
    setEditing(null);
    setLastUpdate(null);
    setVersion((v) => v + 1);
  }, [sheet]);

  /** Empties every non-empty cell in the range. */
  const clearRange = useCallback(
    (range: CellRange) => {
      const changes: CellChange[] = [];
      for (const [address] of sheet.entries()) {
        const pos = parseAddress(address)!;
        const inside =
          pos.row >= range.start.row && pos.row <= range.end.row &&
          pos.col >= range.start.col && pos.col <= range.end.col;
        if (inside) changes.push({ address, raw: "" });
      }
      applyChanges(changes);
    },
    [sheet, applyChanges],
  );

  /** Replaces the whole sheet. Done as one change so it can be undone. */
  const replaceSheet = useCallback(
    (cells: [string, string][]) => {
      const changes = new Map<string, string>();
      for (const [address] of sheet.entries()) changes.set(address, "");
      for (const [address, raw] of cells) changes.set(address, raw);
      applyChanges([...changes].map(([address, raw]) => ({ address, raw })));
      setSelection(START);
      setEditing(null);
    },
    [sheet, applyChanges],
  );

  // ---- selection ----

  const selectCell = useCallback((pos: CellPosition, extend = false) => {
    const target = clamp(pos);
    setSelection((current) => (extend ? { anchor: current.anchor, focus: target } : { anchor: target, focus: target }));
  }, []);

  /** Moves the active cell (or, with extend, the selection corner) by a number of rows/columns. */
  const moveSelection = useCallback((rowDelta: number, colDelta: number, extend = false) => {
    setSelection((current) => {
      const from = extend ? current.focus : current.anchor;
      const target = clamp({ row: from.row + rowDelta, col: from.col + colDelta });
      return extend ? { anchor: current.anchor, focus: target } : { anchor: target, focus: target };
    });
  }, []);

  const selectRange = useCallback((anchor: CellPosition, focus: CellPosition) => {
    setSelection({ anchor: clamp(anchor), focus: clamp(focus) });
  }, []);

  const selectAll = useCallback(() => {
    setSelection({ anchor: { row: 0, col: 0 }, focus: { row: ROW_COUNT - 1, col: COLUMN_COUNT - 1 } });
  }, []);

  // ---- editing ----

  const startEditing = useCallback(
    (source: EditState["source"], initialDraft?: string) => {
      setEditing({ source, draft: initialDraft ?? sheet.getRaw(toAddress(active)) });
    },
    [sheet, active],
  );

  const updateDraft = useCallback((draft: string) => {
    setEditing((current) => (current ? { ...current, draft } : current));
  }, []);

  const cancelEditing = useCallback(() => setEditing(null), []);

  /** Saves the draft into the active cell, then optionally moves the selection. */
  const commitEditing = useCallback(
    (move?: { rows: number; cols: number }) => {
      if (!editing) return;
      applyChanges([{ address: toAddress(active), raw: editing.draft }]);
      setEditing(null);
      if (move) moveSelection(move.rows, move.cols);
    },
    [editing, active, applyChanges, moveSelection],
  );

  // ---- fill ----

  /** Fills from the current selection into `target` (which contains the selection). */
  const fillTo = useCallback(
    (target: CellRange) => {
      applyChanges(buildFillChanges(selectedRange, target, (address) => sheet.getRaw(address)));
      setSelection({ anchor: target.start, focus: target.end });
    },
    [applyChanges, selectedRange, sheet],
  );

  /** Ctrl+D: copies the top row of the selection down through the rest of it. */
  const fillDown = useCallback(() => {
    if (selectedRange.start.row === selectedRange.end.row) return;
    const topRow: CellRange = { start: selectedRange.start, end: { row: selectedRange.start.row, col: selectedRange.end.col } };
    // Fill from the top row only: one source row repeats, so no number series is created.
    applyChanges(buildFillChanges(topRow, selectedRange, (address) => sheet.getRaw(address)));
  }, [applyChanges, selectedRange, sheet]);

  return {
    sheet,
    version,
    selection,
    selectedRange,
    active,
    editing,
    lastUpdate,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
    applyChanges,
    undo,
    redo,
    clearRange,
    loadSample: () => replaceSheet(SAMPLE_CELLS),
    newBlankSheet: () => replaceSheet([]),
    selectCell,
    moveSelection,
    selectRange,
    selectAll,
    startEditing,
    updateDraft,
    cancelEditing,
    commitEditing,
    fillTo,
    fillDown,
  };
}

export type SpreadsheetController = ReturnType<typeof useSpreadsheet>;
