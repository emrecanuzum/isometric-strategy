// Every button that sends a command shows it is waiting for the server's answer (CLAUDE.md §11), without each
// component tracking it: the button clicked last is remembered for the rest of that click's task, and a command
// started meanwhile marks it busy (`data-busy`, `aria-busy`) until the answer comes. A busy button swallows further
// clicks. A command started right after another one settles (`act(...).then(() => act(...))`) keeps the same button
// busy. Buttons that unmount meanwhile are simply let go.

let armed: HTMLButtonElement | null = null
const count = new WeakMap<HTMLButtonElement, number>()

function arm(button: HTMLButtonElement | null) {
  armed = button
  // A macrotask: every handler and microtask of this click runs before it.
  setTimeout(() => {
    if (armed === button) armed = null
  }, 0)
}

if (typeof document !== 'undefined') {
  document.addEventListener(
    'click',
    (e) => {
      const button = (e.target as Element | null)?.closest?.('button') ?? null
      if (button?.hasAttribute('data-busy')) {
        e.stopPropagation()
        e.preventDefault()
        return
      }
      arm(button)
    },
    true,
  )
}

function hold(button: HTMLButtonElement) {
  const n = (count.get(button) ?? 0) + 1
  count.set(button, n)
  if (n === 1) {
    button.setAttribute('data-busy', '')
    button.setAttribute('aria-busy', 'true')
  }
}

function release(button: HTMLButtonElement) {
  const n = (count.get(button) ?? 1) - 1
  if (n > 0) return void count.set(button, n)
  count.delete(button)
  button.removeAttribute('data-busy')
  button.removeAttribute('aria-busy')
}

// Marks the button of the current click (if any) busy while `work` runs.
export function busyWhile<T>(work: Promise<T>): Promise<T> {
  const button = armed
  if (!button) return work
  hold(button)
  const done = () => {
    // Let a command chained on this one claim the button before it is freed.
    if (!armed) arm(button)
    setTimeout(() => release(button), 0)
  }
  work.then(done, done)
  return work
}
