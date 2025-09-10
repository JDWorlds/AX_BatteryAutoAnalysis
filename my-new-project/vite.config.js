import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import path from "path"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src') // 👉 이 부분 추가
    }
  },
  server: {
    proxy: {
      '/api': 'http://localhost:5119', // .NET API 서버 주소
      '/tileserver': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/tileserver/, '')
      }
    }
  },
  css: {
    postcss: {
      plugins: [tailwindcss()],
    }
  }
})
