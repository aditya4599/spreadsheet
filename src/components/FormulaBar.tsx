import { rangeToString, toAddress } from "../engine/cellAddress";
import type { SpreadsheetController } from "../hooks/useSpreadsheet";

interface FormulaBarProps {
  controller: SpreadsheetController;
  focusGrid: () => void;
}

/** Shows the selected cell's address and its raw contents (the formula, not the result). */
export function FormulaBar({ controller, focusGrid }: FormulaBarProps) {
  const { sheet, active, selectedRange, editing } = controller;
  const value = editing ? editing.draft : sheet.getRaw(toAddress(active));

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      controller.commitEditing();
      focusGrid();
    } else if (event.key === "Tab") {
      event.preventDefault();
      controller.commitEditing({ rows: 0, cols: event.shiftKey ? -1 : 1 });
      focusGrid();
    } else if (event.key === "Escape") {
      event.preventDefault();
      controller.cancelEditing();
      focusGrid();
    }
  }

  return (
    <div className="formula-bar">
      <div className="name-box" aria-label="Selected cells">
        {rangeToString(selectedRange)}
      </div>
      <span className="fx-label" aria-hidden="true">
        fx
      </span>
      <input
        className="formula-input"
        value={value}
        spellCheck={false}
        placeholder="Type a value, or a formula starting with ="
        // Continue an in-cell edit if one is in progress, otherwise start from the cell's content.
        onFocus={() => controller.startEditing("formulaBar", editing?.draft)}
        onChange={(event) => controller.updateDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        aria-label="Formula bar"
      />
    </div>
  );
}
