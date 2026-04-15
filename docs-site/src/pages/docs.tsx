// Redirect /docs/ → /docs/overview/
import React, { useEffect } from 'react'
import { navigate, type HeadFC } from 'gatsby'

export default function DocsIndexPage() {
  useEffect(() => {
    navigate('/docs/overview/')
  }, [])
  return null
}

export const Head: HeadFC = () => <title>Docs — RDP.js</title>
