import React, { useEffect, useState } from 'react'
import { graphql, Link, withPrefix, type PageProps, type HeadFC } from 'gatsby'
import { MDXProvider } from '@mdx-js/react'
import DocsSidebar from '../components/DocsSidebar'
import { SiteHeader } from '../components/SiteHeader'
import { DocRailroadDiagram } from '../components/DocRailroadDiagram'
import { BenchmarkChart } from '../components/BenchmarkChart'
import { TableOfContents } from '../components/TableOfContents'
import { CopyCodeBlock } from '../components/CopyCodeBlock'

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
  pre: CopyCodeBlock,
  RailroadDiagram: DocRailroadDiagram,
  BenchmarkChart,
}

export default function DocPageTemplate({
  data,
  children,
  pageContext,
}: PageProps<DataType, PageContext>) {
  const { frontmatter } = data.mdx
  const { prev, next } = pageContext
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [stickyHeading, setStickyHeading] = useState<string | null>(null)

  // Track which h2 section the user is currently reading and surface it
  // as a sticky label pinned just below the site header.
  useEffect(() => {
    // When navigating to a hash, scroll-behavior:smooth means the browser
    // animates the scroll over ~400-600ms. We set the sticky heading immediately
    // on hashchange and suppress the scroll handler until the animation is done.
    // "Done" = no scroll event for 100ms (scroll-end detection).
    let scrollSuppressed = false
    let scrollEndTimer: ReturnType<typeof setTimeout> | null = null

    const update = () => {
      if (scrollSuppressed) return
      const headings = Array.from(
        document.querySelectorAll<HTMLElement>('.doc-content h2, .doc-content h3'),
      )
      const scrollMargin = headings[0]
        ? parseFloat(getComputedStyle(headings[0]).scrollMarginTop) || 0
        : 0
      let current: HTMLElement | null = null
      for (const h of headings) {
        if (h.getBoundingClientRect().top <= scrollMargin + 4) {
          current = h
        } else {
          break
        }
      }
      setStickyHeading(current ? (current.textContent ?? null) : null)
    }

    const onScroll = () => {
      if (scrollSuppressed) {
        // Keep resetting the scroll-end timer while smooth scroll is in flight
        if (scrollEndTimer) clearTimeout(scrollEndTimer)
        scrollEndTimer = setTimeout(() => {
          scrollSuppressed = false
          update()
        }, 100)
        return
      }
      update()
    }

    const onHashChange = () => {
      const id = window.location.hash.slice(1)
      if (!id) return
      const el = document.getElementById(id)
      if (el?.closest('.doc-content')) {
        setStickyHeading(el.textContent ?? null)
        scrollSuppressed = true
        if (scrollEndTimer) clearTimeout(scrollEndTimer)
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('hashchange', onHashChange)
    update()
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('hashchange', onHashChange)
      if (scrollEndTimer) clearTimeout(scrollEndTimer)
    }
  }, [])

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
          {/* Sticky section label — appears once the first h2 scrolls past the header */}
          <div
            className={`sticky-section-heading${stickyHeading ? ' sticky-section-heading--visible' : ''}`}
            aria-hidden="true"
          >
            <span>{stickyHeading ?? ''}</span>
          </div>

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

        <TableOfContents />
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
