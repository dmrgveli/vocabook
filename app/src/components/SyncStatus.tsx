import { AlertTriangle, Check, CloudOff, HardDrive, LogIn, RefreshCw, Settings } from 'lucide-react'
import { Avatar } from './ui'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useAppState } from '../app/state'
import { renderSignInButton, useAuth, type AuthState } from '../sync/auth'
import { useSyncStatus, type SyncStatus } from '../sync/engine'
import { useResolvedTheme } from '../theme'

export function timeAgo(ms: number): string {
  const s = Math.round((Date.now() - ms) / 1000)
  if (s < 45) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Re-render every half minute so "x min ago" stays true. */
function useTick() {
  const [, set] = useState(0)
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])
}

function describe(auth: AuthState, sync: SyncStatus): { icon: ReactNode; text: string; tone?: 'ok' | 'warn' } {
  if (auth.status === 'unconfigured' || auth.status === 'signed-out' || auth.status === 'loading')
    return { icon: <HardDrive size={13} />, text: 'Saved on this device' }
  if (auth.status === 'expired') return { icon: <LogIn size={13} />, text: 'Signed out · sign in to sync', tone: 'warn' }
  switch (sync.state) {
    case 'syncing':
      return { icon: <RefreshCw size={13} className="spin" />, text: 'Syncing…' }
    case 'synced':
      return { icon: <Check size={13} />, text: `Synced ${timeAgo(sync.lastSynced)}`, tone: 'ok' }
    case 'offline':
      return { icon: <CloudOff size={13} />, text: 'Offline · will sync later' }
    case 'error':
      return { icon: <AlertTriangle size={13} />, text: 'Sync problem', tone: 'warn' }
    default:
      return { icon: <RefreshCw size={13} />, text: 'Connecting…' }
  }
}

/** The sync state as a short line of text with an icon. */
export function SyncStatusText() {
  const info = describe(useAuth(), useSyncStatus())
  useTick()
  return (
    <span className="sync-text" data-tone={info.tone}>
      {info.icon} {info.text}
    </span>
  )
}

/** Google's own sign-in button: one click opens Google's sign-in, no detour through Settings. */
export function GoogleSignInButton({ width }: { width?: number }) {
  const el = useRef<HTMLDivElement>(null)
  const theme = useResolvedTheme()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!el.current) return
    el.current.innerHTML = '' // re-draw when the theme changes
    renderSignInButton(el.current, width).catch(() => setFailed(true))
  }, [theme, width])
  if (failed) return <p className="faint small">Google sign-in can't be reached right now.</p>
  return <div ref={el} className="google-button" />
}

/**
 * Bottom of the sidebar: who you are (or a sign-in button), the sync state and the
 * way into Settings.
 */
export function SidebarAccount({ onNavigate }: { onNavigate?: () => void }) {
  const auth = useAuth()
  const { setProfileOpen } = useAppState()
  const signedIn = auth.status === 'signed-in' || auth.status === 'expired'

  const settings = (
    <NavLink to="/settings" className="icon-btn settings-link" aria-label="Settings" title="Settings" onClick={onNavigate}>
      <Settings size={18} />
    </NavLink>
  )

  return (
    <div className="sidebar-account">
      {signedIn ? (
        <div className="account-row">
          <button
            className="profile-btn"
            onClick={() => {
              onNavigate?.()
              setProfileOpen(true)
            }}
            aria-label="Open your profile"
          >
            <Avatar user={auth.user} />
            <span className="profile-btn-text">
              <strong>{auth.user.name?.split(' ')[0] ?? auth.user.email ?? 'You'}</strong>
              <SyncStatusText />
            </span>
          </button>
          {settings}
        </div>
      ) : (
        <div className="account-row">
          <SyncStatusText />
          {settings}
        </div>
      )}
      {(auth.status === 'signed-out' || auth.status === 'expired') && <GoogleSignInButton width={216} />}
    </div>
  )
}
