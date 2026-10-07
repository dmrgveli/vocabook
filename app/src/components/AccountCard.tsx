import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useAppState } from '../app/state'
import { signOut, useAuth } from '../sync/auth'
import { deleteCloudCopy, resolveAccountChange, syncNow, useSyncStatus } from '../sync/engine'
import { GoogleSignInButton, timeAgo } from './SyncStatus'

/** Settings card: Google sign-in, sync state and account actions. */
export function AccountCard() {
  const auth = useAuth()
  const sync = useSyncStatus()
  const { toast } = useAppState()

  if (auth.status === 'unconfigured')
    return <p className="muted">Sign-in and sync are not set up for this copy of the app yet. Your notebook is saved in this browser.</p>

  if (auth.status === 'signed-out' || auth.status === 'loading')
    return (
      <>
        <p className="muted">Sign in with Google to keep your notebook in sync across your computers. Your words stay saved in this browser too.</p>
        <GoogleSignInButton />
      </>
    )

  const { user } = auth

  return (
    <>
      <div className="account">
        {user.picture ? <img className="avatar" src={user.picture} alt="" referrerPolicy="no-referrer" /> : <span className="avatar" />}
        <div>
          <strong>{user.name ?? user.email}</strong>
          {user.name && user.email && <div className="faint small">{user.email}</div>}
        </div>
      </div>

      {auth.status === 'expired' ? (
        <>
          <p className="muted">Your Google session ended. Sign in again to keep syncing.</p>
          <GoogleSignInButton />
        </>
      ) : sync.state === 'account-changed' ? (
        <AccountChoice localWords={sync.localWords} remoteWords={sync.remoteWords} email={user.email} />
      ) : (
        <>
          <p className="muted small">
            {sync.state === 'syncing' && 'Syncing…'}
            {sync.state === 'synced' && `Synced ${timeAgo(sync.lastSynced)}.`}
            {sync.state === 'offline' && 'Offline. Changes will sync when you are back online.'}
            {sync.state === 'error' && sync.message}
            {sync.state === 'off' && 'Connecting…'}
          </p>
          <div className="row">
            <button className="btn" onClick={() => void syncNow()} disabled={sync.state === 'syncing'}>
              <RefreshCw size={14} className={sync.state === 'syncing' ? 'spin' : ''} /> Sync now
            </button>
            <button className="btn btn-quiet" onClick={signOut}>
              Sign out
            </button>
          </div>
          <button
            className="btn btn-quiet btn-danger small"
            onClick={async () => {
              if (!confirm('Delete the cloud copy of your notebook? The words on this computer stay.')) return
              const ok = await deleteCloudCopy().catch(() => false)
              if (ok) signOut()
              toast(ok ? 'Cloud copy deleted' : 'Could not delete the cloud copy')
            }}
          >
            Delete cloud copy
          </button>
        </>
      )}
    </>
  )
}


function AccountChoice({ localWords, remoteWords, email }: { localWords: number; remoteWords: number; email?: string }) {
  const [busy, setBusy] = useState(false)
  const run = async (choice: 'merge' | 'replace') => {
    setBusy(true)
    await resolveAccountChange(choice).finally(() => setBusy(false))
  }
  return (
    <div className="notice stack" style={{ gap: 10 }}>
      <span>
        This computer was last synced with a different Google account. It has <b>{localWords}</b> words;{' '}
        {email ?? 'this account'} has <b>{remoteWords}</b> in the cloud. Sync is paused until you choose.
      </span>
      <div className="row">
        <button className="btn" disabled={busy} onClick={() => run('merge')}>
          Add this computer's words
        </button>
        <button
          className="btn"
          disabled={busy}
          onClick={() => confirm(`Remove the ${localWords} words on this computer and load ${email ?? 'this account'}'s notebook?`) && run('replace')}
        >
          Use only this account's words
        </button>
      </div>
    </div>
  )
}
