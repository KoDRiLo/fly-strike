import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['vendor/', 'node_modules/'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.browser },
    rules: { 'no-empty': ['error', { allowEmptyCatch: true }] },
  },
  {
    files: ['test/**/*.js', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node },
  },
];
