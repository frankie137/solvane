/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-object-type
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface ImportMetaEnv {
  /** 云开发环境 ID；不填则使用小程序的默认环境 */
  readonly VITE_CLOUD_ENV?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** 构建时注入的版本号，来自 package.json */
declare const __APP_VERSION__: string
