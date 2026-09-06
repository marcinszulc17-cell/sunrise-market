import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// Podział bundla (2026-09-06): biblioteki w osobnych, długo cache'owanych plikach; strony rzadziej odwiedzane ładują się na żądanie (React.lazy w main.tsx).
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: { output: { manualChunks: { react: ["react", "react-dom", "react-router-dom"], supabase: ["@supabase/supabase-js"] } } },
  },
});
