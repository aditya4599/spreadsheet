// Step 2 of reading a formula: turn the tokens into a tree (an "AST").
//
// "=1 + 2 * A1" becomes:
//
//        +
//       / \
//      1   *
//         / \
//        2   A1
//
// This is a "recursive descent" parser: there is one function per precedence
// level, and each one calls the next-tighter level for its operands. Operators
// handled deeper in the call chain bind more tightly. From loosest to tightest:
//
//   comparison   =  <>  <  >  <=  >=
//   concatenate  &
//   additive     +  -
//   multiply     *  /
//   power        ^
//   unary        -x  +x
//   primary      numbers, text, TRUE/FALSE, A1, A1:B5, SUM(...), ( ... )

import { parseAddress, type CellPosition } from "./cellAddress";
import { closestMatch, FormulaSyntaxError } from "./errors";
import { FUNCTION_NAMES, getFunction } from "./functions";
import { tokenize, type Token } from "./tokenizer";
import type { ErrorCode } from "./values";

export type Expression =
  | { type: "number"; value: number }
  | { type: "string"; value: string }
  | { type: "boolean"; value: boolean }
  | { type: "error"; code: ErrorCode }
  | { type: "cell"; position: CellPosition }
  | { type: "range"; start: CellPosition; end: CellPosition }
  | { type: "unary"; operator: "-" | "+"; operand: Expression }
  | { type: "binary"; operator: string; left: Expression; right: Expression }
  | { type: "call"; name: string; args: Expression[] };

const COMPARISON_OPERATORS = ["=", "<>", "<", ">", "<=", ">="];

/** Parses a formula such as "=SUM(A1:A3) * 2". Throws FormulaSyntaxError on mistakes. */
export function parseFormula(formula: string): Expression {
  const parser = new Parser(formula, tokenize(formula));
  return parser.parse();
}

class Parser {
  private index = 0;

  constructor(
    private readonly formula: string,
    private readonly tokens: Token[],
  ) {}

  parse(): Expression {
    if (this.peek().type === "end") {
      throw new FormulaSyntaxError("The formula is empty.", this.formula.length, "Type a value or calculation after =.");
    }
    const expression = this.parseComparison();
    const next = this.peek();
    if (next.type === "rparen") {
      throw new FormulaSyntaxError("There is an extra ')'.", next.start, "Remove it, or add a matching '(' earlier.");
    }
    if (next.type === "comma") {
      throw new FormulaSyntaxError("Unexpected ',' outside of a function.", next.start, "Commas separate arguments inside a function, like SUM(A1, B1).");
    }
    if (next.type !== "end") {
      throw new FormulaSyntaxError(
        `Missing operator before "${this.tokenText(next)}".`,
        next.start,
        "Add an operator such as + or & between the two values.",
      );
    }
    return expression;
  }

  // ---- precedence levels, loosest first ----

  private parseComparison(): Expression {
    let left = this.parseConcatenation();
    while (this.isOperator(COMPARISON_OPERATORS)) {
      const operator = this.advance().text;
      left = { type: "binary", operator, left, right: this.parseOperand(operator, () => this.parseConcatenation()) };
    }
    return left;
  }

  private parseConcatenation(): Expression {
    let left = this.parseAdditive();
    while (this.isOperator(["&"])) {
      const operator = this.advance().text;
      left = { type: "binary", operator, left, right: this.parseOperand(operator, () => this.parseAdditive()) };
    }
    return left;
  }

  private parseAdditive(): Expression {
    let left = this.parseMultiplicative();
    while (this.isOperator(["+", "-"])) {
      const operator = this.advance().text;
      left = { type: "binary", operator, left, right: this.parseOperand(operator, () => this.parseMultiplicative()) };
    }
    return left;
  }

  private parseMultiplicative(): Expression {
    let left = this.parsePower();
    while (this.isOperator(["*", "/"])) {
      const operator = this.advance().text;
      left = { type: "binary", operator, left, right: this.parseOperand(operator, () => this.parsePower()) };
    }
    return left;
  }

  private parsePower(): Expression {
    let left = this.parseUnary();
    while (this.isOperator(["^"])) {
      const operator = this.advance().text;
      left = { type: "binary", operator, left, right: this.parseOperand(operator, () => this.parseUnary()) };
    }
    return left;
  }

  /** Note: like Excel, unary minus binds tighter than ^, so =-2^2 is 4. */
  private parseUnary(): Expression {
    if (this.isOperator(["-", "+"])) {
      const operator = this.advance().text as "-" | "+";
      return { type: "unary", operator, operand: this.parseOperand(operator, () => this.parseUnary()) };
    }
    return this.parsePrimary();
  }

  /** Parses the value after an operator, with a clear message if it's missing. */
  private parseOperand(operator: string, parseNext: () => Expression): Expression {
    if (this.peek().type === "end") {
      throw new FormulaSyntaxError(
        `The formula ends after '${operator}'.`,
        this.formula.length,
        `Add a value after '${operator}', or remove the '${operator}'.`,
      );
    }
    return parseNext();
  }

  private parsePrimary(): Expression {
    const token = this.peek();

    switch (token.type) {
      case "number":
        this.advance();
        return { type: "number", value: Number(token.text) };

      case "string":
        this.advance();
        return { type: "string", value: token.text };

      case "boolean":
        this.advance();
        return { type: "boolean", value: token.text === "TRUE" };

      case "error":
        this.advance();
        return { type: "error", code: token.text as ErrorCode };

      case "cell":
        return this.parseCellOrRange();

      case "name":
        return this.parseFunctionCall();

      case "lparen": {
        this.advance();
        if (this.peek().type === "rparen") {
          throw new FormulaSyntaxError("Empty parentheses.", this.peek().start, "Put a value or calculation inside ( ).");
        }
        const inner = this.parseComparison();
        this.expectClosingParen();
        return inner;
      }

      case "end":
        throw new FormulaSyntaxError("The formula is incomplete.", token.start, "Finish the formula with a value.");

      case "rparen": {
        const previous = this.tokens[this.index - 1];
        throw new FormulaSyntaxError(
          "Expected a value before ')'.",
          token.start,
          previous?.type === "comma" ? "Remove the extra ',' or add another argument after it." : undefined,
        );
      }

      case "comma":
        throw new FormulaSyntaxError("Expected a value before ','.", token.start, "Remove the extra ',' or add a value.");

      case "colon":
        throw new FormulaSyntaxError("Unexpected ':'.", token.start, "Ranges need a cell on both sides, like A1:B5.");

      case "operator":
        throw new FormulaSyntaxError(
          `'${token.text}' needs a value on its left side.`,
          token.start,
          `Add a value before '${token.text}', or remove it.`,
        );
    }
  }

  private parseCellOrRange(): Expression {
    const startToken = this.advance();
    const start = parseAddress(startToken.text)!;
    if (this.peek().type !== "colon") {
      return { type: "cell", position: start };
    }

    const colon = this.advance();
    const endToken = this.peek();
    if (endToken.type !== "cell") {
      throw new FormulaSyntaxError(
        "A range needs a cell after ':'.",
        endToken.type === "end" ? colon.start + 1 : endToken.start,
        `Write the range like ${startToken.text}:B10.`,
      );
    }
    this.advance();
    const end = parseAddress(endToken.text)!;
    // Store ranges with start = top-left, end = bottom-right, even if typed as B5:A1.
    return {
      type: "range",
      start: { row: Math.min(start.row, end.row), col: Math.min(start.col, end.col) },
      end: { row: Math.max(start.row, end.row), col: Math.max(start.col, end.col) },
    };
  }

  private parseFunctionCall(): Expression {
    const nameToken = this.advance();
    const name = nameToken.text;
    const definition = getFunction(name);

    if (this.peek().type !== "lparen") {
      // A bare word such as =hello or =SUM without parentheses.
      const original = this.tokenText(nameToken);
      const suggestion = definition
        ? `Functions need parentheses, like ${name}(...).`
        : `To use it as text, put it in quotes: "${original}".`;
      throw new FormulaSyntaxError(`Unknown name '${original}'.`, nameToken.start, suggestion, "#NAME?");
    }

    if (!definition) {
      const guess = closestMatch(name, FUNCTION_NAMES);
      throw new FormulaSyntaxError(
        `Unknown function '${name}'.`,
        nameToken.start,
        guess ? `Did you mean ${guess}?` : "Open the function list to see what's supported.",
        "#NAME?",
      );
    }

    this.advance(); // the "("
    const args: Expression[] = [];
    if (this.peek().type !== "rparen") {
      while (true) {
        args.push(this.parseComparison());
        if (this.peek().type === "comma") {
          this.advance();
          continue;
        }
        break;
      }
    }
    this.expectClosingParen();

    // Check the number of arguments now, so the user sees the problem while typing.
    if (args.length < definition.minArgs || args.length > definition.maxArgs) {
      throw new FormulaSyntaxError(
        `${name} expects ${describeArgCount(definition.minArgs, definition.maxArgs)}, but got ${args.length}.`,
        nameToken.start,
        `Use it like ${definition.syntax}.`,
      );
    }

    return { type: "call", name, args };
  }

  private expectClosingParen(): void {
    const token = this.peek();
    if (token.type === "rparen") {
      this.advance();
      return;
    }
    if (token.type === "end") {
      throw new FormulaSyntaxError("Missing closing parenthesis.", token.start, "Add ')' at the end of the formula.");
    }
    throw new FormulaSyntaxError(
      `Expected ',' or ')' before "${this.tokenText(token)}".`,
      token.start,
      "Separate arguments with commas, or close the parenthesis.",
    );
  }

  // ---- small helpers ----

  private peek(): Token {
    return this.tokens[this.index];
  }

  private advance(): Token {
    return this.tokens[this.index++];
  }

  private isOperator(operators: string[]): boolean {
    const token = this.peek();
    return token.type === "operator" && operators.includes(token.text);
  }

  /** The text of a token exactly as the user typed it. */
  private tokenText(token: Token): string {
    const next = this.tokens[this.tokens.indexOf(token) + 1];
    return this.formula.slice(token.start, next ? next.start : undefined).trim();
  }
}

function describeArgCount(min: number, max: number): string {
  const plural = (n: number) => (n === 1 ? "argument" : "arguments");
  if (min === max) return `${min} ${plural(min)}`;
  if (max === Infinity) return `at least ${min} ${plural(min)}`;
  return `${min} to ${max} arguments`;
}
