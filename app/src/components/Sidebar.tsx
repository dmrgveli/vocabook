import { motion } from 'motion/react'
import { BookOpen, Plus, Settings } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAppState } from '../app/state'
import { K_BANDS, kBand } from '../data/frequency'
import { MASTERY_LABELS, MASTERY_LEVELS, type Entry } from '../data/model'
import { SyncStatusLine } from './SyncStatus'
import { allSources, type Filters } from '../data/notebook'

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)
export const MOD_KEY = isMac ? '⌘' : 'Ctrl'

export function Sidebar({ entries }: { entries: Entry[] }) {
  const { filters, setFilters, openQuickAdd } = useAppState()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const counts = useMemo(() => {
    const band = new Map<string, number>()
    const mastery = new Map<string, number>()
    for (const e of entries) {
      const b = kBand(e.frequency)
      if (b) band.set(b, (band.get(b) ?? 0) + 1)
      mastery.set(e.mastery, (mastery.get(e.mastery) ?? 0) + 1)
    }
    return { band, mastery }
  }, [entries])
  const sources = useMemo(() => allSources(entries).slice(0, 8), [entries])

  // Picking a filter anywhere takes you to the notebook.
  const toggle = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((f) => ({ ...f, [key]: f[key] === value ? undefined : value }))
    if (pathname !== '/') navigate('/')
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <img className="brand-logo" src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={34} height={34} />
        Vocabook
      </div>

      <button className="btn btn-marker add-btn" onClick={openQuickAdd}>
        <Plus size={17} strokeWidth={2.5} /> Add word <kbd>{MOD_KEY} K</kbd>
      </button>

      <nav className="nav">
        <NavItem to="/" icon={<BookOpen size={17} />} label="Notebook" count={entries.length} />
        <NavItem to="/settings" icon={<Settings size={17} />} label="Settings" />
      </nav>

      {entries.length > 0 && (
        <div className="sidebar-filters">
          <FilterGroup title="How common">
            {K_BANDS.filter((b) => counts.band.has(b.id)).map((b) => (
              <FilterItem
                key={b.id}
                active={filters.band === b.id}
                onClick={() => toggle('band', b.id)}
                marker={<span className={`dot tone-${b.id}`} />}
                label={b.label}
                count={counts.band.get(b.id)}
              />
            ))}
          </FilterGroup>

          <FilterGroup title="Mastery">
            {MASTERY_LEVELS.map((m) => (
              <FilterItem
                key={m}
                active={filters.mastery === m}
                onClick={() => toggle('mastery', m)}
                marker={<span className="dot" style={{ background: `var(--mastery-${m})`, borderColor: `var(--mastery-${m})` }} />}
                label={MASTERY_LABELS[m]}
                count={counts.mastery.get(m) ?? 0}
              />
            ))}
          </FilterGroup>

          {sources.length > 0 && (
            <FilterGroup title="Sources">
              {sources.map(({ source, count }) => (
                <FilterItem key={source} active={filters.source === source} onClick={() => toggle('source', source)} label={source} count={count} />
              ))}
            </FilterGroup>
          )}

        </div>
      )}

      <SyncStatusLine />
    </aside>
  )
}

function NavItem({ to, icon, label, count }: { to: string; icon: ReactNode; label: string; count?: number }) {
  return (
    <NavLink to={to} end className="nav-item">
      {({ isActive }) => (
        <>
          {isActive && <motion.span layoutId="nav-active" className="nav-active" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
          <span className="row">{icon}</span>
          <span>{label}</span>
          {count !== undefined && <span className="nav-count">{count}</span>}
        </>
      )}
    </NavLink>
  )
}

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="filter-group">
      <h3 className="label-sm">{title}</h3>
      <div className="filter-list">{children}</div>
    </section>
  )
}

function FilterItem({ active, onClick, marker, label, count }: { active: boolean; onClick: () => void; marker?: ReactNode; label: string; count?: number }) {
  return (
    <button className="filter-item" aria-pressed={active} onClick={onClick}>
      {marker}
      <span className="filter-label">{label}</span>
      <span className="filter-count">{count}</span>
    </button>
  )
}
