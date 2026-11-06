import { memo } from "react";
import { COLUMN_WIDTH, ROW_HEIGHT } from "./gridSizes";

export type CellKind = "empty" | "number" | "text" | "boolean" | "error";

interface CellProps {
  row: number;
  col: number;
  text: string;
  kind: CellKind;
  inSelection: boolean;
}

/**
 * One grid cell. It only displays text; clicks are handled once by the Grid
 * (by working out which cell is under the mouse) instead of on every cell.
 * memo() skips re-rendering cells whose props didn't change, which keeps scrolling smooth.
 */
export const Cell = memo(function Cell({ row, col, text, kind, inSelection }: CellProps) {
  return (
    <div
      className={`cell cell-${kind}${inSelection ? " cell-in-selection" : ""}`}
      style={{ top: row * ROW_HEIGHT, left: col * COLUMN_WIDTH, width: COLUMN_WIDTH, height: ROW_HEIGHT }}
      title={text.length > 14 ? text : undefined}
    >
      {text}
    </div>
  );
});
