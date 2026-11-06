import { useEffect, useRef } from "react";

interface CellEditorProps {
  value: string;
  top: number;
  left: number;
  minWidth: number;
  height: number;
  onChange: (value: string) => void;
  /** Saves the edit; `move` says where the selection goes next (Enter = down, Tab = right). */
  onCommit: (move: { rows: number; cols: number }) => void;
  onCancel: () => void;
}

/** The text box that appears on top of a cell while you type into it. */
export function CellEditor({ value, top, left, minWidth, height, onChange, onCommit, onCancel }: CellEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus once when the editor opens, with the cursor at the end of the text.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, []);

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    // Keep keys inside the editor so the grid doesn't also react to them.
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      onCommit({ rows: event.shiftKey ? -1 : 1, cols: 0 });
    } else if (event.key === "Tab") {
      event.preventDefault();
      onCommit({ rows: 0, cols: event.shiftKey ? -1 : 1 });
    } else if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  }

  // Grow wider for long text so the whole formula stays readable.
  const width = Math.min(480, Math.max(minWidth, value.length * 8 + 20));

  return (
    <input
      ref={inputRef}
      className="cell-editor"
      style={{ top, left, width, height }}
      value={value}
      spellCheck={false}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={handleKeyDown}
      onMouseDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onCopy={(event) => event.stopPropagation()}
      onPaste={(event) => event.stopPropagation()}
      aria-label="Cell editor"
    />
  );
}
