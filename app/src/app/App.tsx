import { AnimatePresence, motion } from 'motion/react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { BackupPrompt } from '../components/BackupPrompt'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { LookUpDialog } from '../components/LookUpDialog'
import { MobileBar, MobileTabBar } from '../components/MobileBar'
import { ProfileDialog } from '../components/ProfileDialog'
import { QuickAddDialog } from '../components/QuickAddDialog'
import { ReminderPopup } from '../components/ReminderPopup'
import { Sidebar } from '../components/Sidebar'
import { Toaster } from '../components/Toaster'
import { UpdateBanner } from '../components/UpdateBanner'
import { WordPeek } from '../components/WordPeek'
import { setWordFrequencies } from '../data/wordFrequency'
import { useEntries } from '../hooks'
import { Notebook } from '../screens/Notebook'

import { useAppState } from './state'
import { keepNotebookStored } from '../storage'

// The notebook is the first screen; everything else loads when it is first opened.
const named = <K extends string>(load: () => Promise<Record<K, React.ComponentType<any>>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })))
const WordPage = named(() => import('../screens/WordPage'), 'WordPage')
const LookUpPage = named(() => import('../screens/LookUpPage'), 'LookUpPage')
const Flashback = named(() => import('../screens/Flashback'), 'Flashback')
const Settings = named(() => import('../screens/Settings'), 'Settings')
const WordPool = named(() => import('../screens/WordPool'), 'WordPool')

export function App() {
  const entries = useEntries()
  const location = useLocation()
  const { openQuickAdd } = useAppState()
  const [menuOpen, setMenuOpen] = useState(false)
  const hasWords = Boolean(entries?.length)

  // Once there is something to lose, ask the browser to keep it (silently; see storage.ts).
  useEffect(() => {
    if (hasWords) void keepNotebookStored()
  }, [hasWords])

  // Corpus frequencies already stored in words feed the level badges' tips.
  useEffect(() => {
    if (entries) setWordFrequencies(entries.map((e) => [e.word, e.enrichment?.corpus?.perMillion]))
  }, [entries])

  // The mobile menu closes on navigation and on Escape.
  useEffect(() => {
    setMenuOpen(false)
    // On small screens the page itself scrolls; start each page at the top. (No-op on desktop.)
    window.scrollTo(0, 0)
  }, [location.pathname])
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  // ⌘K / Ctrl+K opens quick add from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        openQuickAdd()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openQuickAdd])

  return (
    <>
      <div className="app">
        <MobileBar menuOpen={menuOpen} onMenu={() => setMenuOpen((o) => !o)} />
        <Sidebar entries={entries ?? []} open={menuOpen} onNavigate={() => setMenuOpen(false)} />
        <div className="menu-scrim" data-open={menuOpen} onClick={() => setMenuOpen(false)} aria-hidden />
        <main className="main">
          {entries && (
            <AnimatePresence mode="wait">
              <motion.div
                // Settings sections and Word rings words switch inside the page, without a page transition.
                key={location.pathname.startsWith('/settings') ? '/settings' : location.pathname.startsWith('/rings') ? '/rings' : location.pathname}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              >
<ErrorBoundary
                  resetKey={location.pathname}
                  fallback={<p className="page muted">Something went wrong on this page. Try going back to your notebook.</p>}
                >
                  <Suspense fallback={<div className="page page-loading" aria-busy="true" />}>
                  <Routes location={location}>
                    <Route path="/word/:param" element={<WordPage />} />
                    <Route path="/look/:param" element={<LookUpPage />} />
                    <Route path="/flashback" element={<Flashback entries={entries} />} />
                    <Route path="/rings/:param?" element={<WordPool />} />
                    <Route path="/pool/:param?" element={<PoolRedirect />} />
                    <Route path="/settings/:section?" element={<Settings entries={entries} />} />
                    <Route path="*" element={<Notebook entries={entries} />} />
                  </Routes>
                  </Suspense>
                </ErrorBoundary>
              </motion.div>
            </AnimatePresence>
          )}
        </main>
      </div>
      <MobileTabBar />
      <QuickAddDialog />
      <LookUpDialog />
      <ReminderPopup entries={entries} />
      <BackupPrompt entries={entries} />
      <WordPeek />
      <ProfileDialog entries={entries ?? []} />
      <Toaster />
      <UpdateBanner />
    </>
  )
}

/** The Word rings used to be called the word pool: #/pool/thrive → #/rings/thrive. */
function PoolRedirect() {
  const { param } = useParams()
  return <Navigate to={param ? `/rings/${param}` : '/rings'} replace />
}
