import React from 'react'

interface Props {
  prefix: string
  logoLight: string
  logoDark: string
}

export function SiteHeaderBase({ prefix, logoLight, logoDark }: Props) {
  return (
    <header className="site-header">
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
        <nav className="site-nav">
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
