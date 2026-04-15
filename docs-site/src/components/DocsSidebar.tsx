import React from 'react'
import { Link, useStaticQuery, graphql } from 'gatsby'

interface SidebarEntry {
  frontmatter: { title: string; slug: string; order: number }
}

interface Props {
  currentSlug: string
  mobileOpen?: boolean
}

export default function DocsSidebar({ currentSlug, mobileOpen = false }: Props) {
  const data = useStaticQuery<{ allMdx: { nodes: SidebarEntry[] } }>(graphql`
    query DocsSidebarQuery {
      allMdx(sort: { frontmatter: { order: ASC } }) {
        nodes {
          frontmatter {
            title
            slug
            order
          }
        }
      }
    }
  `)

  const pages = data.allMdx.nodes

  return (
    <aside id="docs-sidebar" className={`docs-sidebar${mobileOpen ? ' mobile-open' : ''}`}>
      <div className="docs-sidebar-title">Documentation</div>
      <ul>
        {pages.map(({ frontmatter: { title, slug } }) => (
          <li key={slug}>
            <Link to={`/docs/${slug}/`} className={slug === currentSlug ? 'active' : undefined}>
              {title}
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  )
}
