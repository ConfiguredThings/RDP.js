// Playground page — SSR-guarded.
// The parser, TraceObserver, and DataView usage all require a browser context.
// PlaygroundApp is loaded dynamically on the client only.

import React, { useEffect, useState, type ComponentType } from 'react'
import type { HeadFC } from 'gatsby'
import { SiteHeader } from '../components/SiteHeader'

export default function PlaygroundPage() {
  const [App, setApp] = useState<ComponentType | null>(null)

  useEffect(() => {
    import('../components/PlaygroundApp').then((m) => {
      setApp(() => m.default)
    })
  }, [])

  return (
    <>
      <SiteHeader />

      {App ? <App /> : <div className="playground-loading">Loading playground…</div>}
    </>
  )
}

export const Head: HeadFC = () => (
  <>
    <title>Playground — RDP.js</title>
    <meta
      name="description"
      content="Interactive recursive descent parser playground. Type an arithmetic expression and watch the parser work step by step."
    />
  </>
)
