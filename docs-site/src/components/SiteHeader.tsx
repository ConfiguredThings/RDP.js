import React from 'react'
import { Link, withPrefix } from 'gatsby'

export function SiteHeader() {
  return (
    <header className="site-header">
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
        <nav className="site-nav">
          <Link to="/docs/overview/" activeClassName="active" partiallyActive>
            Docs
          </Link>
          <Link to="/playground/" activeClassName="active">
            Playground
          </Link>
          <a href={withPrefix('/api/index.html')}>API</a>
          <a
            href="https://github.com/ConfiguredThings/RDP.js"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
        </nav>
      </div>
    </header>
  )
}
