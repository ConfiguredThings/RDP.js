import React, { useRef, useEffect, useState } from 'react'

// Real numbers from `node benchmarks/ebnf.bench.mjs` on a representative machine.
// Update by re-running the benchmark: node benchmarks/ebnf.bench.mjs
const APPROACHES = [
  { shortLabel: 'Scannerless' },
  { shortLabel: 'Hand lexer' },
  { shortLabel: 'Regex lexer' },
  { shortLabel: 'Span+classify' },
] as const

const INPUTS = [
  { name: 'ebnf-meta (3 KB, 20 rules)', speedups: [1.0, 4.59, 0.81, 3.39] },
  { name: 'stress (13 KB, 84 rules)', speedups: [1.0, 4.95, 0.78, 4.05] },
] as const

// ── Layout constants ──────────────────────────────────────────────────────────

const W = 720
const H = 340
const PAD_LEFT = 52
const PAD_RIGHT = 84 // room for baseline label to the right of the chart
const PAD_TOP = 24
const PAD_BOTTOM = 88 // x-axis labels + legend

const CHART_W = W - PAD_LEFT - PAD_RIGHT
const CHART_H = H - PAD_TOP - PAD_BOTTOM

const MAX_Y = 5.5
const Y_TICKS = [0, 1, 2, 3, 4, 5]
const GROUP_GAP = 40
const BAR_GAP = 4

const COLOR_INPUT = ['#bfdbfe', '#3b82f6'] as const // blue-200 / blue-500: muted but clearly distinct
const COLOR_BASELINE = '#1e293b'

// ── Helpers ───────────────────────────────────────────────────────────────────

function yPx(v: number) {
  return PAD_TOP + CHART_H - (v / MAX_Y) * CHART_H
}

function barColor(_ai: number, ii: number) {
  return COLOR_INPUT[ii]!
}

// ── Component ─────────────────────────────────────────────────────────────────

export function BenchmarkChart() {
  const [mounted, setMounted] = useState(false)
  const [animated, setAnimated] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)

  // Hydrate first so we have a DOM node to observe
  useEffect(() => {
    setMounted(true)
  }, [])

  // Once mounted, start watching for the chart entering the viewport
  useEffect(() => {
    if (!mounted || !svgRef.current) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setAnimated(true)
          observer.disconnect()
        }
      },
      { threshold: 0.25 },
    )
    observer.observe(svgRef.current)
    return () => {
      observer.disconnect()
    }
  }, [mounted])

  const nApproaches = APPROACHES.length
  const nInputs = INPUTS.length
  const groupW = (CHART_W - GROUP_GAP * (nApproaches - 1)) / nApproaches
  const barW = (groupW - BAR_GAP * (nInputs - 1)) / nInputs

  function barX(ai: number, ii: number) {
    return PAD_LEFT + ai * (groupW + GROUP_GAP) + ii * (barW + BAR_GAP)
  }

  if (!mounted) {
    return (
      <div style={{ width: '100%', maxWidth: W, aspectRatio: `${W}/${H}` }} aria-hidden="true" />
    )
  }

  const chartBottom = PAD_TOP + CHART_H

  return (
    <figure style={{ margin: '2rem 0' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', maxWidth: W, display: 'block', fontFamily: 'inherit' }}
        role="img"
        aria-label="Grouped bar chart: speedup of four parsing approaches over two grammars"
      >
        <defs>
          {/* Clip rect grows left-to-right to reveal the baseline line */}
          <clipPath id="baseline-reveal">
            <rect
              x={PAD_LEFT - 2}
              y={0}
              height={H}
              style={{
                width: animated ? CHART_W + 4 : 0,
                transition: 'width 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) 1.1s',
              }}
            />
          </clipPath>
        </defs>
        {/* ── Y-axis grid & ticks ─────────────────────────────────────── */}
        {Y_TICKS.map((v) => (
          <g key={v}>
            <line
              x1={PAD_LEFT}
              y1={yPx(v)}
              x2={PAD_LEFT + CHART_W}
              y2={yPx(v)}
              stroke={v === 0 ? '#475569' : '#e2e8f0'}
              strokeWidth={v === 0 ? 1.5 : 1}
            />
            <text
              x={PAD_LEFT - 6}
              y={yPx(v)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={11}
              fill="#64748b"
            >
              {v === 0 ? '0×' : `${v}×`}
            </text>
          </g>
        ))}

        {/* ── Bars (with grow-from-bottom animation) ───────────────────── */}
        {APPROACHES.map((_approach, ai) =>
          INPUTS.map((input, ii) => {
            const speedup = input.speedups[ai]!
            const x = barX(ai, ii)
            const barHeight = (speedup / MAX_Y) * CHART_H
            const y = yPx(speedup)
            const color = barColor(ai, ii)
            // Stagger: left-to-right by approach, then by input within each group
            const delay = ai * 0.12 + ii * 0.06

            return (
              <g key={`${ai}-${ii}`}>
                {/*
                  transformBox:fillBox makes transform-origin relative to the rect's
                  own bounding box. transform-origin:bottom anchors the scale to the
                  rect's bottom edge, so it grows upward from the chart floor.
                */}
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={barHeight}
                  fill={color}
                  rx={2}
                  style={{
                    transformBox: 'fill-box',
                    transformOrigin: 'bottom',
                    transform: animated ? 'scaleY(1)' : 'scaleY(0)',
                    transition: `transform 0.65s cubic-bezier(0.34, 1.30, 0.64, 1) ${delay}s`,
                  }}
                />
                {/* Value label fades in after the bar finishes growing */}
                <text
                  x={x + barW / 2}
                  y={y - 4}
                  textAnchor="middle"
                  fontSize={10}
                  fill={color}
                  fontWeight={600}
                  style={{
                    opacity: animated ? 1 : 0,
                    transition: `opacity 0.25s ease ${delay + 0.55}s`,
                  }}
                >
                  {speedup.toFixed(2)}×
                </text>
              </g>
            )
          }),
        )}

        {/* ── Baseline reference line (after bars so it's always on top) ── */}
        {/* Fades in once the last bar has finished growing (~1.1s) */}
        <line
          x1={PAD_LEFT}
          y1={yPx(1)}
          x2={PAD_LEFT + CHART_W}
          y2={yPx(1)}
          stroke="white"
          strokeWidth={2}
          strokeDasharray="5 3"
          clipPath="url(#baseline-reveal)"
          style={{ mixBlendMode: 'difference' }}
        />
        <text
          x={PAD_LEFT + CHART_W + 8}
          y={yPx(1)}
          textAnchor="start"
          dominantBaseline="middle"
          fontSize={10}
          fill={COLOR_BASELINE}
          fontWeight={600}
          style={{ opacity: animated ? 1 : 0, transition: 'opacity 0.4s ease 1.1s' }}
        >
          baseline (1×)
        </text>

        {/* ── X-axis approach labels ───────────────────────────────────── */}
        {APPROACHES.map((approach, ai) => {
          const cx = PAD_LEFT + ai * (groupW + GROUP_GAP) + groupW / 2
          return (
            <g key={ai}>
              <text x={cx} y={chartBottom + 14} textAnchor="middle" fontSize={11.5} fill="#475569">
                {approach.shortLabel}
              </text>
            </g>
          )
        })}

        {/* ── Legend ──────────────────────────────────────────────────── */}
        {(() => {
          const legendY = H - 22
          const items = [
            { color: COLOR_INPUT[0]!, label: INPUTS[0]!.name },
            { color: COLOR_INPUT[1]!, label: INPUTS[1]!.name },
          ]
          let lx = PAD_LEFT
          return items.map(({ color, label }, i) => {
            const x = lx
            lx += 14 + 6 + label.length * 6.5 + 20
            return (
              <g key={i}>
                <rect x={x} y={legendY - 8} width={14} height={10} fill={color} rx={2} />
                <text x={x + 20} y={legendY} fontSize={11} fill="#475569">
                  {label}
                </text>
              </g>
            )
          })
        })()}
      </svg>

      <figcaption
        style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.4rem', textAlign: 'center' }}
      >
        Taller bars are faster. Y-axis shows speedup relative to the scannerless baseline (1×,
        dashed line). Light blue = ebnf-meta grammar (3 KB); dark blue = stress grammar (13 KB). Run{' '}
        <code>node benchmarks/ebnf.bench.mjs</code> to reproduce on your machine.
      </figcaption>
    </figure>
  )
}
