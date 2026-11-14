import js from '@eslint/js'

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'art/**', '*.tsbuildinfo']
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        performance: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        fetch: 'readonly',
        console: 'readonly',
        devicePixelRatio: 'readonly',
        innerWidth: 'readonly',
        innerHeight: 'readonly',
        matchMedia: 'readonly',
        requestIdleCallback: 'readonly',
        addEventListener: 'readonly',
        removeEventListener: 'readonly',
        getComputedStyle: 'readonly',
        Image: 'readonly',
        HTMLCanvasElement: 'readonly',
        URL: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
      }
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      eqeqeq: ['warn', 'smart'],
      'prefer-const': 'warn',
    }
  }
]
