/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-object-type
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface ImportMetaEnv {
  /** CloudBase environment ID; uses the mini program's default environment if empty */
  readonly VITE_CLOUD_ENV?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Version number injected at build time, from package.json */
declare const __APP_VERSION__: string
