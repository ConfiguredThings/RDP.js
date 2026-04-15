// PlaygroundApp — loaded dynamically on the client only (no SSR).
// All browser-only code (TextEncoder, DataView, TraceObserver) lives here.

import React, { useState, useEffect, useRef, useCallback } from 'react'
import type { ParseEvent } from '@configuredthings/rdp.js/observable'
import type { GrammarAST } from '@configuredthings/rdp.js/generator'
import { EBNFParser } from '@configuredthings/rdp.js/generator'
import { Link, withPrefix } from 'gatsby'

import { ExpressionInput } from './playground/ExpressionInput'
import { ParseDebugger } from './playground/ParseDebugger'
import { TraceLog } from './playground/TraceLog'
import { ErrorDisplay } from './playground/ErrorDisplay'
import { RailroadDiagrams } from './playground/RailroadDiagrams'
import { GrammarEditor, DEFAULT_EBNF, DEFAULT_OPTIONS } from './playground/GrammarEditor'
import type { GrammarOptions } from './playground/GrammarEditor'
import { PlaygroundFooter } from './playground/PlaygroundFooter'
import { GrammarInterpreter } from '@configuredthings/rdp.js/interpreter'
import { TraceObserver } from '@configuredthings/rdp.js/observable'

const DEBOUNCE_MS = 150
const PLAY_INTERVAL = 120
const INITIAL_EXPR = '3 + 4 * (2 - 1)' // valid against DEFAULT_EBNF

// Parse default grammar once at module load — synchronous, pure
const INITIAL_GRAMMAR_AST: GrammarAST = EBNFParser.parse(DEFAULT_EBNF)

// ── Parse runner ─────────────────────────────────────────────────────────────

function runParse(expr: string, ast: GrammarAST): { trace: ParseEvent[]; valid: boolean } {
  const bytes = new TextEncoder().encode(expr)
  const data = new DataView(bytes.buffer)
  const observer = new TraceObserver()
  const parser = new GrammarInterpreter(ast, data)
  parser.withObserver(observer)
  const valid = parser.parse()
  return { trace: observer.events, valid }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PlaygroundApp() {
  const [expression, setExpression] = useState(INITIAL_EXPR)
  const [error, setError] = useState<string | null>(null)
  const [parseOk, setParseOk] = useState<boolean>(false)
  const [trace, setTrace] = useState<ParseEvent[]>([])

  const [phase, setPhase] = useState<'write' | 'test'>('write')

  const [isDebug, setIsDebug] = useState(false)
  const [debugFrame, setDebugFrame] = useState(-1)
  const [isPlaying, setIsPlaying] = useState(false)

  // Grammar state
  const [grammarAST, setGrammarAST] = useState<GrammarAST>(INITIAL_GRAMMAR_AST)
  const [grammarSource, setGrammarSource] = useState(DEFAULT_EBNF)
  const [grammarOpts, setGrammarOpts] = useState<GrammarOptions>(DEFAULT_OPTIONS)
  const [isCustom, setIsCustom] = useState(false)

  // Refs so callbacks always see current values without stale closures
  const grammarASTRef = useRef<GrammarAST>(INITIAL_GRAMMAR_AST)
  const expressionRef = useRef(INITIAL_EXPR)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Core parse logic ────────────────────────────────────────────────────────

  const computeLive = useCallback((expr: string) => {
    const { valid, trace: t } = runParse(expr, grammarASTRef.current)
    setTrace(t)
    setParseOk(valid)
    if (!valid) {
      setError('Expression did not match grammar')
      return
    }
    setError(null)
  }, []) // stable — reads grammar via ref

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  useEffect(() => {
    computeLive(INITIAL_EXPR)
  }, [computeLive])

  const handleChange = useCallback(
    (val: string) => {
      expressionRef.current = val
      setExpression(val)
      if (isDebug) {
        setIsDebug(false)
        setIsPlaying(false)
        setDebugFrame(-1)
      }
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => computeLive(val), DEBOUNCE_MS)
    },
    [isDebug, computeLive],
  )

  // Play interval
  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setDebugFrame((f) => {
          const next = f + 1
          if (next >= trace.length - 1) {
            setIsPlaying(false)
            return trace.length - 1
          }
          return next
        })
      }, PLAY_INTERVAL)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isPlaying, trace.length])

  // ── Debug controls ──────────────────────────────────────────────────────────

  const handleDebug = useCallback(() => {
    const { trace: t } = runParse(expressionRef.current, grammarASTRef.current)
    setTrace(t)
    setIsDebug(true)
    setDebugFrame(0)
    setIsPlaying(false)
  }, [])

  const handleStep = useCallback(
    () => setDebugFrame((f) => Math.min(f + 1, trace.length - 1)),
    [trace.length],
  )
  const handlePlay = useCallback(() => setIsPlaying(true), [])
  const handlePause = useCallback(() => setIsPlaying(false), [])
  const handleReset = useCallback(() => {
    setDebugFrame(0)
    setIsPlaying(false)
  }, [])
  const handleExitDebug = useCallback(() => {
    setIsDebug(false)
    setIsPlaying(false)
    setDebugFrame(-1)
  }, [])

  // ── Grammar controls ────────────────────────────────────────────────────────

  const handleGrammarCompile = useCallback(
    (source: string, opts: GrammarOptions, ast: GrammarAST) => {
      grammarASTRef.current = ast
      setGrammarAST(ast)
      setGrammarSource(source)
      setGrammarOpts(opts)
      setIsCustom(true)
      // Exit debug mode — trace is stale against new grammar
      setIsDebug(false)
      setIsPlaying(false)
      setDebugFrame(-1)
      computeLive(expressionRef.current)
    },
    [computeLive],
  )

  const handleGrammarReset = useCallback(() => {
    grammarASTRef.current = INITIAL_GRAMMAR_AST
    setGrammarAST(INITIAL_GRAMMAR_AST)
    setGrammarSource(DEFAULT_EBNF)
    setGrammarOpts(DEFAULT_OPTIONS)
    setIsCustom(false)
    setIsDebug(false)
    setIsPlaying(false)
    setDebugFrame(-1)
    computeLive(expressionRef.current)
    setPhase('write')
  }, [computeLive])

  // ── Derived values ──────────────────────────────────────────────────────────

  const currentEvent = isDebug && debugFrame >= 0 ? (trace[debugFrame] ?? null) : null
  const highlightPos = currentEvent ? currentEvent.position : null
  const activeProduction = currentEvent?.kind === 'enter' ? currentEvent.production : null

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="playground-root">
      {/* ── Sub-header ──────────────────────────────────────────────────── */}
      <div className="playground-header">
        <span className="playground-title">Parser Playground</span>
        <div className="playground-phase-tabs">
          <button
            className={`playground-phase-tab${phase === 'write' ? ' active' : ''}`}
            onClick={() => setPhase('write')}
          >
            <span className="playground-phase-step">1</span>
            Write grammar &amp; compile parser
          </button>
          <span className="playground-phase-arrow">›</span>
          <button
            className={`playground-phase-tab${phase === 'test' ? ' active' : ''}`}
            onClick={() => setPhase('test')}
          >
            <span className="playground-phase-step">2</span>
            Test &amp; debug language
          </button>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <Link to="/docs/tutorial/" className="btn btn-secondary btn-sm">
            Tutorial
          </Link>
          <a href={withPrefix('/api/index.html')} className="btn btn-secondary btn-sm">
            API docs
          </a>
        </div>
      </div>

      {/* ── Phase 1: Write & compile ─────────────────────────────────────── */}
      {phase === 'write' && (
        <div className="playground-grammar-section playground-grammar-fill">
          <GrammarEditor
            source={grammarSource}
            options={grammarOpts}
            isCustom={isCustom}
            onCompile={handleGrammarCompile}
            onReset={handleGrammarReset}
          />
        </div>
      )}

      {/* ── Phase 2: Test & debug ────────────────────────────────────────── */}
      {phase === 'test' && (
        <div className="playground-body">
          {/* Left: expression input + debug controls + trace/result */}
          <div className="playground-left">
            <ExpressionInput
              value={expression}
              onChange={handleChange}
              highlightPos={highlightPos}
            />

            {/* Debug / live controls */}
            <div style={{ marginTop: '0.75rem' }}>
              {!isDebug ? (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={handleDebug}
                  title="Step through the parse trace"
                >
                  Debug
                </button>
              ) : (
                <ParseDebugger
                  events={trace}
                  frame={debugFrame}
                  isPlaying={isPlaying}
                  onStep={handleStep}
                  onPlay={handlePlay}
                  onPause={handlePause}
                  onReset={handleReset}
                  onExit={handleExitDebug}
                />
              )}
            </div>

            {/* Output area */}
            {isDebug ? (
              <TraceLog events={trace} currentFrame={debugFrame} />
            ) : error ? (
              <ErrorDisplay message={error} />
            ) : parseOk ? (
              <div className="parse-success">✓ Parse succeeded</div>
            ) : null}
          </div>

          {/* Right: railroad diagrams */}
          <div className="playground-diagrams-panel">
            <RailroadDiagrams ast={grammarAST} activeProduction={activeProduction} />
          </div>
        </div>
      )}

      <PlaygroundFooter />
    </div>
  )
}
