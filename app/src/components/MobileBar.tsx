import { BookOpen, History, Menu, Plus, Search, Settings, UserRound, X } from 'lucide-react'
import { Avatar } from './ui'
import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
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

/** Top bar on small screens: menu (filters, as a drawer), the app name and Settings. Hidden on desktop by CSS. */
export function MobileBar({ menuOpen, onMenu }: { menuOpen: boolean; onMenu: () => void }) {
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
        <Link to="/settings" className="icon-btn mobile-menu-btn" aria-label="Settings">
          <Settings size={21} />
        </Link>
      </span>
    </header>
  )
}

/**
 * Bottom navigation on small screens, within thumb reach: Notebook, Search, a larger Add
 * in the middle, Flashback and Profile. Hidden on desktop by CSS.
 */
export function MobileTabBar() {
  const auth = useAuth()
  const { pathname } = useLocation()
  const { openQuickAdd, quickAddOpen, lookUpOpen, setLookUpOpen, profileOpen, setProfileOpen } = useAppState()
  const user = auth.status === 'signed-in' || auth.status === 'expired' ? auth.user : undefined
  const overlay = quickAddOpen || lookUpOpen || profileOpen
  const notebookActive = !overlay && (pathname === '/' || pathname.startsWith('/word/'))

  return (
    <nav className="tab-bar" aria-label="Main">
      <NavLink to="/" className="tab" aria-current={notebookActive ? 'page' : undefined} data-active={notebookActive}>
        <BookOpen size={21} />
        <span>Notebook</span>
      </NavLink>
      <button className="tab" data-active={lookUpOpen || (!overlay && pathname.startsWith('/look/'))} onClick={() => setLookUpOpen(true)}>
        <Search size={21} />
        <span>Search</span>
      </button>
      <button className="tab tab-add" onClick={() => openQuickAdd()} aria-label="Add a word">
        <span className="tab-add-circle">
          <Plus size={28} strokeWidth={2.6} />
        </span>
        <span>Add</span>
      </button>
      <NavLink to="/flashback" className="tab" data-active={!overlay && pathname === '/flashback'}>
        <History size={21} />
        <span>Flashback</span>
      </NavLink>
      <button className="tab" data-active={profileOpen} onClick={() => setProfileOpen(true)} aria-label="Your profile">
        {user ? <Avatar user={user} className="tab-avatar" /> : <UserRound size={21} />}
        <span>Profile</span>
      </button>
    </nav>
  )
}
