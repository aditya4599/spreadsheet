import { parseAddress } from "../engine/cellAddress";
import { formatValue } from "../engine/values";
import type { SpreadsheetController } from "../hooks/useSpreadsheet";

/** Bottom bar: what the last edit recalculated, and quick stats for the selected numbers. */
export function StatusBar({ controller }: { controller: SpreadsheetController }) {
  const { sheet, selectedRange, lastUpdate, editing } = controller;

  // Only look at non-empty cells, so selecting a whole column stays cheap.
  const numbers: number[] = [];
  let filledCount = 0;
  for (const [address] of sheet.entries()) {
    const { row, col } = parseAddress(address)!;
    const inside =
      row >= selectedRange.start.row && row <= selectedRange.end.row &&
      col >= selectedRange.start.col && col <= selectedRange.end.col;
    if (!inside) continue;
    filledCount++;
    const value = sheet.getValue(address);
    if (typeof value === "number") numbers.push(value);
  }
  const multiple = filledCount > 1;
  const sum = numbers.reduce((total, n) => total + n, 0);

  let message = "Ready";
  if (editing) {
    message = editing.draft.startsWith("=") ? "Editing formula. Press Enter to save, Esc to cancel." : "Editing. Press Enter to save, Esc to cancel.";
  } else if (lastUpdate) {
    const cells = lastUpdate.changedCount === 1 ? "1 cell" : `${lastUpdate.changedCount} cells`;
    const formulas = lastUpdate.recalculatedCount === 1 ? "1 formula" : `${lastUpdate.recalculatedCount} formulas`;
    message = `Changed ${cells}, recalculated ${formulas}`;
  }

  return (
    <footer className="status-bar">
      <span>{message}</span>
      {multiple && (
        <span className="status-stats">
          <span>Count: {filledCount}</span>
          {numbers.length > 0 && <span>Sum: {formatValue(sum)}</span>}
          {numbers.length > 0 && <span>Average: {formatValue(sum / numbers.length)}</span>}
        </span>
      )}
    </footer>
  );
}
