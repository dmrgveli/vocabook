interface Props {
  value: string
  onChange: (value: string) => void
  recent: string[]
  autoFocus?: boolean
}

/** Source field plus one-click recent sources. */
export function SourceInput({ value, onChange, recent, autoFocus }: Props) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      <label className="label">
        Where did you come across it?
        <input
          className="field"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="A show, a book, a podcast, a conversation…"
          autoFocus={autoFocus}
        />
      </label>
      {recent.length > 0 && (
        <div className="row" style={{ gap: 6 }}>
          {recent.map((s) => (
            <button key={s} type="button" className="chip" aria-pressed={value === s} onClick={() => onChange(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
