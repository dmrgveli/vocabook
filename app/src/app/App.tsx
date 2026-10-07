import { AnimatePresence, motion } from 'motion/react'
import { useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { QuickAddDialog } from '../components/QuickAddDialog'
import { ReminderPopup } from '../components/ReminderPopup'
import { Sidebar } from '../components/Sidebar'
import { Toaster } from '../components/Toaster'
import { WordPeek } from '../components/WordPeek'
import { useEntries } from '../hooks'
import { Notebook } from '../screens/Notebook'
import { Settings } from '../screens/Settings'
import { WordPage } from '../screens/WordPage'
import { useAppState } from './state'

export function App() {
  const entries = useEntries()
  const location = useLocation()
  const { openQuickAdd } = useAppState()

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
        <Sidebar entries={entries ?? []} />
        <main className="main">
          {entries && (
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              >
<ErrorBoundary
                  resetKey={location.pathname}
                  fallback={<p className="page muted">Something went wrong on this page. Try going back to your notebook.</p>}
                >
                <Routes location={location}>
                  <Route path="/word/:param" element={<WordPage />} />
                  <Route path="/settings" element={<Settings entries={entries} />} />
                  <Route path="*" element={<Notebook entries={entries} />} />
                </Routes>
                </ErrorBoundary>
              </motion.div>
            </AnimatePresence>
          )}
        </main>
      </div>
      <QuickAddDialog />
      <ReminderPopup entries={entries} />
      <WordPeek />
      <Toaster />
    </>
  )
}
