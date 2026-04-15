import path from 'path'
import fs from 'fs'
import type { GatsbyNode } from 'gatsby'

// Webpack aliases so playground components can import from the library source
// rather than a built bundle — mirrors the approach in gnosisjs docs-site.
export const onCreateWebpackConfig: GatsbyNode['onCreateWebpackConfig'] = ({ actions }) => {
  actions.setWebpackConfig({
    resolve: {
      alias: {
        '@configuredthings/rdp.js/observable': path.resolve('../src/observable.ts'),
        '@configuredthings/rdp.js/generator': path.resolve('../src/generator/index.ts'),
        '@configuredthings/rdp.js/interpreter': path.resolve('../src/interpreter/index.ts'),
        '@configuredthings/rdp.js/grammars': path.resolve('../src/grammars/index.ts'),
        '@configuredthings/rdp.js': path.resolve('../src/index.ts'),
      },
      extensionAlias: {
        '.js': ['.ts', '.tsx', '.js'],
      },
    },
  })
}

// Serve TypeDoc output from /api/* in develop mode
export const onCreateDevServer: GatsbyNode['onCreateDevServer'] = ({ app }) => {
  // Redirect /RDP.js/* → /* so develop mode mirrors the production pathPrefix.
  app.use((req, res, next) => {
    if (req.url.startsWith('/RDP.js/')) {
      res.redirect(req.url.slice('/RDP.js'.length) || '/')
    } else if (req.url === '/RDP.js') {
      res.redirect('/')
    } else {
      next()
    }
  })

  const apiDir = path.resolve('./static/api')
  if (fs.existsSync(apiDir)) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const express = require('express') as typeof import('express')
    app.use('/api', express.static(apiDir))
  } else {
    console.warn(
      '\n⚠  static/api not found — run `node docs-site/scripts/copy-assets.mjs` then restart develop.\n',
    )
  }
}

export const createSchemaCustomization: GatsbyNode['createSchemaCustomization'] = ({ actions }) => {
  actions.createTypes(`
    type MdxFrontmatter @dontInfer {
      title: String!
      slug:  String!
      order: Float!
      section: String
    }
  `)
}

interface GuideFrontmatter {
  title: string
  slug: string
  order: number
  section?: string
}

interface GuideNode {
  id: string
  frontmatter: GuideFrontmatter
  internal: { contentFilePath: string }
}

interface AllMdxResult {
  allMdx: { nodes: GuideNode[] }
}

export const createPages: GatsbyNode['createPages'] = async ({ graphql, actions }) => {
  const { createPage } = actions
  const docTemplate = path.resolve('./src/templates/doc-page.tsx')

  const result = await graphql<AllMdxResult>(`
    query {
      allMdx(sort: { frontmatter: { order: ASC } }) {
        nodes {
          id
          frontmatter {
            title
            slug
            order
            section
          }
          internal {
            contentFilePath
          }
        }
      }
    }
  `)

  if (result.errors) throw result.errors

  const nodes = result.data!.allMdx.nodes

  nodes.forEach((node, index) => {
    const prev = index > 0 ? nodes[index - 1] : null
    const next = index < nodes.length - 1 ? nodes[index + 1] : null

    createPage({
      path: `/docs/${node.frontmatter.slug}/`,
      component: `${docTemplate}?__contentFilePath=${node.internal.contentFilePath}`,
      context: {
        id: node.id,
        prev: prev ? { title: prev.frontmatter.title, slug: prev.frontmatter.slug } : null,
        next: next ? { title: next.frontmatter.title, slug: next.frontmatter.slug } : null,
      },
    })
  })
}
