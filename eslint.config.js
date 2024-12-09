const globals = require('globals');
const pluginJs = require('@eslint/js');
const stylisticJs = require('@stylistic/eslint-plugin-js');

module.exports = [
  {
    plugins: {
      '@stylistic/js': stylisticJs,
    },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      '@stylistic/js/quotes': ['error', 'single', { avoidEscape: true }],
      '@stylistic/js/linebreak-style': ['error', 'unix'],
      '@stylistic/js/indent': ['error', 2],
    },
    languageOptions: {
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...globals.node,
        process: 'readonly',
      },
    },
  },
  pluginJs.configs.recommended,
];