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

  // 小程序端
  {
    files: ['src/**/*.{ts,vue}'],
    languageOptions: {
      globals: { uni: 'readonly', wx: 'readonly', getCurrentPages: 'readonly', getApp: 'readonly' },
    },
    rules: {
      // 页面文件统一叫 index.vue
      'vue/multi-word-component-names': 'off',
    },
  },

  // Node 端：云函数、脚本、配置文件
  {
    files: ['cloud/**/*.ts', 'scripts/**/*.ts', '*.config.{ts,mts,mjs}'],
    languageOptions: { globals: globals.node },
  },

  {
    rules: {
      // 类型检查已经覆盖未定义变量
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

  // 类型声明文件里 import() 类型是惯用写法
  {
    files: ['**/*.d.ts'],
    rules: { '@typescript-eslint/consistent-type-imports': 'off' },
  },

  prettier,
)
