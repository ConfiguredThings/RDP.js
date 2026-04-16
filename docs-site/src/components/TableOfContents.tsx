import React, { useEffect, useRef, useState } from 'react'

interface TocEntry {
  id: string
  text: string
  level: number
}

export function TableOfContents() {
  const [entries, setEntries] = useState<TocEntry[]>([])
  const [activeId, setActiveId] = useState('')
  // Tracks intersection state for all observed headings
  const visibilityRef = useRef<Map<string, boolean>>(new Map())
  // Ordered list of heading elements (for picking "first visible")
  const elementsRef = useRef<HTMLElement[]>([])

  useEffect(() => {
    const article = document.querySelector('.doc-content')
    if (!article) return

    const els = Array.from(article.querySelectorAll<HTMLElement>('h2, h3')).filter((el) => el.id)
    elementsRef.current = els

    const items: TocEntry[] = els.map((el) => ({
      id: el.id,
      // textContent strips markup (e.g. inline <code>) — good enough for nav
      text: el.textContent ?? '',
      level: parseInt(el.tagName[1], 10),
    }))
    setEntries(items)

    if (items.length === 0) return

    const headerH =
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 56

    const visibility = visibilityRef.current

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          visibility.set(entry.target.id, entry.isIntersecting)
        })

        // Highlight the first heading that is currently in the intersection zone
        const firstVisible = elementsRef.current.find((el) => visibility.get(el.id))
        if (firstVisible) {
          setActiveId(firstVisible.id)
        }
        // If nothing intersecting, keep the last active heading shown
      },
      // Top margin clips the sticky header; bottom margin ensures only the
      // top portion of the page triggers the "active" highlight.
      { rootMargin: `-${headerH + 2}px 0px -50% 0px`, threshold: 0 },
    )

    els.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  if (entries.length === 0) return null

  return (
    <nav className="toc-sidebar" aria-label="On this page">
      <p className="toc-title">On this page</p>
      <ul>
        {entries.map((entry) => (
          <li key={entry.id} className={`toc-item toc-level-${entry.level}`}>
            <a href={`#${entry.id}`} className={activeId === entry.id ? 'active' : undefined}>
              {entry.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
