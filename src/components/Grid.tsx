// The scrollable grid. Only the rows and columns currently on screen are rendered
// ("virtualization"): a full-size empty canvas gives the scrollbars the right size,
// and the visible cells are absolutely positioned on top of it.

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import {
  COLUMN_COUNT,
  columnToLetters,
  ROW_COUNT,
  toAddress,
  type CellPosition,
  type CellRange,
} from "../engine/cellAddress";
import { shiftFormula } from "../engine/fill";
import { formatValue, isError, type CellValue } from "../engine/values";
import type { SpreadsheetController } from "../hooks/useSpreadsheet";
import { Cell, type CellKind } from "./Cell";
import { CellEditor } from "./CellEditor";
import { COLUMN_WIDTH, HEADER_HEIGHT, ROW_HEADER_WIDTH, ROW_HEIGHT } from "./gridSizes";

/** Extra rows/columns rendered just outside the screen so fast scrolling doesn't show gaps. */
const OVERSCAN = 3;

interface GridProps {
  controller: SpreadsheetController;
  containerRef: RefObject<HTMLDivElement | null>;
}

type DragState = { mode: "select" } | { mode: "fill"; pointer: CellPosition | null };

export function Grid({ controller, containerRef }: GridProps) {
  const { sheet, selection, selectedRange, active, editing } = controller;
  const cellsLayerRef = useRef<HTMLDivElement>(null);
  const lastCopy = useRef<{ text: string; origin: CellPosition } | null>(null);

  const [scroll, setScroll] = useState({ top: 0, left: 0 });
  const [viewport, setViewport] = useState({ width: 800, height: 600 });
  const [drag, setDrag] = useState<DragState | null>(null);

  // ---- virtualization: which rows and columns are on screen? ----

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      setViewport({ width: element.clientWidth, height: element.clientHeight });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [containerRef]);

  const firstRow = Math.max(0, Math.floor(scroll.top / ROW_HEIGHT) - OVERSCAN);
  const lastRow = Math.min(ROW_COUNT - 1, Math.ceil((scroll.top + viewport.height) / ROW_HEIGHT) + OVERSCAN);
  const firstCol = Math.max(0, Math.floor(scroll.left / COLUMN_WIDTH) - OVERSCAN);
  const lastCol = Math.min(COLUMN_COUNT - 1, Math.ceil((scroll.left + viewport.width) / COLUMN_WIDTH) + OVERSCAN);

  // ---- keep the selected cell visible when moving with the keyboard ----

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const { row, col } = selection.focus;
    const visibleHeight = element.clientHeight - HEADER_HEIGHT;
    const visibleWidth = element.clientWidth - ROW_HEADER_WIDTH;
    // When a whole column (or row) is selected, don't jump to its far end.
    const wholeColumn = selectedRange.start.row === 0 && selectedRange.end.row === ROW_COUNT - 1;
    const wholeRow = selectedRange.start.col === 0 && selectedRange.end.col === COLUMN_COUNT - 1;

    const top = row * ROW_HEIGHT;
    if (!wholeColumn) {
      if (top < element.scrollTop) element.scrollTop = top;
      else if (top + ROW_HEIGHT > element.scrollTop + visibleHeight) element.scrollTop = top + ROW_HEIGHT - visibleHeight;
    }

    const left = col * COLUMN_WIDTH;
    if (!wholeRow) {
      if (left < element.scrollLeft) element.scrollLeft = left;
      else if (left + COLUMN_WIDTH > element.scrollLeft + visibleWidth) element.scrollLeft = left + COLUMN_WIDTH - visibleWidth;
    }
    // Only re-run when the focus cell moves; selectedRange always changes together with it.
  }, [selection.focus, containerRef]);

  // ---- mouse: click, drag-select, fill handle ----

  /** Which cell is under the mouse? Works even when the mouse is outside the grid. */
  function cellAtPoint(clientX: number, clientY: number): CellPosition {
    const rect = cellsLayerRef.current!.getBoundingClientRect();
    return {
      row: Math.max(0, Math.min(ROW_COUNT - 1, Math.floor((clientY - rect.top) / ROW_HEIGHT))),
      col: Math.max(0, Math.min(COLUMN_COUNT - 1, Math.floor((clientX - rect.left) / COLUMN_WIDTH))),
    };
  }

  function handleMouseDown(event: React.MouseEvent) {
    if (event.button !== 0) return;
    event.preventDefault(); // stop the browser from selecting text while dragging
    if (editing) controller.commitEditing();
    containerRef.current?.focus();

    if ((event.target as HTMLElement).dataset.fillHandle) {
      setDrag({ mode: "fill", pointer: null });
      return;
    }
    controller.selectCell(cellAtPoint(event.clientX, event.clientY), event.shiftKey);
    setDrag({ mode: "select" });
  }

  useEffect(() => {
    if (!drag) return;
    const onMove = (event: MouseEvent) => {
      const position = cellAtPoint(event.clientX, event.clientY);
      if (drag.mode === "select") controller.selectCell(position, true);
      else setDrag({ mode: "fill", pointer: position });
    };
    const onUp = () => {
      if (drag.mode === "fill" && drag.pointer) {
        const target = fillTarget(selectedRange, drag.pointer);
        if (target) controller.fillTo(target);
      }
      setDrag(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [drag, controller, selectedRange]);

  function selectWholeColumn(col: number, extend: boolean) {
    const anchorCol = extend ? selection.anchor.col : col;
    controller.selectRange({ row: 0, col: anchorCol }, { row: ROW_COUNT - 1, col });
  }

  function selectWholeRow(row: number, extend: boolean) {
    const anchorRow = extend ? selection.anchor.row : row;
    controller.selectRange({ row: anchorRow, col: 0 }, { row, col: COLUMN_COUNT - 1 });
  }

  // ---- keyboard ----

  function handleKeyDown(event: React.KeyboardEvent) {
    const ctrl = event.ctrlKey || event.metaKey;
    const key = event.key;

    if (ctrl) {
      const lower = key.toLowerCase();
      if (lower === "z") event.shiftKey ? controller.redo() : controller.undo();
      else if (lower === "y") controller.redo();
      else if (lower === "a") controller.selectAll();
      else if (lower === "d") controller.fillDown();
      else if (key === "Home") controller.selectCell({ row: 0, col: 0 });
      else return; // let the browser handle Ctrl+C / Ctrl+V (see the copy/paste handlers)
      event.preventDefault();
      return;
    }

    const pageRows = Math.max(1, Math.floor((viewport.height - HEADER_HEIGHT) / ROW_HEIGHT) - 1);
    switch (key) {
      case "ArrowUp": controller.moveSelection(-1, 0, event.shiftKey); break;
      case "ArrowDown": controller.moveSelection(1, 0, event.shiftKey); break;
      case "ArrowLeft": controller.moveSelection(0, -1, event.shiftKey); break;
      case "ArrowRight": controller.moveSelection(0, 1, event.shiftKey); break;
      case "PageUp": controller.moveSelection(-pageRows, 0, event.shiftKey); break;
      case "PageDown": controller.moveSelection(pageRows, 0, event.shiftKey); break;
      case "Home": controller.selectCell({ row: active.row, col: 0 }); break;
      case "Tab": controller.moveSelection(0, event.shiftKey ? -1 : 1); break;
      case "Enter":
        if (event.shiftKey) controller.moveSelection(-1, 0);
        else controller.startEditing("cell");
        break;
      case "F2": controller.startEditing("cell"); break;
      case "Delete":
      case "Backspace": controller.clearRange(selectedRange); break;
      case "Escape": controller.selectCell(active); break;
      default:
        // Typing a character starts editing and replaces the cell's content.
        if (key.length === 1 && !event.altKey) {
          controller.startEditing("cell", key);
          break;
        }
        return;
    }
    event.preventDefault();
  }

  // ---- copy & paste (tab-separated text, compatible with other spreadsheets) ----

  function handleCopy(event: React.ClipboardEvent) {
    if (editing) return;
    const lines: string[] = [];
    for (let row = selectedRange.start.row; row <= selectedRange.end.row; row++) {
      const values: string[] = [];
      for (let col = selectedRange.start.col; col <= selectedRange.end.col; col++) {
        values.push(sheet.getRaw(toAddress({ row, col })));
      }
      lines.push(values.join("\t"));
    }
    const text = lines.join("\n");
    event.clipboardData.setData("text/plain", text);
    event.preventDefault();
    lastCopy.current = { text, origin: selectedRange.start };
  }

  function handlePaste(event: React.ClipboardEvent) {
    if (editing) return;
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain").replace(/\r?\n$/, "");
    if (text === "") return;
    const rows = text.split(/\r?\n/).map((line) => line.split("\t"));

    // If this is our own copy, move formula references like a spreadsheet does.
    const fromHere = lastCopy.current?.text === text ? lastCopy.current.origin : null;
    const changes = [];
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < rows[r].length; c++) {
        const position = { row: active.row + r, col: active.col + c };
        if (position.row >= ROW_COUNT || position.col >= COLUMN_COUNT) continue;
        const raw = fromHere
          ? shiftFormula(rows[r][c], active.row - fromHere.row, active.col - fromHere.col)
          : rows[r][c];
        changes.push({ address: toAddress(position), raw });
      }
    }
    controller.applyChanges(changes);
    const width = Math.max(...rows.map((row) => row.length));
    controller.selectRange(active, { row: active.row + rows.length - 1, col: active.col + width - 1 });
  }

  // ---- rendering ----

  const isMultiSelect =
    selectedRange.start.row !== selectedRange.end.row || selectedRange.start.col !== selectedRange.end.col;

  const cells = [];
  for (let row = firstRow; row <= lastRow; row++) {
    for (let col = firstCol; col <= lastCol; col++) {
      const value = sheet.getValue(toAddress({ row, col }));
      cells.push(
        <Cell
          key={`${row}:${col}`}
          row={row}
          col={col}
          text={formatValue(value)}
          kind={cellKind(value)}
          inSelection={isMultiSelect && isInside(selectedRange, { row, col })}
        />,
      );
    }
  }

  const columnHeaders = [];
  for (let col = firstCol; col <= lastCol; col++) {
    const selected = col >= selectedRange.start.col && col <= selectedRange.end.col;
    columnHeaders.push(
      <div
        key={col}
        className={`header column-header${selected ? " header-selected" : ""}`}
        style={{ left: ROW_HEADER_WIDTH + col * COLUMN_WIDTH, width: COLUMN_WIDTH }}
        onMouseDown={(event) => {
          event.preventDefault();
          containerRef.current?.focus();
          selectWholeColumn(col, event.shiftKey);
        }}
      >
        {columnToLetters(col)}
      </div>,
    );
  }

  const rowHeaders = [];
  for (let row = firstRow; row <= lastRow; row++) {
    const selected = row >= selectedRange.start.row && row <= selectedRange.end.row;
    rowHeaders.push(
      <div
        key={row}
        className={`header row-header${selected ? " header-selected" : ""}`}
        style={{ top: row * ROW_HEIGHT, height: ROW_HEIGHT }}
        onMouseDown={(event) => {
          event.preventDefault();
          containerRef.current?.focus();
          selectWholeRow(row, event.shiftKey);
        }}
      >
        {row + 1}
      </div>,
    );
  }

  const fillPreview = drag?.mode === "fill" && drag.pointer ? fillTarget(selectedRange, drag.pointer) : null;

  return (
    <div
      className="grid-scroll"
      ref={containerRef}
      tabIndex={0}
      onScroll={(event) => setScroll({ top: event.currentTarget.scrollTop, left: event.currentTarget.scrollLeft })}
      onKeyDown={handleKeyDown}
      onCopy={handleCopy}
      onPaste={handlePaste}
      aria-label="Spreadsheet grid"
    >
      <div
        className="grid-canvas"
        style={{
          width: ROW_HEADER_WIDTH + COLUMN_COUNT * COLUMN_WIDTH,
          height: HEADER_HEIGHT + ROW_COUNT * ROW_HEIGHT,
        }}
      >
        {/* Sticky to the top: the column letters. */}
        <div className="column-header-bar" style={{ height: HEADER_HEIGHT }}>
          <div
            className="header corner"
            style={{ width: ROW_HEADER_WIDTH, height: HEADER_HEIGHT }}
            title="Select all"
            onMouseDown={(event) => {
              event.preventDefault();
              containerRef.current?.focus();
              controller.selectAll();
            }}
          />
          {columnHeaders}
        </div>

        {/* Sticky to the left: the row numbers. */}
        <div className="row-header-bar" style={{ width: ROW_HEADER_WIDTH, height: ROW_COUNT * ROW_HEIGHT }}>
          {rowHeaders}
        </div>

        <div
          className="cells-layer"
          ref={cellsLayerRef}
          style={{ top: HEADER_HEIGHT, left: ROW_HEADER_WIDTH, width: COLUMN_COUNT * COLUMN_WIDTH, height: ROW_COUNT * ROW_HEIGHT }}
          onMouseDown={handleMouseDown}
          onDoubleClick={() => controller.startEditing("cell")}
        >
          {cells}

          <SelectionBox range={selectedRange} showFillHandle={!editing} />
          <div className="active-cell" style={rangeStyle({ start: active, end: active })} />
          {fillPreview && <div className="fill-preview" style={rangeStyle(fillPreview)} />}

          {editing?.source === "cell" && (
            <CellEditor
              value={editing.draft}
              top={active.row * ROW_HEIGHT}
              left={active.col * COLUMN_WIDTH}
              minWidth={COLUMN_WIDTH}
              height={ROW_HEIGHT}
              onChange={controller.updateDraft}
              onCommit={(move) => {
                controller.commitEditing(move);
                containerRef.current?.focus();
              }}
              onCancel={() => {
                controller.cancelEditing();
                containerRef.current?.focus();
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SelectionBox({ range, showFillHandle }: { range: CellRange; showFillHandle: boolean }) {
  return (
    <div className="selection-box" style={rangeStyle(range)}>
      {showFillHandle && <div className="fill-handle" data-fill-handle="true" title="Drag to fill" />}
    </div>
  );
}

function rangeStyle(range: CellRange): React.CSSProperties {
  return {
    top: range.start.row * ROW_HEIGHT,
    left: range.start.col * COLUMN_WIDTH,
    width: (range.end.col - range.start.col + 1) * COLUMN_WIDTH,
    height: (range.end.row - range.start.row + 1) * ROW_HEIGHT,
  };
}

function isInside(range: CellRange, pos: CellPosition): boolean {
  return pos.row >= range.start.row && pos.row <= range.end.row && pos.col >= range.start.col && pos.col <= range.end.col;
}

function cellKind(value: CellValue): CellKind {
  if (value === null) return "empty";
  if (isError(value)) return "error";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "text";
}

/**
 * While dragging the fill handle, extend the selection toward the mouse,
 * either vertically or horizontally (whichever the mouse has moved further in).
 */
function fillTarget(range: CellRange, pointer: CellPosition): CellRange | null {
  const rowsBelow = pointer.row - range.end.row;
  const rowsAbove = range.start.row - pointer.row;
  const colsRight = pointer.col - range.end.col;
  const colsLeft = range.start.col - pointer.col;
  const vertical = Math.max(rowsBelow, rowsAbove, 0);
  const horizontal = Math.max(colsRight, colsLeft, 0);

  if (vertical === 0 && horizontal === 0) return null;
  if (vertical >= horizontal) {
    return rowsBelow > 0
      ? { start: range.start, end: { row: pointer.row, col: range.end.col } }
      : { start: { row: pointer.row, col: range.start.col }, end: range.end };
  }
  return colsRight > 0
    ? { start: range.start, end: { row: range.end.row, col: pointer.col } }
    : { start: { row: range.start.row, col: pointer.col }, end: range.end };
}
