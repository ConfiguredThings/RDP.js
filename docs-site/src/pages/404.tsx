import React from 'react'
import { Link, type HeadFC } from 'gatsby'
import Layout from '../components/Layout'

export default function NotFoundPage() {
  return (
    <Layout fullWidth>
      <div className="not-found">
        <h1>404</h1>
        <p>This page doesn't exist.</p>
        <Link to="/" className="btn btn-primary">
          Back to home
        </Link>
      </div>
    </Layout>
  )
}

export const Head: HeadFC = () => <title>Not found — RDP.js</title>
