// Asks the browser to keep this site's data (the notebook in IndexedDB) instead of
// clearing it under storage pressure or after a long break. Chrome, Edge and Safari decide
// silently from how the site is used, without asking; Firefox shows a permission prompt,
// which would only confuse here, so it is skipped there.

let asked = false

export async function keepNotebookStored(): Promise<void> {
  if (asked) return
  asked = true
  try {
    if (/Firefox\//.test(navigator.userAgent)) return
    const storage = navigator.storage
    if (!storage?.persist || !storage.persisted) return
    if (await storage.persisted()) return
    await storage.persist()
  } catch {
    // not supported or refused: the notebook still works, it just may be cleared under pressure
  }
}
