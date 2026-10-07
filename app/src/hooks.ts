import { useEffect, useState } from 'react'
import { suggest, type Suggestion } from './api/datamuse'
import { findByWord, getEntry, listEntries, subscribe } from './data/db'
import { parseWordParam } from './data/paths'
import type { Entry } from './data/model'

/** All notebook entries; reloads when IndexedDB changes. undefined = loading. */
export function useEntries(): Entry[] | undefined {
  const [entries, setEntries] = useState<Entry[]>()
  useEffect(() => {
    let active = true
    const load = () => listEntries().then((e) => active && setEntries(e))
    load()
    const unsubscribe = subscribe(load)
    return () => {
      active = false
      unsubscribe()
    }
  }, [])
  return entries
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
