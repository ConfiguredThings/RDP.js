import React, { useEffect, useRef } from 'react'
import type { ParseEvent } from '@configuredthings/rdp.js/observable'

interface Props {
  events: ParseEvent[]
  currentFrame: number
}

export function TraceLog({ events, currentFrame }: Props) {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [currentFrame])

  const visible = events.slice(0, currentFrame + 1)

  return (
    <div className="trace-log">
      <div className="trace-log-title">Parse trace</div>
      <div className="trace-log-body" ref={listRef}>
        {visible.length === 0 && (
          <span style={{ color: '#3a5468', fontStyle: 'italic' }}>No events yet</span>
        )}
        {visible.map((ev, i) => (
          <TraceEntry key={i} event={ev} isCurrent={i === currentFrame} />
        ))}
      </div>
    </div>
  )
}

function TraceEntry({ event, isCurrent }: { event: ParseEvent; isCurrent: boolean }) {
  const cls = `trace-entry${isCurrent ? ' current' : ''}`

  if (event.kind === 'enter') {
    return (
      <div className={cls}>
        <span className="trace-arrow-enter">→</span>
        <span className="trace-production">{event.production}</span>
        <span className="trace-pos">pos:{event.position}</span>
      </div>
    )
  }
  if (event.kind === 'exit') {
    return (
      <div className={cls}>
        <span className={event.matched ? 'trace-arrow-exit-ok' : 'trace-arrow-exit-fail'}>←</span>
        <span className="trace-production">{event.production}</span>
        <span className={event.matched ? 'trace-match-ok' : 'trace-match-fail'}>
          {event.matched ? 'matched' : 'failed'}
        </span>
        <span className="trace-pos">pos:{event.position}</span>
      </div>
    )
  }
  return (
    <div className={cls}>
      <span className="trace-arrow-error">✗</span>
      <span style={{ color: '#fca5a5' }}>{(event as { message?: string }).message}</span>
    </div>
  )
}
