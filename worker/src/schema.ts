// Shape check for the synced notebook. The Worker stores the document as-is, so it
// only accepts what the app actually writes: known fields, sane types, bounded sizes.

export const MAX_BODY_BYTES = 2 * 1024 * 1024

const MAX_ENTRIES = 20_000
const MAX_CHILDREN = 500
const MAX_TEXT = 5_000
const MAX_SHORT = 300

type Obj = Record<string, unknown>

export class SchemaError extends Error {}

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

function str(o: Obj, key: string, max: number, optional = false) {
  const v = o[key]
  if (v === undefined && optional) return
  if (typeof v !== 'string' || v.length > max) throw new SchemaError(`Invalid ${key}`)
}

function num(o: Obj, key: string) {
  const v = o[key]
  if (v !== undefined && (typeof v !== 'number' || !Number.isFinite(v))) throw new SchemaError(`Invalid ${key}`)
}

function arr(o: Obj, key: string, max: number): unknown[] {
  const v = o[key]
  if (!Array.isArray(v) || v.length > max) throw new SchemaError(`Invalid ${key}`)
  return v
}

function syncable(o: Obj) {
  str(o, 'id', 100)
  str(o, 'createdAt', 40)
  str(o, 'updatedAt', 40)
  str(o, 'deletedAt', 40, true)
}

function encounter(v: unknown) {
  if (!isObj(v)) throw new SchemaError('Invalid encounter')
  syncable(v)
  str(v, 'source', MAX_SHORT)
  str(v, 'sourceKind', 40, true)
  str(v, 'sentence', MAX_TEXT, true)
  str(v, 'date', 10)
}

function note(v: unknown) {
  if (!isObj(v)) throw new SchemaError('Invalid note')
  syncable(v)
  str(v, 'text', MAX_TEXT)
}

function entry(v: unknown) {
  if (!isObj(v)) throw new SchemaError('Invalid entry')
  syncable(v)
  str(v, 'word', MAX_SHORT)
  num(v, 'frequency')
  str(v, 'translation', MAX_TEXT, true)
  str(v, 'ownSentence', MAX_TEXT, true)
  str(v, 'lastViewedAt', 40, true)
  if (!['recognize', 'understand', 'use'].includes(v.mastery as string)) throw new SchemaError('Invalid mastery')
  arr(v, 'encounters', MAX_CHILDREN).forEach(encounter)
  arr(v, 'notes', MAX_CHILDREN).forEach(note)
  for (const t of arr(v, 'tags', 100)) if (typeof t !== 'string' || t.length > 60) throw new SchemaError('Invalid tag')
  // Dictionary data is a per-device cache and is never synced.
  if ('enrichment' in v) throw new SchemaError('Enrichment must not be synced')
}

export function validateNotebook(v: unknown): void {
  if (!isObj(v) || v.version !== 1) throw new SchemaError('Unsupported notebook version')
  arr(v, 'entries', MAX_ENTRIES).forEach(entry)
}
