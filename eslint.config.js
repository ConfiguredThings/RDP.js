import tseslint from 'typescript-eslint'
import prettierConfig from 'eslint-config-prettier'
import prettierPlugin from 'eslint-plugin-prettier'

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'scripts/**', 'docs-site/node_modules/**'],
  },
  ...tseslint.configs.recommended,
  // ── Library source — strict rules ─────────────────────────────────────────
  {
    files: ['src/**/*.ts'],
    plugins: { prettier: prettierPlugin },
    rules: {
      ...prettierConfig.rules,
      'prettier/prettier': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },
  // ── Docs site — relaxed rules for React/TSX ───────────────────────────────
  {
    files: ['docs-site/src/**/*.{ts,tsx}'],
    plugins: { prettier: prettierPlugin },
    rules: {
      ...prettierConfig.rules,
      'prettier/prettier': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
)
