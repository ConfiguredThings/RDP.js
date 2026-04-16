/**
 * Shared helpers for generator runtime tests.
 *
 * These utilities compile generated TypeScript source strings to ESM JavaScript
 * and dynamically import them so tests can exercise the produced code at runtime.
 *
 * Temp files are written to the project root so that `@configuredthings/rdp.js`
 * resolves via the package's own exports map.
 */

import ts from 'typescript'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../')

/** Transpile a TypeScript source string to ESM JavaScript (strips types only). */
export function transpile(source: string): string {
  return ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText
}

/**
 * Compile a generated TypeScript source string and dynamically import it.
 *
 * Writes a temp `.mjs` file to the project root (so `@configuredthings/rdp.js`
 * resolves via the package exports map), imports it, then cleans up.
 */
export async function compileAndImport(source: string): Promise<Record<string, unknown>> {
  const js = transpile(source)
  const tmpFile = path.join(ROOT, `__rdpgen_test_${Date.now()}.mjs`)
  fs.writeFileSync(tmpFile, js)
  try {
    return (await import(`file://${tmpFile}`)) as Record<string, unknown>
  } finally {
    fs.unlinkSync(tmpFile)
  }
}

/**
 * Compile and import a scaffold + its generated parser in the correct order.
 *
 * The scaffold imports the parser via a relative path (e.g. `'./DateParser.js'`);
 * this helper rewrites that import to a `file://` URL before loading so Node can
 * resolve it from the temp location.
 *
 * Imports are sequential (scaffold first) to avoid a VM linker race on the shared
 * `@configuredthings/rdp.js` dependency.
 *
 * @param scaffoldSource - TypeScript source of the scaffold file.
 * @param parserSource   - TypeScript source of the generated parser file.
 * @param parserName     - The parser class name, used to rewrite the relative import.
 * @returns Both modules as plain objects.
 */
export async function importScaffold(
  scaffoldSource: string,
  parserSource: string,
  parserName: string,
): Promise<{ scaffold: Record<string, unknown>; parser: Record<string, unknown> }> {
  const stamp = Date.now()
  const parserFile = path.join(ROOT, `__scaffold_parser_${stamp}.mjs`)
  const scaffoldFile = path.join(ROOT, `__scaffold_${stamp}.mjs`)

  fs.writeFileSync(parserFile, transpile(parserSource))

  // Rewrite the relative parser import so Node can resolve it from the temp location.
  const scaffoldJs = transpile(scaffoldSource).replace(
    `'./${parserName}.js'`,
    `'file://${parserFile}'`,
  )
  fs.writeFileSync(scaffoldFile, scaffoldJs)

  try {
    // Import scaffold first — it loads the parser transitively.
    // Import parser directly afterwards; it resolves from the module cache.
    const scaffold = (await import(`file://${scaffoldFile}`)) as Record<string, unknown>
    const parser = (await import(`file://${parserFile}`)) as Record<string, unknown>
    return { scaffold, parser }
  } finally {
    fs.unlinkSync(parserFile)
    fs.unlinkSync(scaffoldFile)
  }
}

/** Walk into a generated parse tree node by a chain of field names. */
export function nav(node: unknown, ...keys: string[]): unknown {
  let v: unknown = node
  for (const key of keys) v = (v as Record<string, unknown>)[key]
  return v
}
