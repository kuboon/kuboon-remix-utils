import { defineSite } from '../../../../site.ts'
import * as notes from './content/mod.ts'

export default defineSite({
  title: 'Fixture',
  description: 'A site the tests build.',
  // Every page must be reachable: the crawl generates what is linked, nothing else.
  nav: [
    { href: '/', label: 'Home' },
    { href: '/about', label: 'About' },
    { href: '/notes', label: 'Notes' },
  ],
  content: { '/notes': notes },
})
