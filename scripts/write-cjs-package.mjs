// The package is "type": "module", so Node would load dist/cjs/*.js as ES modules and
// every require() of the CommonJS build would fail. A package.json in dist/cjs marks that
// folder as CommonJS.
import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('dist/cjs', { recursive: true })
writeFileSync('dist/cjs/package.json', JSON.stringify({ type: 'commonjs' }, null, 2) + '\n')
