#!/usr/bin/env tsx
/**
 * Renders SiteHeaderBase to a static HTML template, saved to
 * typedoc-theme/site-header.html. The TypeDoc plugin reads this file and
 * injects it into each generated page, replacing the placeholders at build time.
 *
 * Placeholders:
 *   __SITE_PREFIX__  — the URL prefix of the parent site (e.g. /RDP.js)
 *   __LOGO_LIGHT__   — relative path to the light-mode logo
 *   __LOGO_DARK__    — relative path to the dark-mode logo
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { SiteHeaderBase } from '../src/components/SiteHeaderBase.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const html = renderToStaticMarkup(
  createElement(SiteHeaderBase, {
    prefix: '__SITE_PREFIX__',
    logoLight: '__LOGO_LIGHT__',
    logoDark: '__LOGO_DARK__',
  }),
)

const outPath = join(__dirname, '../typedoc-theme/site-header.html')
writeFileSync(outPath, html, 'utf-8')
console.log('✓  Rendered site-header → typedoc-theme/site-header.html')
