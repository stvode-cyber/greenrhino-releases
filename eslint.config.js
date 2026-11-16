// eslint.config.js — flat config（ESLint v9+ 格式）
// 只开启项目关心的规则：no-shadow（防变量遮蔽，防 ctx 遮蔽重演）
// 其他规则留空——历史代码不做全面修复
import js from '@eslint/js'

export default [
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        ArrayBuffer: 'readonly',
        Uint8Array: 'readonly',
        navigator: 'readonly',
        Image: 'readonly',
        TextDecoder: 'readonly',
        TextEncoder: 'readonly',
        btoa: 'readonly',
        atob: 'readonly',
        HTMLCanvasElement: 'readonly',
        // 项目自研全局
        '__winRole': 'readonly',
        '__appVersion': 'readonly',
        '__grModuleRan': 'writable',
        '__mediaBatch': 'readonly',
        '__hostOpen': 'readonly',
        '__hostOpened': 'writable',
        'RhinoBridge': 'readonly'
      }
    },
    rules: {
      // 🎯 核心规则：防变量遮蔽（ctx 被局部变量遮蔽的历史教训，ISS-20261020-04）
      // allow: 函数参数遮蔽同名外层变量是正常闭包模式，不是 bug
      'no-shadow': ['error', { builtinGlobals: false, hoist: 'functions', allow: ['app', 'player', 'el', 'stage', 'recent', 'tx'] }]
    }
  },
  {
    ignores: ['release/**', 'node_modules/**', 'clients/**', 'server/**', 'src/lib/**']
  }
]
