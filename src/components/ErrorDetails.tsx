import { parseAddress, toAddress } from "../engine/cellAddress";
import { caretDiagram } from "../engine/errors";
import { isError } from "../engine/values";
import type { SpreadsheetController } from "../hooks/useSpreadsheet";

/**
 * Explains the error in the selected cell, if there is one.
 * Syntax errors show the formula with a caret (^) under the problem and a suggestion.
 */
export function ErrorDetails({ controller }: { controller: SpreadsheetController }) {
  const { sheet, active, editing } = controller;
  if (editing) return null;

  const address = toAddress(active);
  const value = sheet.getValue(address);
  if (!isError(value)) return null;

  const syntaxError = sheet.getSyntaxError(address);
  const origin = value.origin;

  return (
    <div className="error-details" role="status">
      <div className="error-heading">
        <span className="error-code">{value.code}</span>
        <span>{value.message}</span>
      </div>

      {syntaxError && (
        <>
          <pre className="error-caret">{caretDiagram(sheet.getRaw(address), syntaxError.position)}</pre>
          {syntaxError.suggestion && <div className="error-suggestion">Suggestion: {syntaxError.suggestion}</div>}
        </>
      )}

      {origin && (
        <div className="error-suggestion">
          This error comes from{" "}
          <button className="link-button" onClick={() => controller.selectCell(parseAddress(origin)!)}>
            {origin}
          </button>
          . Fix that cell and this one will update.
        </div>
      )}
    </div>
  );
}
