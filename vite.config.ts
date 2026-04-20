import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Project-pages path: served at https://<user>.github.io/synod/
export default defineConfig(({ mode }) => ({
  plugins: [vue()],
  base: mode === 'production' ? '/synod/' : '/',
}))
