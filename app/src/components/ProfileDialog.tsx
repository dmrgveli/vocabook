import { AnimatePresence, motion } from 'motion/react'
import { Award, BookOpen, Flame, Repeat, Settings, Sparkles, X } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppState } from '../app/state'
import { levelOf, useLevelsReady } from '../data/levels'
import type { Entry } from '../data/model'
import { achievements, activityByDay, heatmap, stats, streaks } from '../data/progress'
import { signOut, useAuth } from '../sync/auth'
import { SyncStatusText } from './SyncStatus'

const dayLabel = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

/** Words beyond the 10,000 most common families count as "deep cuts". */
const isRare = (word: string) => {
  const l = levelOf(word)
  return l !== undefined && (l.level === 'off' || l.level > 10)
}

export function ProfileDialog({ entries }: { entries: Entry[] }) {
  const { profileOpen, setProfileOpen } = useAppState()
  const close = () => setProfileOpen(false)

  useEffect(() => {
    if (!profileOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setProfileOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [profileOpen, setProfileOpen])

  return (
    <AnimatePresence>
      {profileOpen && (
        <motion.div
          className="overlay overlay-soft"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && close()}
        >
          <motion.div
            className="dialog profile"
            role="dialog"
            aria-modal="true"
            aria-label="Your profile"
            initial={{ opacity: 0, y: 14, rotate: -1 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          >
            <ProfileContent entries={entries} onClose={close} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function ProfileContent({ entries, onClose }: { entries: Entry[]; onClose: () => void }) {
  const auth = useAuth()
  const navigate = useNavigate()
  const levelsReady = useLevelsReady()
  const active = useMemo(() => activityByDay(entries), [entries])
  const streak = useMemo(() => streaks(active), [active])
  const weeks = useMemo(() => heatmap(active, 26), [active])
  const s = useMemo(() => stats(entries, isRare), [entries, levelsReady])
  const badges = useMemo(() => achievements(s), [s])
  const earned = badges.filter((b) => b.value >= b.goal).length
  const user = auth.status === 'signed-in' || auth.status === 'expired' ? auth.user : undefined

  return (
    <>
      <button className="icon-btn dialog-close" onClick={onClose} aria-label="Close" autoFocus>
        <X size={18} />
      </button>

      <header className="profile-head">
        {user?.picture ? <img className="avatar avatar-lg" src={user.picture} alt="" referrerPolicy="no-referrer" /> : <span className="avatar avatar-lg" />}
        <div>
          <h2 className="profile-name">{user?.name ?? user?.email ?? 'Your notebook'}</h2>
          {user?.name && user.email && <div className="faint small">{user.email}</div>}
          <div className="small muted">
            <SyncStatusText />
          </div>
        </div>
      </header>

      <section className="streak-card" data-active={streak.activeToday}>
        <Flame size={30} className="streak-flame" />
        <div>
          <div className="streak-number">
            {streak.current} <span>{streak.current === 1 ? 'day' : 'days'}</span>
          </div>
          <div className="small muted">
            {streak.current === 0
              ? 'Add or revisit a word to start a streak.'
              : streak.activeToday
                ? 'You’ve been here today. Nice.'
                : 'Visit a word today to keep it going.'}
            {streak.longest > streak.current && ` Longest: ${streak.longest} days.`}
          </div>
        </div>
      </section>

      <section aria-label="Activity in the last 6 months">
        <h3 className="label-sm profile-label">Last 6 months</h3>
        <div className="heatmap">
          {weeks.map((week, w) => (
            <div key={w} className="heatmap-col">
              {week.map((d) => (
                <span
                  key={d.day}
                  className="heat"
                  data-level={d.future ? 'future' : Math.min(d.count, 4)}
                  title={d.future ? undefined : `${dayLabel.format(new Date(`${d.day}T12:00:00`))}: ${d.count ? `${d.count} ${d.count === 1 ? 'thing' : 'things'}` : 'nothing'}`}
                />
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="profile-stats">
        <Stat icon={<BookOpen size={15} />} value={s.words} label="words" />
        <Stat icon={<Sparkles size={15} />} value={s.thisWeek} label="this week" />
        <Stat icon={<Award size={15} />} value={s.inUse} label="in use" />
        <Stat icon={<Repeat size={15} />} value={s.metAgain} label="met again" />
      </section>

      <section>
        <h3 className="label-sm profile-label">
          Achievements · {earned}/{badges.length}
        </h3>
        <ul className="badges">
          {badges.map((b, i) => {
            const done = b.value >= b.goal
            return (
              <li key={b.id} className="badge-sticker" data-done={done} style={{ rotate: `${((i * 37) % 7) - 3}deg` }} title={b.description}>
                <strong>{b.title}</strong>
                <span>{b.description}</span>
                {!done && b.goal > 1 && (
                  <span className="badge-progress" aria-label={`${b.value} of ${b.goal}`}>
                    <span style={{ width: `${(b.value / b.goal) * 100}%` }} />
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      <footer className="profile-actions">
        <button
          className="btn btn-quiet"
          onClick={() => {
            onClose()
            navigate('/settings/account')
          }}
        >
          <Settings size={15} /> Account settings
        </button>
        {user && (
          <button
            className="btn btn-quiet"
            onClick={() => {
              signOut()
              onClose()
            }}
          >
            Sign out
          </button>
        )}
      </footer>
    </>
  )
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="profile-stat">
      <span className="profile-stat-value">{value}</span>
      <span className="faint small">
        {icon} {label}
      </span>
    </div>
  )
}
