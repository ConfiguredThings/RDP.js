import React from 'react'
import { Link } from 'gatsby'

export function PlaygroundFooter() {
  return (
    <footer className="acknowledgement">
      <Link
        to="/docs/playground-internals/"
        style={{ color: 'inherit', textDecoration: 'underline' }}
      >
        How does this playground work?
      </Link>
    </footer>
  )
}
