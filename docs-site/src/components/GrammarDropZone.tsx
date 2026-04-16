import React, { useState, useRef, useEffect, useCallback } from 'react'
import { EBNFParser, ABNFParser, generateParser } from '@configuredthings/rdp.js/generator'

type Status =
  | { kind: 'idle' }
  | { kind: 'ok'; outputName: string }
  | { kind: 'error'; message: string }

function toParserName(filename: string): string {
  const base = filename.replace(/\.(ebnf|abnf)$/i, '')
  return (
    base
      .split(/[-_\s]+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join('') + 'Parser'
  )
}

function processSource(source: string, filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  if (ext !== 'ebnf' && ext !== 'abnf') throw new Error('File must be .ebnf or .abnf')
  const format = ext as 'ebnf' | 'abnf'
  const parserName = toParserName(filename)
  if (format === 'ebnf') EBNFParser.parse(source)
  else ABNFParser.parse(source)
  return generateParser(source, { format, parserName })
}

function triggerDownload(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function GrammarDropZone() {
  const [mounted, setMounted] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => setMounted(true), [])

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const ts = processSource(reader.result as string, file.name)
        const outputName = toParserName(file.name) + '.ts'
        triggerDownload(ts, outputName)
        setStatus({ kind: 'ok', outputName })
      } catch (e) {
        setStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
      }
    }
    reader.readAsText(file)
  }, [])

  if (!mounted) return null

  return (
    <div
      className={`grammar-drop-zone${dragOver ? ' drag-over' : ''}`}
      role="button"
      tabIndex={0}
      aria-label="Drop a grammar file or click to browse"
      onClick={() => {
        setStatus({ kind: 'idle' })
        inputRef.current?.click()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          setStatus({ kind: 'idle' })
          inputRef.current?.click()
        }
      }}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const file = e.dataTransfer.files[0]
        if (file) {
          setStatus({ kind: 'idle' })
          handleFile(file)
        }
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".ebnf,.abnf"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ''
        }}
      />

      <span className="grammar-drop-zone-icon">↓</span>
      <span className="grammar-drop-zone-label">
        Drop a <code>.ebnf</code> or <code>.abnf</code> file to generate a parser
      </span>

      {status.kind === 'ok' && (
        <span className="grammar-drop-zone-ok">✓ {status.outputName} downloaded</span>
      )}
      {status.kind === 'error' && (
        <span className="grammar-drop-zone-error" title={status.message}>
          ✗ {status.message.length > 80 ? status.message.slice(0, 77) + '…' : status.message}
        </span>
      )}
    </div>
  )
}
