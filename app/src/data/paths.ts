import { normalizeWord } from './model'

// Word pages are addressed by the word itself: #/word/thrive, #/word/look+for.
// A word appears at most once in the notebook (adding it again records an encounter,
// and sync folds duplicates), so the word is a stable address. Spaces become "+",
// which never occurs inside a word. Old links with an entry id keep working.

const ENTRY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const encodeWord = (word: string) => encodeURIComponent(word).replace(/%20/g, '+')

export function wordPath(word: string): string {
  return `/word/${encodeWord(word)}`
}

/** A word looked up without adding it: #/look/thrive. Same encoding as word pages. */
export function lookPath(word: string): string {
  return `/look/${encodeWord(word)}`
}

/** What a /word/:param URL points to. React Router has already percent-decoded the param. */
export function parseWordParam(param: string): { id: string } | { word: string } {
  if (ENTRY_ID.test(param)) return { id: param }
  return { word: normalizeWord(param.replace(/\+/g, ' ')) }
}

/** Word rings, optionally around a word: #/rings, #/rings/thrive. (Old #/pool links redirect.) */
export function ringsPath(word?: string): string {
  return word ? `/rings/${encodeWord(word)}` : '/rings'
}
