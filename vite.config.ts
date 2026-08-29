import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: [
        'favicon.ico',
        'pwa-192x192.png',
        'pwa-512x512.png',
      ],
      manifest: {
        name: 'Chirurghi del Fantacalcio',
        short_name: 'Chirurghi',
        description: 'Assistente d’asta Fantacalcio offline-first',
        theme_color: '#0b1423',
        background_color: '#09101c',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,

        // Tutto il cuore dell'app viene salvato sul dispositivo.
        globPatterns: [
          '**/*.{js,css,html,ico,png,svg,webp,json,woff,woff2}',
        ],

        navigateFallback: '/index.html',

        runtimeCaching: [
          // Le funzioni Netlify devono sempre cercare dati nuovi:
          // mai servire una vecchia risposta dalla cache.
          {
            urlPattern: ({ url }) =>
              url.pathname.startsWith('/.netlify/functions/'),
            handler: 'NetworkOnly',
          },

          // Figurine Fantacalcio:
          // una volta viste, restano disponibili anche offline.
          {
            urlPattern: /^https:\/\/content\.fantacalcio\.it\/web\/campioncini\/.*$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fantacalcio-player-images-v1',
              expiration: {
                maxEntries: 700,
                maxAgeSeconds: 60 * 60 * 24 * 120,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },

          // Altre immagini esterne: prova rete, poi usa la copia locale.
          {
            urlPattern: ({ request, url }) =>
              request.destination === 'image' &&
              url.hostname !== 'content.fantacalcio.it',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'fantacalcio-external-images-v1',
              expiration: {
                maxEntries: 250,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },

          // File statici locali caricati a runtime.
          {
            urlPattern: ({ request, url }) =>
              url.pathname.startsWith('/assets/') &&
              ['script', 'style', 'font', 'image'].includes(request.destination),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'fantacalcio-static-runtime-v1',
              expiration: {
                maxEntries: 300,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
        suppressWarnings: true,
      },
    }),
  ],
})