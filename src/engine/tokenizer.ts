// Step 1 of reading a formula: split the text into tokens.
// "=SUM(A1:A3) * 2" becomes: name(SUM) ( cell(A1) : cell(A3) ) operator(*) number(2)

import { FormulaSyntaxError } from "./errors";
import type { ErrorCode } from "./values";

export type TokenType =
  | "number"
  | "string"
  | "boolean"
  | "cell" // A1, $B$2
  | "name" // function names such as SUM
  | "error" // error literals such as #REF!
  | "operator" // + - * / ^ & = <> < > <= >=
  | "lparen"
  | "rparen"
  | "comma"
  | "colon"
  | "end"; // marks the end of the formula

export interface Token {
  type: TokenType;
  text: string;
  /** Index of the first character in the full cell text (including "="). */
  start: number;
}

const ERROR_LITERALS: ErrorCode[] = ["#DIV/0!", "#VALUE!", "#NAME?", "#REF!", "#NUM!", "#N/A"];
const CELL_PATTERN = /^\$?[A-Za-z]{1,3}\$?\d+$/;
const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_.]*$/;

/**
 * Tokenizes a formula. `formula` is the whole cell text, starting with "=".
 * Throws FormulaSyntaxError for characters that can't start any token.
 */
export function tokenize(formula: string): Token[] {
  const tokens: Token[] = [];
  let i = 1; // skip the leading "="

  while (i < formula.length) {
    const ch = formula[i];

    if (ch === " " || ch === "\t" || ch === "\n") {
      i++;
      continue;
    }

    // Numbers: 12, 3.5, .5, 1e3
    if (isDigit(ch) || (ch === "." && isDigit(formula[i + 1]))) {
      const match = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(formula.slice(i))!;
      tokens.push({ type: "number", text: match[0], start: i });
      i += match[0].length;
      continue;
    }

    // Strings: "hello" (a doubled quote "" inside means one literal quote)
    if (ch === '"') {
      const start = i;
      let text = "";
      i++;
      while (true) {
        if (i >= formula.length) {
          throw new FormulaSyntaxError(
            "Text is missing its closing quote.",
            start,
            'Add a " at the end of the text.',
          );
        }
        if (formula[i] === '"') {
          if (formula[i + 1] === '"') {
            text += '"';
            i += 2;
            continue;
          }
          i++;
          break;
        }
        text += formula[i];
        i++;
      }
      tokens.push({ type: "string", text, start });
      continue;
    }

    // Error literals such as #REF! (these appear when a fill moves a reference off the grid)
    if (ch === "#") {
      const literal = ERROR_LITERALS.find((code) => formula.startsWith(code, i));
      if (!literal) {
        throw new FormulaSyntaxError("Unexpected character '#'.", i);
      }
      tokens.push({ type: "error", text: literal, start: i });
      i += literal.length;
      continue;
    }

    // Words: cell references (A1, $B$2), TRUE/FALSE, or function names
    if (isLetter(ch) || ch === "$" || ch === "_") {
      const match = /^[A-Za-z0-9_.$]+/.exec(formula.slice(i))!;
      const word = match[0];
      const followedByParen = /^\s*\(/.test(formula.slice(i + word.length));
      const upper = word.toUpperCase();

      if (followedByParen && NAME_PATTERN.test(word)) {
        // Something like LOG10( looks like a cell, but the "(" makes it a function.
        tokens.push({ type: "name", text: upper, start: i });
      } else if (upper === "TRUE" || upper === "FALSE") {
        tokens.push({ type: "boolean", text: upper, start: i });
      } else if (CELL_PATTERN.test(word)) {
        tokens.push({ type: "cell", text: upper, start: i });
      } else if (NAME_PATTERN.test(word)) {
        tokens.push({ type: "name", text: upper, start: i });
      } else {
        throw new FormulaSyntaxError(`"${word}" is not a valid cell reference or name.`, i);
      }
      i += word.length;
      continue;
    }

    // Two-character operators first, so "<=" isn't read as "<" then "=".
    const two = formula.slice(i, i + 2);
    if (two === "<=" || two === ">=" || two === "<>") {
      tokens.push({ type: "operator", text: two, start: i });
      i += 2;
      continue;
    }
    if (two === "!=") {
      throw new FormulaSyntaxError("'!=' is not a spreadsheet operator.", i, "Use <> for 'not equal to'.");
    }
    if (two === "==") {
      throw new FormulaSyntaxError("'==' is not a spreadsheet operator.", i, "Use a single = to compare values.");
    }

    if ("+-*/^&=<>".includes(ch)) {
      tokens.push({ type: "operator", text: ch, start: i });
      i++;
      continue;
    }

    const simpleTokens: Record<string, TokenType> = { "(": "lparen", ")": "rparen", ",": "comma", ":": "colon" };
    if (ch in simpleTokens) {
      tokens.push({ type: simpleTokens[ch], text: ch, start: i });
      i++;
      continue;
    }

    if (ch === ";") {
      throw new FormulaSyntaxError("Unexpected ';'.", i, "Use a comma (,) to separate function arguments.");
    }
    throw new FormulaSyntaxError(`Unexpected character '${ch}'.`, i);
  }

  tokens.push({ type: "end", text: "", start: formula.length });
  return tokens;
}

function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= "0" && ch <= "9";
}

function isLetter(ch: string): boolean {
  return /[A-Za-z]/.test(ch);
}
