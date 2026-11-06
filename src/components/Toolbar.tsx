import type { SpreadsheetController } from "../hooks/useSpreadsheet";

interface ToolbarProps {
  controller: SpreadsheetController;
  showFunctions: boolean;
  onToggleFunctions: () => void;
}

export function Toolbar({ controller, showFunctions, onToggleFunctions }: ToolbarProps) {
  return (
    <header className="toolbar">
      <h1 className="app-title">Spreadsheet</h1>

      <div className="toolbar-group">
        <button onClick={controller.undo} disabled={!controller.canUndo} title="Undo (Ctrl+Z)">
          Undo
        </button>
        <button onClick={controller.redo} disabled={!controller.canRedo} title="Redo (Ctrl+Y)">
          Redo
        </button>
      </div>

      <div className="toolbar-group">
        <button onClick={controller.newBlankSheet} title="Clear every cell (can be undone)">
          New blank sheet
        </button>
        <button onClick={controller.loadSample} title="Replace the sheet with the sample order data (can be undone)">
          Load sample data
        </button>
      </div>

      <div className="toolbar-spacer" />

      <button className={showFunctions ? "toggle-on" : ""} onClick={onToggleFunctions} aria-pressed={showFunctions}>
        Functions
      </button>
    </header>
  );
}
