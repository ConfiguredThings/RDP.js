/**
 * TypeDoc plugin — injects the shared site header into every generated page.
 *
 * Before this plugin runs, `npm run render-header` must have produced
 * `typedoc-theme/site-header.html` (containing __SITE_PREFIX__, __LOGO_LIGHT__,
 * and __LOGO_DARK__ placeholders).  The plugin replaces those placeholders with
 * page-relative paths and injects the result after <body>.
 *
 * Logo SVGs are copied from typedoc-theme/ into the output assets/ directory
 * so they are available to every generated page.
 */

import { readFileSync, copyFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const themeDir   = join(__dirname, 'typedoc-theme')
const SITE_PREFIX = '/RDP.js'

export function load(app) {
  let headerTemplate = ''

  app.renderer.on('beginRender', () => {
    const templatePath = join(themeDir, 'site-header.html')
    if (existsSync(templatePath)) {
      headerTemplate = readFileSync(templatePath, 'utf-8')
    } else {
      console.warn(
        '[typedoc-plugin-header] typedoc-theme/site-header.html not found.\n' +
        '  Run `npm run render-header` from docs-site/ first.',
      )
    }
  })

  app.renderer.on('endPage', (page) => {
    if (!page.contents || !headerTemplate) return

    // Compute relative path from this page back to the api root.
    // page.url is e.g. 'index.html' or 'classes/RDParser.html'.
    const depth   = (page.url.match(/\//g) ?? []).length
    const toRoot  = depth > 0 ? '../'.repeat(depth) : ''
    const logoLight = `${toRoot}assets/configuredthings.svg`
    const logoDark  = `${toRoot}assets/configuredthings-light.svg`

    const header = headerTemplate
      .replace(/__SITE_PREFIX__/g, SITE_PREFIX)
      .replace(/__LOGO_LIGHT__/g,  logoLight)
      .replace(/__LOGO_DARK__/g,   logoDark)

    page.contents = page.contents.replace('<body>', `<body>\n${header}`)
  })

  app.renderer.on('endRender', (event) => {
    // Copy logo SVGs into the generated assets/ directory.
    const assetsDir = join(event.outputDirectory, 'assets')
    if (!existsSync(assetsDir)) mkdirSync(assetsDir, { recursive: true })

    for (const logo of ['configuredthings.svg', 'configuredthings-light.svg']) {
      const src = join(themeDir, logo)
      if (existsSync(src)) {
        copyFileSync(src, join(assetsDir, logo))
      } else {
        console.warn(`[typedoc-plugin-header] Logo not found: ${src}`)
      }
    }
  })
}
