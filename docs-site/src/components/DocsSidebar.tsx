import React from 'react'
import { Link, useStaticQuery, graphql } from 'gatsby'

interface SidebarEntry {
  frontmatter: { title: string; slug: string; order: number; section: string | null }
}

interface Props {
  currentSlug: string
  mobileOpen?: boolean
}

const SECTION_ORDER = ['Getting Started', 'Guides', 'Reference', 'Advanced', 'Examples']

export default function DocsSidebar({ currentSlug, mobileOpen = false }: Props) {
  const data = useStaticQuery<{ allMdx: { nodes: SidebarEntry[] } }>(graphql`
    query DocsSidebarQuery {
      allMdx(sort: { frontmatter: { order: ASC } }) {
        nodes {
          frontmatter {
            title
            slug
            order
            section
          }
        }
      }
    }
  `)

  const pages = data.allMdx.nodes

  // Group pages by section, preserving within-section order (already sorted by order ASC)
  const grouped = new Map<string, SidebarEntry[]>()
  for (const page of pages) {
    const section = page.frontmatter.section ?? 'Other'
    if (!grouped.has(section)) grouped.set(section, [])
    grouped.get(section)!.push(page)
  }

  const sections = SECTION_ORDER.filter((s) => grouped.has(s))

  return (
    <aside id="docs-sidebar" className={`docs-sidebar${mobileOpen ? ' mobile-open' : ''}`}>
      <div className="docs-sidebar-title">Documentation</div>
      {sections.map((section) => (
        <div key={section} className="docs-sidebar-section">
          <div className="docs-sidebar-section-heading">{section}</div>
          <ul>
            {grouped.get(section)!.map(({ frontmatter: { title, slug } }) => (
              <li key={slug}>
                <Link to={`/docs/${slug}/`} className={slug === currentSlug ? 'active' : undefined}>
                  {title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </aside>
  )
}
