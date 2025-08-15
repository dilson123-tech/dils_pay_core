// ESLint flat config
import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import pluginImport from 'eslint-plugin-import';
import pluginN from 'eslint-plugin-n';
import pluginPromise from 'eslint-plugin-promise';
import pluginSecurity from 'eslint-plugin-security';
import pluginSonar from 'eslint-plugin-sonarjs';

export default [
  js.configs.recommended,
  eslintConfigPrettier,
  {
    files: ['**/*.js'],
    ignores: ['node_modules/**', 'dist/**', 'build/**'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        document: 'readonly',
        window: 'readonly',
        localStorage: 'readonly',
        console: 'readonly',
        URLSearchParams: 'readonly',
        Headers: 'readonly',
        Request: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        atob: 'readonly',
        setInterval: 'readonly',
        // Service Worker
        self: 'readonly',
        caches: 'readonly',
        clients: 'readonly'
      }
    },
    plugins: {
      import: pluginImport,
      n: pluginN,
      promise: pluginPromise,
      security: pluginSecurity,
      sonarjs: pluginSonar
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-implicit-globals': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'sonarjs/cognitive-complexity': ['warn', 20],
      'promise/no-return-wrap': 'error',
      'promise/param-names': 'error',
      'import/no-unresolved': 'off',
      'n/no-unsupported-features/es-syntax': 'off',
      'security/detect-object-injection': 'off'
    }
  }
];
