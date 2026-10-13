import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/pixelify-sans/latin-400.css'
import '@fontsource/pixelify-sans/latin-ext-400.css'
import '@fontsource/pixelify-sans/latin-600.css'
import '@fontsource/pixelify-sans/latin-ext-600.css'
import './fonts'
import './index.css'
import Root from './Root.tsx'

// iOS Safari ignores `user-scalable=no` and zooms the page on pinch (double-tap zoom is
// already off through `touch-action: none` in index.css). The map zooms with its buttons only,
// so the browser's own zoom is blocked everywhere.
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false })
}
document.addEventListener(
  'touchmove',
  (e) => {
    if (e.touches.length > 1) e.preventDefault()
  },
  { passive: false },
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
