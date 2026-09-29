/** Remove metacaracteres que quebram o filtro `or` do PostgREST. */
export function sanitizeSearchTerm(value: string): string {
  return value.replace(/[%_*,()\\]/g, ' ').replace(/\s+/g, ' ').trim()
}
