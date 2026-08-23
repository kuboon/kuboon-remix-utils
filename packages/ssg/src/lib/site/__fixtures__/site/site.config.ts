import { defineSite } from '../../../../site.ts'
import * as notes from './content/mod.ts'

export default defineSite({
  title: 'Fixture',
  description: 'A site the tests build.',
  nav: [{ href: '/', label: 'Home' }, { href: '/notes', label: 'Notes' }],
  content: { '/notes': notes },
})
