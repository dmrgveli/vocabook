import { useEffect, useState, useSyncExternalStore } from 'react'
import { suggest, type Suggestion } from './api/datamuse'
import { findByWord, getEntry, listEntries, subscribe, type ChangeOrigin } from './data/db'
import { parseWordParam } from './data/paths'
import type { Entry } from './data/model'

// All notebook entries, read once and shared by every component that needs them. Each
// change used to make every subscriber read the whole notebook again; now one read serves
// everyone, edits are picked up on the next tick, and the background dictionary fills
// (many small writes in a row) are batched into one read.
let entriesSnapshot: Entry[] | undefined
let entriesStarted = false
let readSeq = 0
let readTimer: ReturnType<typeof setTimeout> | undefined
const entryListeners = new Set<() => void>()

function readEntries() {
  const seq = ++readSeq
  listEntries().then((e) => {
    if (seq !== readSeq) return // a newer read is on its way
    entriesSnapshot = e
    entryListeners.forEach((l) => l())
  })
}

function scheduleRead(origin: ChangeOrigin) {
  clearTimeout(readTimer)
  readTimer = setTimeout(readEntries, origin === 'cache' ? 350 : 0)
}

function subscribeEntries(listener: () => void) {
  if (!entriesStarted) {
    entriesStarted = true
    subscribe(scheduleRead)
    readEntries()
  }
  entryListeners.add(listener)
  return () => entryListeners.delete(listener)
}

/** All notebook entries; updates when IndexedDB changes. undefined = loading. */
export function useEntries(): Entry[] | undefined {
  return useSyncExternalStore(subscribeEntries, () => entriesSnapshot)
}

/** The entry a /word/:param URL points to (by word, or by id for old links). */
export function useEntryAt(param: string | undefined): Entry | null | undefined {
  const [entry, setEntry] = useState<Entry | null>()
  useEffect(() => {
    if (!param) return setEntry(null)
    const target = parseWordParam(param)
    let active = true
    const load = () =>
      ('id' in target ? getEntry(target.id) : findByWord(target.word)).then((e) => active && setEntry(e ?? null))
    setEntry(undefined)
    load()
    const unsubscribe = subscribe(load)
    return () => {
      active = false
      unsubscribe()
    }
  }, [param])
  return entry
}

export type SuggestionState = { status: 'idle' | 'loading' | 'error'; items: Suggestion[] } | { status: 'ready'; items: Suggestion[] }

/** Debounced Datamuse autocomplete. */
export function useSuggestions(input: string, enabled: boolean): SuggestionState {
  const [state, setState] = useState<SuggestionState>({ status: 'idle', items: [] })
  const q = input.trim().toLowerCase()

  useEffect(() => {
    if (!enabled || !q) return setState({ status: 'idle', items: [] })
    const controller = new AbortController()
    setState((s) => ({ status: 'loading', items: s.items }))
    const timer = setTimeout(() => {
      suggest(q, controller.signal)
        .then((items) => setState({ status: 'ready', items }))
        .catch(() => !controller.signal.aborted && setState({ status: 'error', items: [] }))
    }, 140)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [q, enabled])

  return state
}
