import { UserPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAppState } from '../app/state'
import { activeProfile, listGuestEntries, subscribe } from '../data/db'
import { addGuestWords } from '../sync/engine'
import { useAuth } from '../sync/auth'

// After signing in, words written while signed out stay in the guest notebook (data/db.ts).
// This offers, once per account, to add them to the account. Either answer is remembered.

const answerKey = (sub: string) => `guest-words:${sub}`

function readAnswer(sub: string): string | null {
  try {
    return localStorage.getItem(answerKey(sub))
  } catch {
    return null
  }
}

function remember(sub: string, answer: 'added' | 'kept') {
  try {
    localStorage.setItem(answerKey(sub), answer)
  } catch {
    // storage unavailable: the offer may come back next visit
  }
}

export function GuestWordsOffer() {
  const auth = useAuth()
  const { toast } = useAppState()
  const sub = auth.status === 'signed-in' || auth.status === 'expired' ? auth.user.sub : undefined
  const [count, setCount] = useState(0)
  const [busy, setBusy] = useState(false)
  const [answered, setAnswered] = useState(false)

  useEffect(() => {
    if (!sub || readAnswer(sub)) return setCount(0)
    let active = true
    const load = () => activeProfile() === sub && listGuestEntries().then((g) => active && setCount(g.length))
    void load()
    const unsubscribe = subscribe(() => void load())
    return () => {
      active = false
      unsubscribe()
    }
  }, [sub])

  if (!sub || count === 0 || answered) return null

  return (
    <div className="notice guest-words" role="status">
      <UserPlus size={18} />
      <span>
        You have <b>{count}</b> {count === 1 ? 'word' : 'words'} from before you signed in. Add {count === 1 ? 'it' : 'them'} to this account?
      </span>
      <span className="row guest-words-actions">
        <button
          className="btn btn-marker small"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            const added = await addGuestWords().finally(() => setBusy(false))
            remember(sub, 'added')
            setAnswered(true)
            toast(`${added} ${added === 1 ? 'word' : 'words'} added to your account`)
          }}
        >
          Add to account
        </button>
        <button
          className="btn btn-quiet small"
          onClick={() => {
            remember(sub, 'kept')
            setAnswered(true)
          }}
        >
          Keep separate
        </button>
      </span>
    </div>
  )
}
