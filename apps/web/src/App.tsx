import { Feature, Terrain, TileRule, assignStartSite, balance, findPlot, mulberry32, territoryRect } from '@game/shared'
import type { Plot, Point } from '@game/shared'
import { useEffect, useMemo, useRef, useState } from 'react'
import { startMusic } from './audio/music'
import type { Music } from './audio/music'
import { Minimap } from './game/Minimap'
import { createWorld } from './game/createWorld'
import type { Hover, WorldView } from './game/createWorld'

const TERRAIN_NAMES: Record<number, string> = {
  [Terrain.Grass]: 'Çayır',
  [Terrain.Forest]: 'Orman',
  [Terrain.Mountain]: 'Dağ',
  [Terrain.Swamp]: 'Bataklık',
  [Terrain.Desert]: 'Kurak',
  [Terrain.Lake]: 'Göl',
  [Terrain.River]: 'Nehir',
}
const FEATURE_NAMES: Record<number, string> = {
  [Feature.Road]: 'Ticaret yolu',
  [Feature.Bridge]: 'Köprü',
  [Feature.Inn]: 'Han',
}

const RULE_NAMES: Record<number, string> = {
  [TileRule.Free]: 'inşa edilebilir',
  [TileRule.Blocked]: 'inşa edilemez',
  [TileRule.DockOnly]: 'yalnızca iskele',
  [TileRule.TunnelOnly]: 'yalnızca tünel',
  [TileRule.TradePostOnly]: 'yalnızca ticaret noktası',
}

const MUTED_KEY = 'music-muted'
const readMuted = () => {
  try {
    return localStorage.getItem(MUTED_KEY) === '1'
  } catch {
    return false
  }
}

const seed = Number(new URLSearchParams(location.search).get('seed') ?? 1337)

function App() {
  const host = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<WorldView | null>(null)
  const [hover, setHover] = useState<Hover | null>(null)
  const [center, setCenter] = useState<Point | null>(null)

  useEffect(() => {
    let cancelled = false
    let created: WorldView | undefined
    createWorld(host.current!, seed, setHover, setCenter).then((v) => {
      if (cancelled) return v.destroy()
      created = v
      setView(v)
    })
    return () => {
      cancelled = true
      created?.destroy()
      setView(null)
    }
  }, [])

  // Browsers only allow audio after a user gesture, so the music starts on the first touch or key.
  const music = useRef<Music | null>(null)
  const [muted, setMuted] = useState(readMuted)
  const mutedRef = useRef(muted)
  useEffect(() => {
    const start = () => {
      if (!music.current) music.current = startMusic(mutedRef.current)
    }
    window.addEventListener('pointerdown', start, { once: true })
    window.addEventListener('keydown', start, { once: true })
    return () => {
      window.removeEventListener('pointerdown', start)
      window.removeEventListener('keydown', start)
      music.current?.destroy()
      music.current = null
    }
  }, [])
  useEffect(() => {
    mutedRef.current = muted
    music.current?.setMuted(muted)
    try {
      localStorage.setItem(MUTED_KEY, muted ? '1' : '0')
    } catch {
      // Storage may be unavailable (private mode); the setting just is not remembered.
    }
  }, [muted])

  const [stage, setStage] = useState(0)
  const [roll, setRoll] = useState(0)
  const site = useMemo(
    () => view && assignStartSite(view.world, mulberry32(seed * 1000 + roll)),
    [view, roll],
  )
  const plots = useMemo(() => {
    if (!view || !site) return null
    const rect = territoryRect(site, stage)
    return {
      dock: findPlot(view.world, rect, TileRule.DockOnly),
      trade: findPlot(view.world, rect, TileRule.TradePostOnly),
    }
  }, [view, site, stage])

  useEffect(() => {
    if (view && site) view.centerOn(site)
  }, [view, site])
  useEffect(() => {
    view?.setTerritory(site ? territoryRect(site, stage) : null, {
      dock: plots?.dock?.plot ?? null,
      trade: plots?.trade?.plot ?? null,
    })
  }, [view, site, stage, plots])

  const describe = (plot: Plot | null | undefined) =>
    !plot ? 'yok' : plot.granted ? `hudut dışında, ${plot.distance} karo uzakta` : 'hudut içinde'

  return (
    <>
      <div ref={host} style={{ width: '100%', height: '100%' }} />
      <div className="hud">
        <div>
          Tohum: {seed}
          {view && ` · ${view.world.size}×${view.world.size} karo · ${view.world.inns.length} han`}
        </div>
        <div>
          {hover
            ? `${hover.tile.x}, ${hover.tile.y} · ${FEATURE_NAMES[hover.feature] ?? TERRAIN_NAMES[hover.terrain]} · ${RULE_NAMES[hover.rule]}`
            : '—'}
        </div>
        {plots && (
          <>
            <div>İskele arsası: {describe(plots.dock)}</div>
            <div>Ticaret arsası: {describe(plots.trade)}</div>
          </>
        )}
      </div>
      <div className="stages">
        <button onClick={() => setRoll((r) => r + 1)}>Yeni yer ata</button>
        {balance.territory.stageParcels.map((parcels, i) => (
          <button key={parcels} className={i === stage ? 'active' : ''} onClick={() => setStage(i)}>
            {parcels}×{parcels}
          </button>
        ))}
        <button onClick={() => setMuted((m) => !m)} title={muted ? 'Müziği aç' : 'Müziği kapat'}>
          {muted ? '♪ kapalı' : '♪ açık'}
        </button>
      </div>
      {view && (
        <div className="zoom">
          <button onClick={() => view.zoomBy(1)} aria-label="Yakınlaştır">
            +
          </button>
          <button onClick={() => view.zoomBy(-1)} aria-label="Uzaklaştır">
            −
          </button>
        </div>
      )}
      {view && <Minimap world={view.world} center={center} onJump={view.centerOn} />}
    </>
  )
}

export default App
