// Text functions.

import { CellError, isError } from "../values";
import { allValues, numberArg, textArg, toText, type FunctionDefinition } from "./helpers";

/** Shared code for the one-argument text functions (LEN, UPPER, ...). */
function simpleText(
  name: string,
  description: string,
  transform: (text: string) => string | number,
): FunctionDefinition {
  return {
    name,
    category: "Text",
    syntax: `${name}(text)`,
    description,
    minArgs: 1,
    maxArgs: 1,
    call: ([value]) => {
      const text = textArg(value);
      return isError(text) ? text : transform(text);
    },
  };
}

export const textFunctions: FunctionDefinition[] = [
  {
    name: "CONCAT",
    category: "Text",
    syntax: "CONCAT(text1, [text2], ...)",
    description: "Joins text together. Also accepts ranges. The & operator does the same for two values.",
    minArgs: 1,
    maxArgs: Infinity,
    call: (args) => {
      let result = "";
      for (const value of allValues(args)) {
        const text = toText(value);
        if (isError(text)) return text;
        result += text;
      }
      return result;
    },
  },
  simpleText("LEN", "Number of characters in the text.", (text) => text.length),
  simpleText("UPPER", "Converts text to UPPER CASE.", (text) => text.toUpperCase()),
  simpleText("LOWER", "Converts text to lower case.", (text) => text.toLowerCase()),
  simpleText("PROPER", "Capitalizes the first letter of each word.", (text) =>
    text.toLowerCase().replace(/(^|[^a-z])([a-z])/g, (_, before: string, letter: string) => before + letter.toUpperCase()),
  ),
  simpleText("TRIM", "Removes extra spaces at the ends and between words.", (text) => text.trim().replace(/\s+/g, " ")),
  {
    name: "LEFT",
    category: "Text",
    syntax: "LEFT(text, [count])",
    description: "First characters of the text (1 by default).",
    minArgs: 1,
    maxArgs: 2,
    call: ([value, countArg]) => {
      const text = textArg(value);
      const count = numberArg(countArg, 1);
      if (isError(text)) return text;
      if (isError(count)) return count;
      if (count < 0) return new CellError("#VALUE!", "LEFT's count can't be negative.");
      return text.slice(0, Math.trunc(count));
    },
  },
  {
    name: "RIGHT",
    category: "Text",
    syntax: "RIGHT(text, [count])",
    description: "Last characters of the text (1 by default).",
    minArgs: 1,
    maxArgs: 2,
    call: ([value, countArg]) => {
      const text = textArg(value);
      const count = numberArg(countArg, 1);
      if (isError(text)) return text;
      if (isError(count)) return count;
      if (count < 0) return new CellError("#VALUE!", "RIGHT's count can't be negative.");
      const n = Math.trunc(count);
      return n === 0 ? "" : text.slice(-n);
    },
  },
  {
    name: "MID",
    category: "Text",
    syntax: "MID(text, start, count)",
    description: "Characters from the middle of the text, starting at position start (from 1).",
    minArgs: 3,
    maxArgs: 3,
    call: ([value, startArg, countArg]) => {
      const text = textArg(value);
      const start = numberArg(startArg);
      const count = numberArg(countArg);
      if (isError(text)) return text;
      if (isError(start)) return start;
      if (isError(count)) return count;
      if (start < 1) return new CellError("#VALUE!", "MID's start position must be 1 or more.");
      if (count < 0) return new CellError("#VALUE!", "MID's count can't be negative.");
      const from = Math.trunc(start) - 1;
      return text.slice(from, from + Math.trunc(count));
    },
  },
  {
    name: "SUBSTITUTE",
    category: "Text",
    syntax: "SUBSTITUTE(text, find, replace_with)",
    description: "Replaces every occurrence of some text with other text.",
    minArgs: 3,
    maxArgs: 3,
    call: ([value, findArg, replaceArg]) => {
      const text = textArg(value);
      const find = textArg(findArg);
      const replacement = textArg(replaceArg);
      if (isError(text)) return text;
      if (isError(find)) return find;
      if (isError(replacement)) return replacement;
      return find === "" ? text : text.split(find).join(replacement);
    },
  },
];
