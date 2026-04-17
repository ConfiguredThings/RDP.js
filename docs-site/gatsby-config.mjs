import rehypeShiki from '@shikijs/rehype';
import remarkGfm from 'remark-gfm';
import remarkValidateLinks from 'remark-validate-links';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';

/** @type {import('gatsby').GatsbyConfig} */
const config = {
  pathPrefix: '/RDP.js',
  trailingSlash: 'always',

  siteMetadata: {
    title: 'RDP.js',
    description: 'A minimal, typed base class for writing recursive descent parsers in TypeScript.',
    siteUrl: 'https://configuredthings.github.io/RDP.js',
  },

  plugins: [
    {
      resolve: 'gatsby-plugin-mdx',
      options: {
        extensions: ['.mdx', '.md'],
        mdxOptions: {
          remarkPlugins: [remarkGfm, remarkValidateLinks],
          rehypePlugins: [
            rehypeSlug,
            [
              rehypeAutolinkHeadings,
              {
                behavior: 'wrap',
                properties: { className: ['anchor'] },
              },
            ],
            [
              rehypeShiki,
              {
                themes: {
                  light: 'github-light',
                  dark:  'github-dark-dimmed',
                },
                defaultColor: false,
              },
            ],
          ],
        },
      },
    },

    {
      resolve: 'gatsby-source-filesystem',
      options: { name: 'guide', path: './content/guide' },
    },
  ],
};

export default config;
