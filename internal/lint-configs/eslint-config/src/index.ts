import type { Linter } from "eslint";

import { ignores } from "./ignores";
import { javascript } from "./javascript";

const defineConfig = async (
  config: Linter.Config[] = [],
): Promise<Linter.Config[]> => [
  ...(await ignores()),
  ...(await javascript()),
  ...config,
];

export { defineConfig };
