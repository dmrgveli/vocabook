import { Menu, Plus, Search, Settings, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppState } from '../app/state'
import { useAuth } from '../sync/auth'

/** Matches the CSS breakpoint in styles/mobile.css. */
export const MOBILE_QUERY = '(max-width: 899px)'

export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && matchMedia(MOBILE_QUERY).matches)
  useEffect(() => {
    const mq = matchMedia(MOBILE_QUERY)
    const update = () => setMobile(mq.matches)
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return mobile
}

/** Top bar on small screens: menu (the sidebar as a drawer) and the app name. Hidden on desktop by CSS. */
export function MobileBar({ menuOpen, onMenu }: { menuOpen: boolean; onMenu: () => void }) {
  const auth = useAuth()
  const { setProfileOpen, setLookUpOpen } = useAppState()
  return (
    <header className="mobile-bar">
      <button className="icon-btn mobile-menu-btn" onClick={onMenu} aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} aria-controls="sidebar">
        {menuOpen ? <X size={22} /> : <Menu size={22} />}
      </button>
      <Link to="/" className="brand mobile-brand">
        <img className="brand-logo" src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={30} height={30} />
        Vocabook
      </Link>
      <span className="mobile-bar-end">
        <button className="icon-btn mobile-menu-btn" onClick={() => setLookUpOpen(true)} aria-label="Look up a word">
          <Search size={21} />
        </button>
        {(auth.status === 'signed-in' || auth.status === 'expired') && (
          <button className="profile-chip" onClick={() => setProfileOpen(true)} aria-label="Open your profile">
            {auth.user.picture ? <img className="avatar" src={auth.user.picture} alt="" referrerPolicy="no-referrer" /> : <span className="avatar" />}
          </button>
        )}
        <Link to="/settings" className="icon-btn mobile-menu-btn" aria-label="Settings">
          <Settings size={21} />
        </Link>
      </span>
    </header>
  )
}

/** Thumb-reachable "add word" button on small screens. Hidden on desktop by CSS. */
export function MobileAddButton() {
  const { openQuickAdd } = useAppState()
  return (
    <button className="btn btn-marker mobile-add" onClick={() => openQuickAdd()} aria-label="Add word">
      <Plus size={22} strokeWidth={2.6} />
    </button>
  )
}
