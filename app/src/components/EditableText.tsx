import { useEffect, useState } from 'react'

interface Props {
  value: string | undefined
  onSave: (value: string | undefined) => void
  placeholder: string
  label: string
  multiline?: boolean
  lang?: string
  className?: string
}

/** Written straight onto the page like a notebook line; saved when focus leaves. */
export function EditableText({ value, onSave, placeholder, label, multiline, lang, className = '' }: Props) {
  const [draft, setDraft] = useState(value ?? '')
  useEffect(() => setDraft(value ?? ''), [value])

  const commit = () => {
    const next = draft.trim() || undefined
    if (next !== (value ?? undefined)) onSave(next)
  }

  const common = {
    className: `inline-edit ${className}`,
    value: draft,
    placeholder,
    'aria-label': label,
    lang,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
    onBlur: commit,
  }

  return multiline ? (
    <textarea {...common} rows={2} />
  ) : (
    <input {...common} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
  )
}
