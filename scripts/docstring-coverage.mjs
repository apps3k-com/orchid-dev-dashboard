#!/usr/bin/env bun
/**
 * Docstring-coverage gate (apps3k common workflow).
 *
 * Fails when the share of exported TypeScript declarations carrying a JSDoc/TSDoc
 * block falls below DOCSTRING_MIN (default 80). Scope = the behavioural API
 * surface of the source tree (exported functions, exported arrow/function
 * `const`s, exported classes and their public methods); type aliases, interfaces,
 * enums and plain data constants are encouraged but not gated (mirrors Python's
 * `interrogate`). Uses the TypeScript compiler API — robust, no extra dependency
 * beyond `typescript`.
 *
 * Config: DOCSTRING_SRC (default "src", relative to cwd), DOCSTRING_MIN (default 80).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import ts from "typescript";

const SRC_DIR = resolve(process.cwd(), process.env.DOCSTRING_SRC ?? "src");
const MIN = Number(process.env.DOCSTRING_MIN ?? "80");

/** Recursively collect documentable TypeScript source files under `dir`. */
function collectFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...collectFiles(full));
    else if (/\.m?ts$/.test(entry) && !/\.test\.ts$/.test(entry) && !/\.d\.ts$/.test(entry)) files.push(full);
  }
  return files;
}

/** True when the node carries an `export` modifier. */
function isExported(node) {
  if (!ts.canHaveModifiers(node)) return false;
  return (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

/** True when the node has a leading JSDoc/TSDoc comment block. */
function hasDoc(node) {
  const docs = ts.getJSDocCommentsAndTags(node);
  return Array.isArray(docs) && docs.length > 0;
}

/** True when a variable statement declares an arrow/function value. */
function isFunctionVariable(node) {
  return (
    ts.isVariableStatement(node) &&
    node.declarationList.declarations.some(
      (d) => d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer)),
    )
  );
}

let total = 0;
let documented = 0;
const gaps = [];

/** Record one countable declaration toward the coverage totals. */
function record(node, label, rel) {
  total += 1;
  if (hasDoc(node)) documented += 1;
  else gaps.push(`${rel}: ${label}`);
}

for (const file of collectFiles(SRC_DIR)) {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const rel = file.slice(SRC_DIR.length + 1);

  source.forEachChild((node) => {
    if (!isExported(node)) return;
    if (ts.isFunctionDeclaration(node)) {
      record(node, node.name ? node.name.getText(source) : "(default)", rel);
    } else if (isFunctionVariable(node)) {
      record(node, node.declarationList.declarations.map((d) => d.name.getText(source)).join(", "), rel);
    } else if (ts.isClassDeclaration(node)) {
      const className = node.name ? node.name.getText(source) : "(default)";
      record(node, `class ${className}`, rel);
      for (const member of node.members) {
        if (!ts.isMethodDeclaration(member) || !member.name) continue;
        const mods = ts.getModifiers(member) ?? [];
        const hidden = mods.some(
          (m) => m.kind === ts.SyntaxKind.PrivateKeyword || m.kind === ts.SyntaxKind.ProtectedKeyword,
        );
        if (!hidden) record(member, `${className}.${member.name.getText(source)}()`, rel);
      }
    }
  });
}

const pct = total === 0 ? 100 : Math.round((documented / total) * 1000) / 10;
console.log(`Docstring coverage: ${documented}/${total} exported declarations documented = ${pct}% (min ${MIN}%)`);
if (gaps.length > 0) {
  console.log("\nUndocumented exports:");
  for (const gap of gaps) console.log(`  - ${gap}`);
}
if (pct < MIN) {
  console.error(`\nFAIL: docstring coverage ${pct}% is below the required ${MIN}%.`);
  process.exit(1);
}
console.log("\nOK: docstring coverage meets the threshold.");
