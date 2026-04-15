#!/usr/bin/env node
/**
 * copy-assets.mjs
 *
 * 1. Runs `npm run docs` if docs-site/static/api/ is missing (TypeDoc writes
 *    directly there — no copy step needed).
 * 2. Copies CT corporate logos to static/ (Gatsby site) and to
 *    static/api/assets/ (TypeDoc toolbar).
 * 3. Copies recursquirrel.svg → static/
 */

import { access, copyFile, mkdir } from 'node:fs/promises';
import { existsSync }              from 'node:fs';
import { join }                    from 'node:path';
import { fileURLToPath }           from 'node:url';
import { execSync }                from 'node:child_process';

const root      = fileURLToPath(new URL('../..', import.meta.url));
const staticDir = join(root, 'docs-site', 'static');
const themeDir  = join(root, 'docs-site', 'typedoc-theme');

await mkdir(staticDir, { recursive: true });

// ── CT corporate logos ─────────────────────────────────────────────────────
// Two variants live in docs-site/typedoc-theme/:
//   configuredthings.svg       — colour (dark text #333333, blue icon)  → light mode
//   configuredthings-light.svg — light  (grey text #DDDDDD, blue icon)  → dark mode
//
// We need them in two places:
//   docs-site/static/          → Gatsby site header (served as /configuredthings*.svg)
//   docs-site/static/api/assets/ → TypeDoc toolbar  (referenced as ./configuredthings*.svg)

const logos = ['configuredthings.svg', 'configuredthings-light.svg'];

for (const logo of logos) {
  const src        = join(themeDir, logo);
  const gatsbyDst  = join(staticDir, logo);
  const typedocDst = join(staticDir, 'api', 'assets', logo);

  if (!existsSync(src)) {
    console.warn(`⚠  ${logo} not found in typedoc-theme/ — skipping`);
    continue;
  }

  await copyFile(src, gatsbyDst);
  console.log(`Copied ${logo} → static/`);
}

// ── recursquirrel mascot ────────────────────────────────────────────────────
const squirrelSrc = join(root, 'recursquirrel.svg');
const squirrelDst = join(staticDir, 'recursquirrel.svg');
try {
  await access(squirrelSrc);
  await copyFile(squirrelSrc, squirrelDst);
  console.log('Copied recursquirrel.svg → static/');
} catch {
  console.warn('⚠  recursquirrel.svg not found in project root.');
}

