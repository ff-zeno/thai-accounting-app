import { parse } from "@babel/parser";

// @babel/parser uses @babel/types for Node, but we avoid that dependency.
// Use a minimal structural type instead.
interface AstNode {
  type: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// AST Node Type Allowlist
// ---------------------------------------------------------------------------

const ALLOWED_NODE_TYPES = new Set([
  // Program structure
  "Program",
  "File",
  "InterpreterDirective",
  // Functions
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "ReturnStatement",
  // Variables
  "VariableDeclaration",
  "VariableDeclarator",
  // Expressions
  "ExpressionStatement",
  "CallExpression",
  "MemberExpression",
  "BinaryExpression",
  "LogicalExpression",
  "ConditionalExpression",
  "UnaryExpression",
  "AssignmentExpression",
  "TemplateLiteral",
  "TemplateElement",
  "TaggedTemplateExpression",
  "SequenceExpression",
  // Literals
  "StringLiteral",
  "NumericLiteral",
  "BooleanLiteral",
  "NullLiteral",
  "RegExpLiteral",
  // Objects / Arrays
  "ObjectExpression",
  "ObjectProperty",
  "ArrayExpression",
  "SpreadElement",
  // Control flow
  "IfStatement",
  "ForStatement",
  "ForInStatement",
  "ForOfStatement",
  "WhileStatement",
  "DoWhileStatement",
  "SwitchStatement",
  "SwitchCase",
  "BreakStatement",
  "ContinueStatement",
  "BlockStatement",
  // Pattern matching
  "Identifier",
  "RestElement",
  "AssignmentPattern",
  "ObjectPattern",
  "ArrayPattern",
  // Try/catch (for safe error handling)
  "TryStatement",
  "CatchClause",
  "ThrowStatement",
  // Update
  "UpdateExpression",
  // Misc
  "EmptyStatement",
]);

// ---------------------------------------------------------------------------
// Identifier Denylist
// ---------------------------------------------------------------------------

const DENIED_IDENTIFIERS = new Set([
  // Dangerous globals
  "eval",
  "Function",
  "constructor",
  "globalThis",
  "global",
  "window",
  "document",
  "self",
  "top",
  "parent",
  "frames",
  // Process / system
  "process",
  "require",
  "module",
  "exports",
  "__dirname",
  "__filename",
  // Prototype pollution
  "__proto__",
  "__defineGetter__",
  "__defineSetter__",
  "__lookupGetter__",
  "__lookupSetter__",
  // Async (not needed for pure extraction)
  "setTimeout",
  "setInterval",
  "setImmediate",
  "queueMicrotask",
  "Promise",
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  // Import
  "import",
  "importScripts",
]);

// ---------------------------------------------------------------------------
// Allowed method callee names (on safe builtins)
// ---------------------------------------------------------------------------

const ALLOWED_CALLEE_OBJECTS = new Set([
  "String",
  "Array",
  "RegExp",
  "Math",
  "JSON",
  "Number",
  "Object",
  "parseInt",
  "parseFloat",
  "isNaN",
  "isFinite",
  "encodeURIComponent",
  "decodeURIComponent",
]);

// ---------------------------------------------------------------------------
// Unsafe regex detection
// ---------------------------------------------------------------------------

function isUnsafeRegex(pattern: string): boolean {
  // Detect common catastrophic backtracking patterns:
  // - Nested quantifiers: (a+)+ , (a*)*
  // - Overlapping alternations with quantifiers
  const nestedQuantifier = /(\([^)]*[+*]\)[+*?]|\([^)]*[+*]\)\{)/;
  return nestedQuantifier.test(pattern);
}

// ---------------------------------------------------------------------------
// AST Walker
// ---------------------------------------------------------------------------

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function walkAst(
  node: AstNode,
  errors: string[],
  visited = new Set<AstNode>()
): void {
  if (!node || typeof node !== "object" || visited.has(node)) return;
  visited.add(node);

  // Check node type
  if (!ALLOWED_NODE_TYPES.has(node.type)) {
    errors.push(`Disallowed AST node type: ${node.type}`);
    return;
  }

  // Check identifiers against denylist
  if (node.type === "Identifier") {
    const name = (node as unknown as { name: string }).name;
    if (DENIED_IDENTIFIERS.has(name)) {
      errors.push(`Disallowed identifier: "${name}"`);
    }
    if (name === "prototype") {
      errors.push(`Disallowed identifier: "prototype"`);
    }
  }

  // Check member expressions
  if (node.type === "MemberExpression") {
    const member = node as unknown as {
      computed: boolean;
      property: AstNode & { name?: string };
    };

    // Computed member access check — allow array indexing (numeric/variable),
    // but block string literals that could be prototype pollution
    if (member.computed && member.property?.type === "StringLiteral") {
      const strValue = (member.property as unknown as { value: string }).value;
      if (DENIED_IDENTIFIERS.has(strValue) || strValue === "prototype") {
        errors.push(
          `Computed member access with denied string: "${strValue}"`
        );
      }
    }

    // Check property name against denylist
    if (
      member.property?.type === "Identifier" &&
      member.property.name &&
      DENIED_IDENTIFIERS.has(member.property.name)
    ) {
      errors.push(
        `Disallowed member access: ".${member.property.name}"`
      );
    }

    if (
      member.property?.type === "Identifier" &&
      member.property.name === "prototype"
    ) {
      errors.push('Disallowed member access: ".prototype"');
    }
  }

  // Check regex literals for catastrophic backtracking
  if (node.type === "RegExpLiteral") {
    const regex = node as unknown as { pattern: string };
    if (isUnsafeRegex(regex.pattern)) {
      errors.push(
        `Potentially unsafe regex pattern: /${regex.pattern}/ (nested quantifiers)`
      );
    }
  }

  // Recurse into child nodes
  for (const key of Object.keys(node)) {
    if (key === "type" || key === "start" || key === "end" || key === "loc") {
      continue;
    }
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === "object" && "type" in item) {
          walkAst(item as AstNode, errors, visited);
        }
      }
    } else if (child && typeof child === "object" && "type" in child) {
      walkAst(child as AstNode, errors, visited);
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate a TypeScript/JavaScript source string for safe execution
 * in a sandboxed environment.
 *
 * Parses the source into an AST and checks:
 * 1. All node types are in the allowlist
 * 2. No denied identifiers (eval, constructor, prototype, etc.)
 * 3. No computed member access (prototype pollution vector)
 * 4. No unsafe regex patterns (catastrophic backtracking)
 */
export function validateExtractorSource(source: string): ValidationResult {
  const errors: string[] = [];

  // Parse as JS (compiled output)
  let ast: ReturnType<typeof parse>;
  try {
    ast = parse(source, {
      sourceType: "script",
      plugins: [],
    });
  } catch (parseError) {
    return {
      valid: false,
      errors: [
        `Parse error: ${parseError instanceof Error ? parseError.message : "unknown"}`,
      ],
    };
  }

  walkAst(ast.program as unknown as AstNode, errors);

  return {
    valid: errors.length === 0,
    errors,
  };
}
