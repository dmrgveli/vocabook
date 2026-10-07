import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { EMPTY_FILTERS, type Filters } from '../data/notebook'

// App-wide UI state: notebook filters (set from the sidebar, used by the notebook),
// the quick-add dialog and toasts.

interface Toast {
  id: number
  message: string
  action?: { label: string; run: () => void }
}

interface AppState {
  filters: Filters
  setFilters: (update: (f: Filters) => Filters) => void
  quickAddOpen: boolean
  /** A word to start with, e.g. one picked from a definition. */
  quickAddPrefill?: QuickAddPrefill
  openQuickAdd: (prefill?: QuickAddPrefill) => void
  closeQuickAdd: () => void
  toasts: Toast[]
  toast: (message: string, action?: Toast['action']) => void
  dismissToast: (id: number) => void
}

export interface QuickAddPrefill {
  word: string
  frequency?: number
}

const Ctx = createContext<AppState | null>(null)

let toastId = 0

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [filters, setFiltersState] = useState<Filters>(EMPTY_FILTERS)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [quickAddPrefill, setQuickAddPrefill] = useState<QuickAddPrefill>()
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const toast = useCallback(
    (message: string, action?: Toast['action']) => {
      const id = ++toastId
      setToasts((t) => [...t.slice(-2), { id, message, action }])
      setTimeout(() => dismissToast(id), 4500)
    },
    [dismissToast],
  )

  const openQuickAdd = useCallback((prefill?: QuickAddPrefill) => {
    setQuickAddPrefill(prefill)
    setQuickAddOpen(true)
  }, [])
  const closeQuickAdd = useCallback(() => setQuickAddOpen(false), [])

  const value = useMemo<AppState>(
    () => ({
      filters,
      setFilters: (update) => setFiltersState(update),
      quickAddOpen,
      quickAddPrefill,
      openQuickAdd,
      closeQuickAdd,
      toasts,
      toast,
      dismissToast,
    }),
    [filters, quickAddOpen, quickAddPrefill, openQuickAdd, closeQuickAdd, toasts, toast, dismissToast],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAppState(): AppState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAppState must be used inside AppStateProvider')
  return ctx
}
