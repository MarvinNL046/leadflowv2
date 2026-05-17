import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  // Forceer dev op poort 5173 (Vite default). strictPort=true → Vite faalt
  // expliciet als 5173 bezet is in plaats van stilzwijgend te shiften naar
  // 3001/3002/etc. Bewust gekozen zodat SITE_URL in convex/auth altijd
  // matched + OAuth callback-URL's later voorspelbaar zijn.
  server: { port: 5173, strictPort: true },
  plugins: [
    devtools(),
    nitro({ rollupConfig: { external: [/^@sentry\//] } }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
})

export default config
