// Load every entry point in package.json "exports" the way a consumer would:
// import() for "import" and require() for "require", resolved through the package's own
// name. Run after `npm run build`; exits non-zero if any entry point fails to load.
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const require = createRequire(import.meta.url)
let failed = 0

for (const subpath of Object.keys(pkg.exports)) {
  const specifier = pkg.name + subpath.slice(1)
  for (const [kind, load] of [
    ['import', () => import(specifier)],
    ['require', () => Promise.resolve(require(specifier))],
  ]) {
    try {
      const names = Object.keys(await load())
      if (names.length === 0) throw new Error('no exports')
      console.log(`ok   ${kind.padEnd(7)} ${specifier} (${names.length} exports)`)
    } catch (e) {
      failed++
      console.error(`FAIL ${kind.padEnd(7)} ${specifier}: ${e.message.split('\n')[0]}`)
    }
  }
}
process.exit(failed === 0 ? 0 : 1)
