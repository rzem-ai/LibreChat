/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENABLE_LOGGER: string;
  readonly VITE_LOGGER_FILTER: string;
  readonly VITE_FLAT_THREAD: string;
  // Deloitte Custom Change: expose configured workspace name for header/branding
  readonly VITE_WORKSPACE_NAME?: string;
  // Add other env variables here
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
