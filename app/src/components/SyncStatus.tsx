import { AlertTriangle, Check, CloudOff, HardDrive, LogIn, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../sync/auth'
import { useSyncStatus } from '../sync/engine'

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

/** One-line sync state for the sidebar; links to Settings where the controls are. */
export function SyncStatusLine() {
  const auth = useAuth()
  const sync = useSyncStatus()
  useTick()

  let icon = <HardDrive size={14} />
  let text = 'Saved on this device'
  let tone = ''

  if (auth.status === 'signed-out') {
    icon = <LogIn size={14} />
    text = 'Sign in to sync'
  } else if (auth.status === 'expired') {
    icon = <LogIn size={14} />
    text = 'Sign in again to sync'
    tone = 'warn'
  } else if (auth.status === 'signed-in') {
    switch (sync.state) {
      case 'syncing':
        icon = <RefreshCw size={14} className="spin" />
        text = 'Syncing…'
        break
      case 'synced':
        icon = <Check size={14} />
        text = `Synced ${timeAgo(sync.lastSynced)}`
        tone = 'ok'
        break
      case 'offline':
        icon = <CloudOff size={14} />
        text = 'Offline · will sync later'
        break
      case 'error':
        icon = <AlertTriangle size={14} />
        text = 'Sync problem'
        tone = 'warn'
        break
      case 'account-changed':
        icon = <AlertTriangle size={14} />
        text = 'Sync paused · action needed'
        tone = 'warn'
        break
      default:
        icon = <RefreshCw size={14} />
        text = 'Connecting…'
    }
  }

  const title = auth.status === 'signed-in' ? `Signed in as ${auth.user.email ?? auth.user.name}` : undefined
  if (auth.status === 'unconfigured')
    return (
      <div className="sync-status" title="Sign-in and sync are not set up for this copy of the app.">
        {icon} {text}
      </div>
    )
  return (
    <Link to="/settings" className="sync-status sync-link" data-tone={tone} title={title}>
      {icon} {text}
    </Link>
  )
}
