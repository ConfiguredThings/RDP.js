import React, { useState, useCallback } from 'react'
import { Link, withPrefix } from 'gatsby'

export function SiteHeader() {
  const [navOpen, setNavOpen] = useState(false)
  const close = useCallback(() => setNavOpen(false), [])

  return (
    <>
      <header className="site-header">
        <div className="unstable-banner">
          <strong>v0 — unstable API.</strong> Minor versions may introduce breaking changes until
          1.0.
        </div>
        <div className="site-header-inner">
          <div className="site-logo">
            <a href="https://configuredthings.com" target="_blank" rel="noopener noreferrer">
              <picture>
                <source
                  srcSet={withPrefix('/configuredthings-light.svg')}
                  media="(prefers-color-scheme: dark)"
                />
                <img
                  src={withPrefix('/configuredthings.svg')}
                  alt="Configured Things"
                  className="site-logo-img"
                />
              </picture>
            </a>
            <Link to="/" className="site-logo-name">
              / RDP.js
            </Link>
          </div>

          <button
            className="site-nav-hamburger"
            onClick={() => setNavOpen((o) => !o)}
            aria-label="Toggle navigation"
            aria-expanded={navOpen}
            aria-controls="site-nav"
          >
            <span className={`hamburger-icon${navOpen ? ' open' : ''}`} />
          </button>

          {/* Backdrop — click anywhere outside drawer to close */}
          <div
            className={`site-nav-backdrop${navOpen ? ' open' : ''}`}
            onClick={close}
            aria-hidden="true"
          />

          <nav id="site-nav" className={`site-nav${navOpen ? ' nav-open' : ''}`}>
            <Link to="/docs/overview/" activeClassName="active" partiallyActive onClick={close}>
              Docs
            </Link>
            <Link to="/playground/" activeClassName="active" onClick={close}>
              Playground
            </Link>
            <a href={withPrefix('/api/index.html')} onClick={close}>
              API
            </a>
            <a
              href="https://github.com/ConfiguredThings/RDP.js"
              target="_blank"
              rel="noopener noreferrer"
              onClick={close}
            >
              GitHub
            </a>
          </nav>
        </div>
      </header>
    </>
  )
}
