import React from 'react'
import { Link, withPrefix, type HeadFC } from 'gatsby'
import Layout from '../components/Layout'

const QUICK_START = `\
# scaffold a new parser project in seconds
npm install -g @configuredthings/rdp.js
mkdir my-parser && cd my-parser
rdp-gen init --name my-parser
npm install`

const WORKED_EXAMPLE = `\
// Grammar: Expr = wsp, Term, {wsp, ('+' | '-'), wsp, Term}, wsp;
//          Term = Factor, {wsp, ('*' | '/'), wsp, Factor};

class ArithmeticParser extends RDParser {
  parse(): boolean {
    return this.expr() && this.atEnd()
  }

  private expr(): boolean {
    if (!this.term()) return false
    while (this.peek() === '+' || this.peek() === '-') {
      this.consume()
      if (!this.term()) return this.error('expected term')
    }
    return true
  }
}`

export default function IndexPage() {
  return (
    <Layout fullWidth>
      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="landing-hero">
        <div className="landing-hero-inner">
          <div className="landing-hero-copy">
            <h1>RDP.js</h1>
            <p className="tagline">
              Write parsers, not boilerplate. Drop in a grammar, get a fully typed TypeScript parser
              — zero dependencies, dual ESM/CJS, batteries included.
            </p>

            <div className="landing-cta">
              <Link to="/docs/overview/" className="btn btn-primary">
                Read the Docs
              </Link>
              <Link to="/playground/" className="btn btn-secondary">
                Open Playground
              </Link>
              <a href={withPrefix('/api/index.html')} className="btn btn-secondary">
                API Reference
              </a>
            </div>

            <div className="landing-quick-start">
              <h2>Quick start</h2>
              <pre>
                <code>{QUICK_START}</code>
              </pre>
            </div>
          </div>

          <div className="landing-hero-mascot">
            <img
              src={withPrefix('/recursquirrel.svg')}
              alt="Recursquirrel — the RDP.js mascot"
              className="landing-mascot-img"
            />
            <p className="landing-mascot-quote">
              <em>
                "Hi, I'm recursquirrel, your friendly recursively descending parsing squirrel"
              </em>
            </p>
          </div>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────────── */}
      <section className="landing-features">
        <div className="feature-card">
          <h3>Typed base class</h3>
          <p>
            Subclass <code>RDParser</code>, implement grammar productions as methods, and get buffer
            management and position tracking for free.
          </p>
        </div>

        <div className="feature-card">
          <h3>Code generator</h3>
          <p>
            Write your grammar in EBNF or ABNF. <code>rdp-gen</code> scaffolds a fully typed
            TypeScript parser class in one command.
          </p>
        </div>

        <div className="feature-card">
          <h3>Parse debugger</h3>
          <p>
            Step through every production call with <code>ObservableRDParser</code>. Watch the call
            stack grow and shrink as the parser works.
          </p>
        </div>

        <div className="feature-card">
          <h3>LL(1) focus</h3>
          <p>
            Purpose-built for LL(1) grammars: config files, data formats, expression languages, and
            protocol frames — where top-down parsing shines.
          </p>
        </div>

        <div className="feature-card">
          <h3>Zero runtime dependencies</h3>
          <p>
            The core <code>RDParser</code> base class ships with zero runtime dependencies.
            TypeScript 6, dual ESM/CJS output.
          </p>
        </div>

        <div className="feature-card">
          <h3>Readable, testable code</h3>
          <p>
            The generated code mirrors the grammar exactly — one method per rule, easy to read,
            test, and debug without any parser magic.
          </p>
        </div>
      </section>

      {/* ── Worked example teaser ────────────────────────────────────────── */}
      <section
        className="landing-worked-example"
        style={{
          maxWidth: 'var(--max-width)',
          margin: '0 auto',
          padding: '0 1.5rem 4rem',
        }}
      >
        <h2 style={{ fontSize: '1.35rem', marginBottom: '1rem', color: 'var(--color-text)' }}>
          Grammar → parser in seconds
        </h2>
        <p
          style={{ color: 'var(--color-text-muted)', marginBottom: '1.25rem', fontSize: '0.95rem' }}
        >
          Write the grammar rule, implement the method — one-to-one correspondence makes the code
          easy to review, extend, and test.
        </p>
        <pre
          style={{
            background: '#1e2d3d',
            border: '1px solid var(--ct-blue-mid)',
            borderRadius: '10px',
            padding: '1.25rem 1.5rem',
            fontSize: '0.875rem',
            lineHeight: '1.65',
            overflowX: 'auto',
            boxShadow: '0 4px 16px rgba(0,86,163,0.12)',
          }}
        >
          <code style={{ fontFamily: 'var(--font-mono)', color: '#c8dff5' }}>{WORKED_EXAMPLE}</code>
        </pre>
        <div style={{ marginTop: '1.25rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <Link to="/docs/tutorial/" className="btn btn-primary btn-sm">
            Full tutorial
          </Link>
          <Link to="/playground/" className="btn btn-secondary btn-sm">
            Try it live
          </Link>
        </div>
      </section>
    </Layout>
  )
}

const SITE_URL = 'https://configuredthings.github.io/RDP.js'
const OG_TITLE = 'RDP.js — Write parsers, not boilerplate.'
const OG_DESC =
  'Drop in a grammar, get a fully typed TypeScript parser. Zero dependencies, dual ESM/CJS, with a built-in code generator and parse debugger.'
const OG_IMAGE = `${SITE_URL}/recursquirrel.png`

export const Head: HeadFC = () => (
  <>
    <title>{OG_TITLE}</title>
    <meta name="description" content={OG_DESC} />

    <meta property="og:type" content="website" />
    <meta property="og:url" content={SITE_URL} />
    <meta property="og:title" content={OG_TITLE} />
    <meta property="og:description" content={OG_DESC} />
    <meta property="og:image" content={OG_IMAGE} />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={OG_TITLE} />
    <meta name="twitter:description" content={OG_DESC} />
    <meta name="twitter:image" content={OG_IMAGE} />
  </>
)
