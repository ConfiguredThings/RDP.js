import React from 'react'
import type { ParseEvent } from '@configuredthings/rdp.js/observable'

interface Props {
  events: ParseEvent[]
  frame: number
  isPlaying: boolean
  onStep: () => void
  onPlay: () => void
  onPause: () => void
  onReset: () => void
  onExit: () => void
}

export function ParseDebugger({
  events,
  frame,
  isPlaying,
  onStep,
  onPlay,
  onPause,
  onReset,
  onExit,
}: Props) {
  const total = events.length
  const atEnd = frame >= total - 1

  // Build call stack from events up to current frame
  const stack: string[] = []
  for (let i = 0; i <= frame && i < events.length; i++) {
    const ev = events[i]!
    if (ev.kind === 'enter') stack.push(ev.production)
    else if (ev.kind === 'exit') stack.pop()
  }

  return (
    <div>
      <div className="debug-toolbar">
        <button className="debug-btn" onClick={onReset} title="Reset to start" aria-label="Reset">
          ⏮
        </button>

        {isPlaying ? (
          <button className="debug-btn" onClick={onPause} title="Pause" aria-label="Pause">
            ⏸
          </button>
        ) : (
          <button
            className="debug-btn"
            onClick={onPlay}
            disabled={atEnd}
            title="Play"
            aria-label="Play"
          >
            ▶
          </button>
        )}

        <button
          className="debug-btn"
          onClick={onStep}
          disabled={atEnd}
          title="Step"
          aria-label="Step forward"
        >
          ⏭
        </button>

        <span className="debug-counter">{total === 0 ? '—' : `${frame + 1} / ${total}`}</span>

        <button className="btn btn-secondary btn-sm debug-exit-btn" onClick={onExit}>
          Exit debug
        </button>
      </div>

      {stack.length > 0 && (
        <div className="debug-stack">
          Stack: <span className="debug-stack-inner">{stack.join(' › ')}</span>
        </div>
      )}
    </div>
  )
}
