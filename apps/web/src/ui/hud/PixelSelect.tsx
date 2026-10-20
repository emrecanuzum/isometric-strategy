import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type React from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../icons'
import { L, locale } from '../../lib/i18n'
import type { IconName } from '../icons'

// The game's own dropdown, in place of the native <select> (whose system menu breaks the pixel look). A wooden button
// with a pixel caret opens a framed list in a portal, so it is never clipped by a scrolling sheet; it opens below the
// button, or above when there is no room. Keyboard: arrows, Home/End, Enter/Space, Escape, Tab, and typeahead.

export type PixelOption<V extends string | number> = {
  value: V
  label: string
  icon?: IconName
  // A muted tag after the label, e.g. "kimsenin değil".
  note?: string
  disabled?: boolean
}

type Props<V extends string | number> = {
  value: NoInfer<V> | undefined | null
  options: PixelOption<V>[]
  onChange(value: NoInfer<V>): void
  // Shown when nothing is chosen, or when there are no options at all.
  placeholder?: string
  disabled?: boolean
  // Why it is disabled, shown on hover or tap (CLAUDE.md §11); with no options, the placeholder says it.
  why?: string
  className?: string
  small?: boolean
  'aria-label'?: string
}

const GAP = 4
const MAX_HEIGHT = 280

export function PixelSelect<V extends string | number>({ value, options, onChange, placeholder, disabled, why, className, small, 'aria-label': ariaLabel }: Props<V>) {
  const id = useId()
  const button = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [place, setPlace] = useState<{ left: number; top?: number; bottom?: number; width: number; maxHeight: number } | null>(null)
  const typed = useRef({ text: '', at: 0 })
  const off = disabled || options.length === 0
  const chosen = options.findIndex((o) => o.value === value)
  const current = chosen >= 0 ? options[chosen] : undefined

  const close = useCallback((focus = true) => {
    setOpen(false)
    setPlace(null)
    if (focus) button.current?.focus()
  }, [])

  const step = (from: number, dir: 1 | -1) => {
    for (let i = 1; i <= options.length; i++) {
      const at = (from + dir * i + options.length * 2) % options.length
      if (!options[at].disabled) return at
    }
    return from
  }
  const edge = (dir: 1 | -1) => step(dir === 1 ? -1 : options.length, dir)

  const show = (at?: number) => {
    if (off) return
    setActive(at ?? (chosen >= 0 ? chosen : edge(1)))
    setOpen(true)
  }
  const pick = (at: number) => {
    const o = options[at]
    if (!o || o.disabled) return
    if (o.value !== value) onChange(o.value)
    close()
  }

  // Place the list under (or over) the button; follow it while sheets scroll or the window resizes.
  useLayoutEffect(() => {
    if (!open) return
    const measure = () => {
      const r = button.current?.getBoundingClientRect()
      if (!r) return
      const below = window.innerHeight - r.bottom - GAP - 8
      const above = r.top - GAP - 8
      const want = Math.min(MAX_HEIGHT, (list.current?.scrollHeight ?? MAX_HEIGHT) + 8)
      const up = below < want && above > below
      const width = Math.max(r.width, 160)
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8))
      setPlace(
        up
          ? { left, bottom: window.innerHeight - r.top + GAP, width, maxHeight: Math.min(MAX_HEIGHT, above) }
          : { left, top: r.bottom + GAP, width, maxHeight: Math.min(MAX_HEIGHT, below) },
      )
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open, options.length])

  // Outside press closes.
  useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent) => {
      const t = e.target as Node
      if (button.current?.contains(t) || list.current?.contains(t)) return
      close(false)
    }
    document.addEventListener('pointerdown', down, true)
    return () => document.removeEventListener('pointerdown', down, true)
  }, [open, close])

  // Keep the active option in view.
  useEffect(() => {
    if (!open || active < 0) return
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active, place])

  const typeahead = (key: string) => {
    const now = performance.now()
    const t = typed.current
    t.text = now - t.at > 700 ? key : t.text + key
    t.at = now
    const needle = t.text.toLocaleLowerCase(locale())
    const start = active >= 0 ? active : -1
    for (let i = 1; i <= options.length; i++) {
      const at = (start + (t.text.length > 1 ? i - 1 : i) + options.length) % options.length
      const o = options[at]
      if (!o.disabled && o.label.toLocaleLowerCase(locale()).startsWith(needle)) return at
    }
    return -1
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (off) return
    const k = e.key
    if (!open) {
      if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Enter' || k === ' ') {
        e.preventDefault()
        show(k === 'ArrowUp' && chosen < 0 ? edge(-1) : undefined)
      } else if (k === 'Home' || k === 'End') {
        e.preventDefault()
        show(edge(k === 'Home' ? 1 : -1))
      } else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const at = typeahead(k)
        if (at >= 0) show(at)
      }
      return
    }
    if (k === 'ArrowDown' || k === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => step(a, k === 'ArrowDown' ? 1 : -1))
    } else if (k === 'Home' || k === 'End') {
      e.preventDefault()
      setActive(edge(k === 'Home' ? 1 : -1))
    } else if (k === 'PageDown' || k === 'PageUp') {
      e.preventDefault()
      let a = active
      for (let i = 0; i < 5; i++) a = step(a, k === 'PageDown' ? 1 : -1)
      setActive(a)
    } else if (k === 'Enter' || (k === ' ' && performance.now() - typed.current.at > 700)) {
      e.preventDefault()
      pick(active)
    } else if (k === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    } else if (k === 'Tab') {
      close(false)
    } else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const at = typeahead(k)
      if (at >= 0) setActive(at)
    }
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        className={`btn pixel-select${small ? ' small' : ''}${open ? ' open' : ''}${className ? ` ${className}` : ''}`}
        disabled={off}
        data-why={options.length === 0 ? (placeholder ?? L('Seçenek yok', 'No options')) : (why ?? L('Şu an seçilemez', 'Cannot be chosen right now'))}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-activedescendant={open && active >= 0 ? `${id}-${active}` : undefined}
        aria-label={ariaLabel}
        onClick={() => (open ? close() : show())}
        onKeyDown={onKey}
      >
        <span className="pixel-select-value">
          {current?.icon && <Icon name={current.icon} size={18} />}
          <span className="pixel-select-label">{current ? current.label : (placeholder ?? L('Seç', 'Choose'))}</span>
          {current?.note && <span className="pixel-select-note">{current.note}</span>}
        </span>
        <span className="pixel-select-caret" aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <ul
            ref={list}
            id={`${id}-list`}
            role="listbox"
            aria-label={ariaLabel}
            className="frame pixel-select-list"
            style={place ? { left: place.left, top: place.top, bottom: place.bottom, width: place.width, maxHeight: place.maxHeight } : { visibility: 'hidden', left: 0, top: 0 }}
            onKeyDown={onKey}
          >
            {options.map((o, i) => (
              <li
                key={String(o.value)}
                id={`${id}-${i}`}
                data-index={i}
                role="option"
                aria-selected={i === chosen}
                aria-disabled={o.disabled || undefined}
                className={`pixel-select-option${i === active ? ' active' : ''}${i === chosen ? ' chosen' : ''}`}
                onPointerMove={() => !o.disabled && active !== i && setActive(i)}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => pick(i)}
              >
                <span className="pixel-select-mark" aria-hidden="true" />
                {o.icon && <Icon name={o.icon} size={18} />}
                <span className="pixel-select-label">{o.label}</span>
                {o.note && <span className="pixel-select-note">{o.note}</span>}
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </>
  )
}
