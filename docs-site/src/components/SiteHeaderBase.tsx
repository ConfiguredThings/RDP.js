import React from 'react'

interface Props {
  prefix: string
  logoLight: string
  logoDark: string
}

/**
 * Static header rendered server-side for TypeDoc API pages.
 * Uses a CSS checkbox hack for the mobile nav drawer (no JS needed).
 */
export function SiteHeaderBase({ prefix, logoLight, logoDark }: Props) {
  return (
    <header className="site-header">
      {/* Hidden checkbox drives the CSS-only mobile nav toggle */}
      <input
        type="checkbox"
        id="site-nav-toggle"
        className="site-nav-toggle-cb"
        aria-hidden="true"
      />

      <div className="site-header-inner">
        <div className="site-logo">
          <a href="https://configuredthings.com" target="_blank" rel="noopener noreferrer">
            <picture>
              <source srcSet={logoDark} media="(prefers-color-scheme: dark)" />
              <img src={logoLight} alt="Configured Things" className="site-logo-img" />
            </picture>
          </a>
          <a href={`${prefix}/`} className="site-logo-name">
            / RDP.js
          </a>
        </div>

        {/* Hamburger label — toggles the checkbox */}
        <label
          htmlFor="site-nav-toggle"
          className="site-nav-hamburger"
          aria-label="Toggle navigation"
        >
          <span className="hamburger-icon" />
        </label>

        {/* Backdrop label — click to close */}
        <label htmlFor="site-nav-toggle" className="site-nav-backdrop" aria-hidden="true" />

        <nav id="site-nav" className="site-nav">
          <a href={`${prefix}/docs/overview/`}>Docs</a>
          <a href={`${prefix}/playground/`}>Playground</a>
          <a href={`${prefix}/api/`}>API</a>
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
