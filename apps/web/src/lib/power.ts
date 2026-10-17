import { useEffect, useState } from 'react'

// Power saving (CLAUDE.md §12). "Otomatik" turns it on for phones and tablets (a touch screen with no mouse), for a
// player who asked the system for less motion, and while a laptop runs on its battery (where the browser tells).

export type PowerMode = 'auto' | 'on' | 'off'

interface Battery extends EventTarget {
  charging: boolean
}

const touchOnly = () => window.matchMedia?.('(pointer: coarse) and (hover: none)').matches ?? false
const lessMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

// Whether power saving is on for this mode on this device, kept up to date as the charger comes and goes.
export function usePowerSave(mode: PowerMode): boolean {
  const [onBattery, setOnBattery] = useState(false)
  const [device, setDevice] = useState(() => touchOnly() || lessMotion())
  useEffect(() => {
    if (mode !== 'auto') return
    let battery: Battery | null = null
    let live = true
    const onCharging = () => battery && setOnBattery(!battery.charging)
    const getBattery = (navigator as Navigator & { getBattery?: () => Promise<Battery> }).getBattery
    getBattery?.call(navigator).then(
      (b) => {
        if (!live) return
        battery = b
        onCharging()
        b.addEventListener('chargingchange', onCharging)
      },
      () => {},
    )
    const queries = ['(pointer: coarse) and (hover: none)', '(prefers-reduced-motion: reduce)'].map((q) => window.matchMedia?.(q)).filter((q): q is MediaQueryList => !!q)
    const onDevice = () => setDevice(touchOnly() || lessMotion())
    for (const q of queries) q.addEventListener?.('change', onDevice)
    return () => {
      live = false
      battery?.removeEventListener('chargingchange', onCharging)
      for (const q of queries) q.removeEventListener?.('change', onDevice)
    }
  }, [mode])
  return mode === 'on' || (mode === 'auto' && (device || onBattery))
}
