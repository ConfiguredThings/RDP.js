import React, { useState, useEffect, useRef, useCallback } from 'react'
import Editor from '@monaco-editor/react'
import type { Monaco } from '@monaco-editor/react'
import { EBNFParser, ABNFParser, generateParser } from '@configuredthings/rdp.js/generator'
import type { GrammarAST } from '@configuredthings/rdp.js/generator'
import {
  ebnfMetaEBNF,
  ebnfMetaABNF,
  abnfMetaEBNF,
  abnfMetaABNF,
} from '@configuredthings/rdp.js/grammars'

export type GrammarFormat = 'ebnf' | 'abnf'

export interface GrammarOptions {
  format: GrammarFormat
  caseSensitiveStrings: boolean // ABNF only
}

interface Props {
  source: string
  options: GrammarOptions
  isCustom: boolean
  onCompile: (source: string, options: GrammarOptions, ast: GrammarAST) => void
  onReset: () => void
}

type CompileStatus = { kind: 'idle' } | { kind: 'ok' } | { kind: 'error'; message: string }

export const DEFAULT_EBNF = `\
Expr   = wsp, Term, {wsp, ('+' | '-'), wsp, Term}, wsp;
Term   = Factor, {wsp, ('*' | '/'), wsp, Factor};
Factor = '(', Expr, ')' | Number;
Number = Digit, {Digit};
Digit  = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
wsp    = {' '};`

export const DEFAULT_ABNF = `\
Expr   = wsp Term *( wsp ("+" / "-") wsp Term ) wsp
Term   = Factor *( wsp ("*" / "/") wsp Factor )
Factor = "(" Expr ")" / Number
Number = 1*Digit
Digit  = "0" / "1" / "2" / "3" / "4" / "5" / "6" / "7" / "8" / "9"
wsp    = *" "`

export const DEFAULT_OPTIONS: GrammarOptions = { format: 'ebnf', caseSensitiveStrings: false }

/** EBNF meta-grammar describing the EBNF format (written in EBNF — single-rule inputs only). */
export const EXAMPLE_EBNF_IN_EBNF = ebnfMetaEBNF

/** ABNF meta-grammar describing the EBNF format (full coverage). */
export const EXAMPLE_EBNF_IN_ABNF = ebnfMetaABNF

/** EBNF meta-grammar describing the ABNF format (written in EBNF — single-rule inputs only). */
export const EXAMPLE_ABNF_IN_EBNF = abnfMetaEBNF

/** ABNF meta-grammar describing the ABNF format (self-describing). */
export const EXAMPLE_ABNF_IN_ABNF = abnfMetaABNF

/** @deprecated use EXAMPLE_EBNF_IN_ABNF */
export const EXAMPLE_META_GRAMMAR = EXAMPLE_EBNF_IN_ABNF
/** @deprecated use EXAMPLE_EBNF_IN_ABNF */
export const EXAMPLE_EBNF_META_GRAMMAR = EXAMPLE_EBNF_IN_ABNF
/** @deprecated use EXAMPLE_ABNF_IN_ABNF */
export const EXAMPLE_ABNF_META_GRAMMAR = EXAMPLE_ABNF_IN_ABNF

type ExampleKey =
  | 'arithmetic-ebnf'
  | 'arithmetic-abnf'
  | 'ebnf-in-ebnf'
  | 'ebnf-in-abnf'
  | 'abnf-in-ebnf'
  | 'abnf-in-abnf'

// ── Monaco language registration ─────────────────────────────────────────────

let languagesRegistered = false

function registerLanguages(monaco: Monaco) {
  if (languagesRegistered) return
  languagesRegistered = true

  monaco.languages.register({ id: 'ebnf' })
  monaco.languages.setMonarchTokensProvider('ebnf', {
    tokenizer: {
      root: [
        [/\(\*/, 'comment', '@blockComment'],
        [/"[^"]*"/, 'string'],
        [/'[^']*'/, 'string'],
        [/=/, 'keyword'],
        [/[|,;]/, 'keyword'],
        [/-/, 'keyword'],
        [/\d+\s*\*/, 'type.identifier'],
        [/[{}\[\]()]/, 'delimiter.parenthesis'],
        [/[A-Za-z_][A-Za-z0-9_-]*/, 'identifier'],
      ],
      blockComment: [
        [/\*\)/, 'comment', '@pop'],
        [/[^*]+/, 'comment'],
        [/./, 'comment'],
      ],
    },
  } as Parameters<Monaco['languages']['setMonarchTokensProvider']>[1])

  monaco.languages.register({ id: 'abnf' })
  monaco.languages.setMonarchTokensProvider('abnf', {
    tokenizer: {
      root: [
        [/;.*$/, 'comment'],
        [/"[^"]*"/, 'string'],
        [/%[sS]"[^"]*"/, 'string'],
        [/%[xXdDbB][0-9a-fA-F]+(?:\.[0-9a-fA-F]+)*(?:-[0-9a-fA-F]+)?/, 'number.hex'],
        [/=|\//, 'keyword'],
        [/[*1+\[\]()]/, 'type.identifier'],
        [/[A-Za-z][A-Za-z0-9_-]*/, 'identifier'],
      ],
    },
  } as Parameters<Monaco['languages']['setMonarchTokensProvider']>[1])
}

// ── Detect system colour scheme ───────────────────────────────────────────────

function useMonacoTheme(): string {
  const [theme, setTheme] = useState('vs')
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    setTheme(mq.matches ? 'vs-dark' : 'vs')
    const handler = (e: MediaQueryListEvent) => setTheme(e.matches ? 'vs-dark' : 'vs')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return theme
}

// ── Component ─────────────────────────────────────────────────────────────────

export function GrammarEditor({ source, options, isCustom, onCompile, onReset }: Props) {
  const [draft, setDraft] = useState(source)
  const [opts, setOpts] = useState<GrammarOptions>(options)
  const [status, setStatus] = useState<CompileStatus>({ kind: 'idle' })
  const [generatedTs, setGeneratedTs] = useState<string | null>(null)
  const monacoTheme = useMonacoTheme()

  // Track whether the TS panel is mounted (keeps it alive to preserve scroll)
  const tsPanelMounted = useRef(false)
  if (generatedTs !== null) tsPanelMounted.current = true

  // Sync when parent resets
  useEffect(() => {
    setDraft(source)
  }, [source])
  useEffect(() => {
    setOpts(options)
  }, [options])

  const handleFormatChange = (fmt: GrammarFormat) => {
    const newDraft = fmt === 'ebnf' ? DEFAULT_EBNF : DEFAULT_ABNF
    setDraft(newDraft)
    setOpts((o) => ({ ...o, format: fmt, caseSensitiveStrings: false }))
    setStatus({ kind: 'idle' })
    setGeneratedTs(null)
    tsPanelMounted.current = false
  }

  const handleCompile = useCallback(() => {
    try {
      const ast =
        opts.format === 'abnf'
          ? ABNFParser.parse(draft, { caseSensitiveStrings: opts.caseSensitiveStrings })
          : EBNFParser.parse(draft)

      if (ast.rules.length === 0) {
        setStatus({ kind: 'error', message: 'Grammar has no rules.' })
        return
      }

      const ts = generateParser(draft, {
        format: opts.format,
        parserName: 'CustomParser',
        observable: true,
        ...(opts.format === 'abnf' && { caseSensitiveStrings: opts.caseSensitiveStrings }),
      })
      setGeneratedTs(ts)
      setStatus({ kind: 'ok' })
      onCompile(draft, opts, ast)
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }, [draft, opts, onCompile])

  const handleReset = () => {
    setStatus({ kind: 'idle' })
    setGeneratedTs(null)
    tsPanelMounted.current = false
    onReset()
  }

  const handleLoadExample = (key: ExampleKey | '') => {
    if (!key) return
    if (key === 'arithmetic-ebnf') {
      setDraft(DEFAULT_EBNF)
      setOpts({ format: 'ebnf', caseSensitiveStrings: false })
    } else if (key === 'arithmetic-abnf') {
      setDraft(DEFAULT_ABNF)
      setOpts({ format: 'abnf', caseSensitiveStrings: false })
    } else if (key === 'ebnf-in-ebnf') {
      setDraft(EXAMPLE_EBNF_IN_EBNF)
      setOpts({ format: 'ebnf', caseSensitiveStrings: false })
    } else if (key === 'ebnf-in-abnf') {
      setDraft(EXAMPLE_EBNF_IN_ABNF)
      setOpts({ format: 'abnf', caseSensitiveStrings: false })
    } else if (key === 'abnf-in-ebnf') {
      setDraft(EXAMPLE_ABNF_IN_EBNF)
      setOpts({ format: 'ebnf', caseSensitiveStrings: false })
    } else if (key === 'abnf-in-abnf') {
      setDraft(EXAMPLE_ABNF_IN_ABNF)
      setOpts({ format: 'abnf', caseSensitiveStrings: false })
    }
    setStatus({ kind: 'idle' })
    setGeneratedTs(null)
    tsPanelMounted.current = false
  }

  const splitOpen = generatedTs !== null

  return (
    <div className="grammar-editor">
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="grammar-editor-toolbar">
        {/* Format toggle */}
        <div className="grammar-format-toggle">
          <button
            className={`grammar-format-btn${opts.format === 'ebnf' ? ' active' : ''}`}
            onClick={() => opts.format !== 'ebnf' && handleFormatChange('ebnf')}
          >
            EBNF
          </button>
          <button
            className={`grammar-format-btn${opts.format === 'abnf' ? ' active' : ''}`}
            onClick={() => opts.format !== 'abnf' && handleFormatChange('abnf')}
          >
            ABNF
          </button>
        </div>

        {/* ABNF case-sensitive option */}
        {opts.format === 'abnf' && (
          <label className="grammar-option-row">
            <input
              type="checkbox"
              checked={opts.caseSensitiveStrings}
              onChange={(e) => setOpts((o) => ({ ...o, caseSensitiveStrings: e.target.checked }))}
            />
            <span className="grammar-option-label">
              Case-sensitive strings
              <span className="grammar-option-hint"> (%s"…")</span>
            </span>
          </label>
        )}

        <div className="grammar-toolbar-actions">
          <button className="btn btn-primary btn-sm" onClick={handleCompile}>
            Compile
          </button>
          {isCustom && (
            <button className="btn btn-secondary btn-sm" onClick={handleReset}>
              Reset
            </button>
          )}
          <select
            className="grammar-example-select"
            value=""
            onChange={(e) => handleLoadExample(e.target.value as ExampleKey | '')}
            aria-label="Load an example grammar"
          >
            <option value="">Load example…</option>
            <option value="arithmetic-ebnf">Arithmetic (EBNF)</option>
            <option value="arithmetic-abnf">Arithmetic (ABNF)</option>
            <optgroup label="Bootstrapping — meta-grammars">
              <option value="ebnf-in-abnf">EBNF grammar, written in ABNF</option>
              <option value="ebnf-in-ebnf">EBNF grammar, written in EBNF</option>
              <option value="abnf-in-abnf">ABNF grammar, written in ABNF (self-describing)</option>
              <option value="abnf-in-ebnf">ABNF grammar, written in EBNF</option>
            </optgroup>
          </select>

          {/* Status */}
          {status.kind === 'ok' && <span className="grammar-status-ok">✓ compiled</span>}
          {status.kind === 'error' && (
            <span className="grammar-status-error" title={status.message}>
              ✗ {status.message.length > 60 ? status.message.slice(0, 57) + '…' : status.message}
            </span>
          )}
        </div>
      </div>

      {/* ── Split view: grammar source | generated TypeScript ────────────── */}
      <div className="grammar-split">
        {/* Left — grammar source editor */}
        <div className="grammar-split-left">
          <div className="grammar-split-panel-label">
            Grammar source
            <span className="grammar-split-panel-lang">{opts.format.toUpperCase()}</span>
          </div>
          <div className="grammar-split-editor-wrap">
            <Editor
              language={opts.format === 'ebnf' ? 'ebnf' : 'abnf'}
              value={draft}
              theme={monacoTheme}
              onChange={(v) => {
                setDraft(v ?? '')
                setStatus({ kind: 'idle' })
              }}
              beforeMount={registerLanguages}
              options={{
                automaticLayout: true,
                minimap: { enabled: false },
                fontSize: 13,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                wordWrap: 'off',
                renderLineHighlight: 'line',
                smoothScrolling: true,
                padding: { top: 8, bottom: 8 },
              }}
            />
          </div>
        </div>

        {/* Right — generated TypeScript (slides in on compile) */}
        <div className={`grammar-split-right${splitOpen ? ' open' : ''}`}>
          {tsPanelMounted.current && (
            <>
              <div className="grammar-split-panel-label">
                Generated TypeScript
                <span className="grammar-split-panel-lang">what rdp-gen produces</span>
                <button
                  className="btn btn-secondary btn-sm grammar-split-copy-btn"
                  onClick={() => generatedTs && void navigator.clipboard.writeText(generatedTs)}
                  title="Copy to clipboard"
                >
                  Copy
                </button>
              </div>
              <div className="grammar-split-editor-wrap">
                <Editor
                  language="typescript"
                  value={generatedTs ?? ''}
                  theme={monacoTheme}
                  options={{
                    readOnly: true,
                    automaticLayout: true,
                    minimap: { enabled: false },
                    fontSize: 13,
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    wordWrap: 'off',
                    smoothScrolling: true,
                    padding: { top: 8, bottom: 8 },
                    renderLineHighlight: 'none',
                  }}
                />
              </div>
            </>
          )}
        </div>
      </div>

      <p className="grammar-editor-note">
        The playground runs an <strong>AST interpreter</strong> — not the generated parser. For
        production use, run <code>rdp-gen</code> to get an optimised TypeScript class.
      </p>
    </div>
  )
}
