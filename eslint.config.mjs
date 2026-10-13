import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import prettier from 'eslint-config-prettier'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: [
      'dist/',
      'cloudfunctions/',
      'coverage/',
      '.smoke/',
      '.ci/',
      '.keys/',
      'node_modules/',
      'src/static/',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],

  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.vue'] },
    },
  },

  // Mini program
  {
    files: ['src/**/*.{ts,vue}'],
    languageOptions: {
      globals: { uni: 'readonly', wx: 'readonly', getCurrentPages: 'readonly', getApp: 'readonly' },
    },
    rules: {
      // Page files are all named index.vue
      'vue/multi-word-component-names': 'off',
    },
  },

  // Node: cloud functions, scripts, config files
  {
    files: ['cloud/**/*.ts', 'scripts/**/*.ts', '*.config.{ts,mts,mjs}'],
    languageOptions: { globals: globals.node },
  },

  {
    rules: {
      // Type checking already catches undefined variables
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      'no-console': ['warn', { allow: ['info', 'warn', 'error'] }],
      eqeqeq: ['error', 'always'],
    },
  },

  // import() types are idiomatic in type declaration files
  {
    files: ['**/*.d.ts'],
    rules: { '@typescript-eslint/consistent-type-imports': 'off' },
  },

  prettier,
)
