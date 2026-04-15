import React from 'react'
import { SiteHeader } from './SiteHeader'

interface LayoutProps {
  children: React.ReactNode
  fullWidth?: boolean
}

export default function Layout({ children, fullWidth = false }: LayoutProps) {
  return (
    <>
      <SiteHeader />

      {fullWidth ? (
        children
      ) : (
        <div className="page-layout">
          <main className="doc-main">{children}</main>
        </div>
      )}
    </>
  )
}
