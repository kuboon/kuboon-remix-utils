import { defineSite } from '../../../../site.ts'
import { markdown } from './transforms/markdown.tsx'

export default defineSite(({ base, islandUrls }) => ({
  transforms: [markdown({ base, islandUrls })],
}))
