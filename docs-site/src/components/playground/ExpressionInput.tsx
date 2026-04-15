import React, { useRef, useEffect, useState } from 'react'
import Editor from '@monaco-editor/react'
import type { OnMount } from '@monaco-editor/react'
import type * as MonacoNS from 'monaco-editor'

interface Props {
  value: string
  onChange: (value: string) => void
  highlightPos: number | null
}

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

export function ExpressionInput({ value, onChange, highlightPos }: Props) {
  const editorRef = useRef<MonacoNS.editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof MonacoNS | null>(null)
  const decorations = useRef<MonacoNS.editor.IEditorDecorationsCollection | null>(null)
  const monacoTheme = useMonacoTheme()

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco as unknown as typeof MonacoNS
    decorations.current = editor.createDecorationsCollection([])
  }

  // Update position highlight decoration whenever highlightPos changes
  useEffect(() => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    const dec = decorations.current
    if (!editor || !monaco || !dec) return

    const model = editor.getModel()
    if (!model) return

    if (highlightPos !== null && highlightPos < model.getValueLength()) {
      // getPositionAt takes a character offset; byte == char for ASCII inputs
      const pos = model.getPositionAt(highlightPos)
      dec.set([
        {
          range: new (monaco as typeof MonacoNS).Range(
            pos.lineNumber,
            pos.column,
            pos.lineNumber,
            pos.column + 1,
          ),
          options: { inlineClassName: 'parse-pos-highlight' },
        },
      ])
    } else {
      dec.clear()
    }
  }, [highlightPos])

  return (
    <div>
      <label className="expr-input-label">Test input</label>
      <div className="expr-monaco-wrap">
        <Editor
          language="plaintext"
          value={value}
          theme={monacoTheme}
          onChange={(v) => onChange(v ?? '')}
          onMount={handleMount}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            wordWrap: 'on',
            scrollBeyondLastLine: false,
            renderLineHighlight: 'line',
            smoothScrolling: true,
            padding: { top: 6, bottom: 6 },
          }}
        />
      </div>
    </div>
  )
}
