import js from "@eslint/js";
import type { Linter } from "eslint";
import pluginUnusedImports from "eslint-plugin-unused-imports";
import globals from "globals";

// 这些 ESLint recommended 规则和 oxlint 的快速正确性检查有重叠。
// 如果 ESLint 和 oxlint 一起使用，过滤掉它们可以避免重复报错。
const rulesCoveredByOxlint = new Set([
  "constructor-super",
  "for-direction",
  "getter-return",
  "no-async-promise-executor",
  "no-case-declarations",
  "no-class-assign",
  "no-compare-neg-zero",
  "no-cond-assign",
  "no-const-assign",
  "no-constant-binary-expression",
  "no-constant-condition",
  "no-debugger",
  "no-delete-var",
  "no-dupe-args",
  "no-dupe-class-members",
  "no-dupe-else-if",
  "no-dupe-keys",
  "no-duplicate-case",
  "no-empty",
  "no-empty-character-class",
  "no-empty-pattern",
  "no-empty-static-block",
  "no-ex-assign",
  "no-extra-boolean-cast",
  "no-fallthrough",
  "no-func-assign",
  "no-global-assign",
  "no-import-assign",
  "no-invalid-regexp",
  "no-irregular-whitespace",
  "no-loss-of-precision",
  "no-misleading-character-class",
  "no-new-native-nonconstructor",
  "no-nonoctal-decimal-escape",
  "no-obj-calls",
  "no-prototype-builtins",
  "no-redeclare",
  "no-regex-spaces",
  "no-self-assign",
  "no-setter-return",
  "no-shadow-restricted-names",
  "no-sparse-arrays",
  "no-this-before-super",
  "no-unreachable",
  "no-unsafe-finally",
  "no-unsafe-negation",
  "no-unsafe-optional-chaining",
  "no-unused-labels",
  "no-unused-private-class-members",
  "no-unused-vars",
  "no-useless-backreference",
  "no-useless-catch",
  "no-useless-escape",
  "no-with",
  "require-yield",
  "use-isnan",
  "valid-typeof",
]);

const javascript = async (): Promise<Linter.Config[]> => {
  // 保留没有被 oxlint 接管的 ESLint recommended 规则。
  const recommendedRules = Object.fromEntries(
    Object.entries(js.configs.recommended.rules).filter(
      ([ruleName]) => !rulesCoveredByOxlint.has(ruleName),
    ),
  );

  return [
    {
      languageOptions: {
        // 使用最新 ECMAScript 语法解析 JavaScript，不固定到某个具体年份。
        ecmaVersion: "latest",
        globals: {
          // 允许常见浏览器、现代 ECMAScript 和 Node 全局变量，例如 window、Promise、process。
          ...globals.browser,
          ...globals.es2021,
          ...globals.node,
          // 将这些浏览器全局变量标记为只读，避免误赋值。
          document: "readonly",
          navigator: "readonly",
          window: "readonly",
        },
        parserOptions: {
          ecmaFeatures: {
            // 允许在 JavaScript 文件里使用 JSX 语法。
            jsx: true,
          },
          // 和 languageOptions 保持一致，兼容仍然读取 parserOptions 的工具。
          ecmaVersion: "latest",
          // 按 ES module 解析文件，使 import/export 语法有效。
          sourceType: "module",
        },
        // 在 ESLint 语言层面也按 ES module 处理。
        sourceType: "module",
      },
      linterOptions: {
        // 报告已经不再抑制任何规则的 eslint-disable 注释。
        reportUnusedDisableDirectives: true,
      },
      plugins: {
        // 提供比核心 no-unused-vars 更适合清理未使用 import 的规则。
        "unused-imports": pluginUnusedImports,
      },
      rules: {
        // 以 ESLint recommended 正确性规则为基础，并移除 oxlint 已覆盖的部分。
        ...recommendedRules,
        // 当可以安全使用点语法时，优先使用 obj.foo，而不是 obj["foo"]。
        "dot-notation": ["error", { allowKeywords: true }],
        // 关键字空格交给格式化工具处理。
        "keyword-spacing": "off",
        // 禁止包含控制字符的正则表达式。
        "no-control-regex": "error",
        // 允许空函数，常见于回调占位或有意的空操作。
        "no-empty-function": "off",
        // 禁止旧式八进制数字字面量，例如 071。
        "no-octal": "error",
        // 禁止字符串里的八进制转义序列。
        "no-octal-escape": "error",
        // 禁止旧式原型修改/查询 API，改用标准 Object API。
        "no-restricted-properties": [
          "error",
          {
            message:
              "Use `Object.getPrototypeOf` or `Object.setPrototypeOf` instead.",
            property: "__proto__",
          },
          {
            message: "Use `Object.defineProperty` instead.",
            property: "__defineGetter__",
          },
          {
            message: "Use `Object.defineProperty` instead.",
            property: "__defineSetter__",
          },
          {
            message: "Use `Object.getOwnPropertyDescriptor` instead.",
            property: "__lookupGetter__",
          },
          {
            message: "Use `Object.getOwnPropertyDescriptor` instead.",
            property: "__lookupSetter__",
          },
        ],
        // 禁止容易困惑、不安全，或当前代码库不鼓励使用的语法形式。
        "no-restricted-syntax": [
          "error",
          "DebuggerStatement",
          "LabeledStatement",
          "WithStatement",
          "TSEnumDeclaration[const=true]",
          "TSExportAssignment",
        ],
        // 未定义变量交给 TypeScript 和上面的 globals 配置处理。
        "no-undef": "off",
        // 禁止显式把变量初始化为 undefined。
        "no-undef-init": "error",
        // 禁止只能执行一次的循环。
        "no-unreachable-loop": "error",
        // 可以使用对象简写时，优先使用简写属性和方法。
        "object-shorthand": [
          "error",
          "always",
          {
            avoidQuotes: true,
            ignoreConstructors: false,
          },
        ],
        // 禁止把多个已初始化变量合并到同一条 var/let/const 声明里。
        "one-var": ["error", { initialized: "never" }],
        // 回调函数优先使用箭头函数。
        "prefer-arrow-callback": [
          "error",
          {
            allowNamedFunctions: false,
            allowUnboundThis: true,
          },
        ],
        // 静态正则优先使用字面量，而不是 new RegExp()。
        "prefer-regex-literals": [
          "error",
          {
            disallowRedundantWrapping: true,
          },
        ],
        // 函数括号前空格交给格式化工具处理。
        "space-before-function-paren": "off",
        // 要求注释标记后有空格，例如 // comment。
        "spaced-comment": "error",
        // 未使用的 import 报错，并允许自动修复时删除。
        "unused-imports/no-unused-imports": "error",
        // 未使用变量报错，但允许以下划线开头的变量表示有意忽略。
        "unused-imports/no-unused-vars": [
          "error",
          {
            args: "after-used",
            argsIgnorePattern: "^_",
            vars: "all",
            varsIgnorePattern: "^_",
          },
        ],
      },
    },
  ];
};

export { javascript };
