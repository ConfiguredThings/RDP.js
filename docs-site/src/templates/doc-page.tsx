import React, { useState } from 'react'
import { graphql, Link, withPrefix, type PageProps, type HeadFC } from 'gatsby'
import { MDXProvider } from '@mdx-js/react'
import DocsSidebar from '../components/DocsSidebar'
import { SiteHeader } from '../components/SiteHeader'
import { DocRailroadDiagram } from '../components/DocRailroadDiagram'

interface PageContext {
  id: string
  prev: { title: string; slug: string } | null
  next: { title: string; slug: string } | null
}

interface DataType {
  mdx: {
    frontmatter: { title: string; slug: string }
  }
}

const mdxComponents = {
  img: ({ src, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <img src={src?.startsWith('/') ? withPrefix(src) : src} alt={alt} {...props} />
  ),
  RailroadDiagram: DocRailroadDiagram,
}

export default function DocPageTemplate({
  data,
  children,
  pageContext,
}: PageProps<DataType, PageContext>) {
  const { frontmatter } = data.mdx
  const { prev, next } = pageContext
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <>
      <SiteHeader />

      <div className="page-layout">
        <button
          className={`docs-mobile-toggle${sidebarOpen ? ' open' : ''}`}
          onClick={() => setSidebarOpen((o) => !o)}
          aria-expanded={sidebarOpen}
          aria-controls="docs-sidebar"
        >
          <span className="docs-mobile-toggle-icon">›</span>
          Documentation
        </button>

        <DocsSidebar currentSlug={frontmatter.slug} mobileOpen={sidebarOpen} />

        <main className="doc-main">
          <article className="doc-content">
            <MDXProvider components={mdxComponents}>{children}</MDXProvider>
          </article>

          <nav className="prev-next">
            {prev ? (
              <Link to={`/docs/${prev.slug}/`} className="prev-link">
                <span className="prev-next-label">← Previous</span>
                <span className="prev-next-title">{prev.title}</span>
              </Link>
            ) : (
              <span />
            )}

            {next ? (
              <Link to={`/docs/${next.slug}/`} className="next-link">
                <span className="prev-next-label">Next →</span>
                <span className="prev-next-title">{next.title}</span>
              </Link>
            ) : (
              <span />
            )}
          </nav>
        </main>
      </div>
    </>
  )
}

export const Head: HeadFC<DataType> = ({ data }) => (
  <title>{data.mdx.frontmatter.title} — RDP.js</title>
)

export const query = graphql`
  query DocPageQuery($id: String!) {
    mdx(id: { eq: $id }) {
      frontmatter {
        title
        slug
      }
    }
  }
`
