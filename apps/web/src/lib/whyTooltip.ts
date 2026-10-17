// Every disabled button tells why it is disabled (CLAUDE.md §11): a disabled button carries the reason in
// `data-why` (or, failing that, `title`), and hovering it (or tapping it on a touch screen) shows that reason in a
// small pixel bubble. Browsers don't reliably send pointer events to disabled controls, so such buttons are made
// transparent to the pointer in CSS (`button:disabled[data-why]`) and found here by hit-testing the element under
// the pointer. The bubble is fixed on the page (never clipped by a scrolling panel) and flips to stay on screen.
// `data-why` may be set on an enabled button too; it only shows while the button is disabled.

const SELECTOR = 'button:disabled[data-why], button:disabled[title]'
const MARGIN = 8
const HOVER_DELAY = 220
const TAP_SHOW = 2600

let bubble: HTMLDivElement | null = null
let shownFor: HTMLButtonElement | null = null
let pending: { button: HTMLButtonElement; timer: number } | null = null
let hideTimer = 0
let watchTimer = 0

function reasonOf(button: HTMLButtonElement): string {
  return (button.getAttribute('data-why') || button.getAttribute('title') || '').trim()
}

// The disabled-with-reason button under (x, y), searching the subtree of the element the pointer hit.
function hitAt(target: EventTarget | null, x: number, y: number): HTMLButtonElement | null {
  let root = target instanceof Element ? target : null
  // A reason button wrapped in an element that is itself pointer-transparent: search a little higher.
  for (let depth = 0; root && depth < 3; depth++, root = root.parentElement) {
    const found = root.querySelectorAll<HTMLButtonElement>(SELECTOR)
    for (let i = found.length - 1; i >= 0; i--) {
      const b = found[i]
      const r = b.getBoundingClientRect()
      if (r.width && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom && reasonOf(b)) return b
    }
    if (found.length) break
  }
  return null
}

function ensureBubble(): HTMLDivElement {
  if (bubble?.isConnected) return bubble
  bubble = document.createElement('div')
  bubble.className = 'why-tip'
  bubble.setAttribute('role', 'tooltip')
  document.body.appendChild(bubble)
  return bubble
}

function place(button: HTMLButtonElement) {
  const tip = ensureBubble()
  tip.textContent = reasonOf(button)
  tip.dataset.side = 'top'
  tip.style.left = '0px'
  tip.style.top = '0px'
  tip.classList.add('on')
  const r = button.getBoundingClientRect()
  const t = tip.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight
  let top = r.top - t.height - MARGIN
  if (top < MARGIN) {
    top = r.bottom + MARGIN
    tip.dataset.side = 'bottom'
    if (top + t.height > vh - MARGIN) top = Math.max(MARGIN, vh - MARGIN - t.height)
  }
  const center = r.left + r.width / 2
  const left = Math.min(Math.max(MARGIN, center - t.width / 2), Math.max(MARGIN, vw - MARGIN - t.width))
  tip.style.left = `${Math.round(left)}px`
  tip.style.top = `${Math.round(top)}px`
  tip.style.setProperty('--arrow', `${Math.round(Math.min(Math.max(10, center - left), t.width - 10))}px`)
}

function show(button: HTMLButtonElement) {
  shownFor = button
  place(button)
  document.documentElement.classList.add('why-hover')
  clearInterval(watchTimer)
  // The button may be enabled, re-labelled or removed while the bubble is up.
  watchTimer = window.setInterval(() => {
    if (!shownFor || !shownFor.isConnected || !shownFor.matches(SELECTOR) || !reasonOf(shownFor)) hide()
    else if (bubble && bubble.textContent !== reasonOf(shownFor)) place(shownFor)
  }, 300)
}

function hide() {
  if (pending) clearTimeout(pending.timer)
  pending = null
  clearTimeout(hideTimer)
  clearInterval(watchTimer)
  shownFor = null
  bubble?.classList.remove('on')
  document.documentElement.classList.remove('why-hover')
}

function hoverOver(button: HTMLButtonElement | null) {
  if (button === shownFor) return
  if (pending?.button === button) return
  if (!button) {
    if (shownFor || pending) hide()
    return
  }
  if (shownFor) {
    // Moving from one disabled button to the next: no delay.
    show(button)
    return
  }
  if (pending) clearTimeout(pending.timer)
  document.documentElement.classList.add('why-hover')
  pending = {
    button,
    timer: window.setTimeout(() => {
      pending = null
      if (button.isConnected && button.matches(SELECTOR)) show(button)
    }, HOVER_DELAY),
  }
}

if (typeof document !== 'undefined') {
  let frame = 0
  let last: PointerEvent | null = null
  document.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return
      last = e
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        if (last) hoverOver(hitAt(last.target, last.clientX, last.clientY))
      })
    },
    { passive: true, capture: true },
  )
  document.addEventListener('pointerleave', () => hide(), { passive: true })
  document.addEventListener('scroll', () => hide(), { passive: true, capture: true })
  document.addEventListener('keydown', () => hide(), { passive: true, capture: true })
  window.addEventListener('blur', () => hide())
  window.addEventListener('resize', () => hide())

  // A click (tap) on a disabled button never reaches what is behind it, and shows the reason for a moment.
  document.addEventListener(
    'click',
    (e) => {
      const button = hitAt(e.target, e.clientX, e.clientY)
      if (!button) return
      e.stopPropagation()
      e.preventDefault()
      show(button)
      clearTimeout(hideTimer)
      hideTimer = window.setTimeout(() => {
        if (shownFor === button) hide()
      }, TAP_SHOW)
    },
    true,
  )
}

export {}
