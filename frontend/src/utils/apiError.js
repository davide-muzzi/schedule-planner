// Shared axios-error-to-message extraction, used by every Pinia store that
// talks to the backend, so a validation message from an ArgumentException
// (returned as a plain string body) or a ProblemDetails response reads the
// same way everywhere.
export function extractErrorMessage(err) {
  const data = err?.response?.data
  if (typeof data === 'string' && data.trim()) return data
  if (data?.message) return data.message
  if (data?.title) return data.title
  return err?.message || 'Something went wrong talking to the server.'
}
