import type { ContentEntry } from '../../../config.ts'

const ENTRIES: ContentEntry[] = [
  {
    slug: 'first',
    title: 'First note',
    date: '2026-01-01',
    summary: 'One.',
    body: 'body of first',
  },
  {
    slug: 'second',
    title: 'Second note',
    date: '2026-02-01',
    summary: 'Two.',
    body: 'body of second',
  },
]

export function list(): ContentEntry[] {
  return ENTRIES
}

export function get(slug: string): ContentEntry | null {
  return ENTRIES.find((entry) => entry.slug === slug) ?? null
}
