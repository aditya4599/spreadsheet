// The registry of every supported function, looked up by upper-case name.

import type { FunctionDefinition } from "./helpers";
import { logicalFunctions } from "./logical";
import { lookupFunctions } from "./lookup";
import { mathFunctions } from "./math";
import { textFunctions } from "./text";

export type { FunctionDefinition } from "./helpers";

export const ALL_FUNCTIONS: FunctionDefinition[] = [
  ...mathFunctions,
  ...logicalFunctions,
  ...lookupFunctions,
  ...textFunctions,
];

const functionsByName = new Map(ALL_FUNCTIONS.map((fn) => [fn.name, fn]));

export function getFunction(name: string): FunctionDefinition | undefined {
  return functionsByName.get(name.toUpperCase());
}

export const FUNCTION_NAMES = ALL_FUNCTIONS.map((fn) => fn.name);
