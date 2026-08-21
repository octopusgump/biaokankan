/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly BIAOKANKAN_PAGES_ENCRYPTED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
