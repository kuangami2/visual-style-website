export type Companion = 'tang' | 'he' | 'xi'
export type DuskActivity = 'wind' | 'wreath' | 'story'

export type JourneySnapshot = {
  version: 1
  chapterIndex: number
  furthestChapter: number
  petals: number[]
  woven: number[]
  wovenFlowers: Record<number, number>
  plumChoice: Companion | null
  companion: Companion | null
  duskFriends: Companion[]
  duskActivity: DuskActivity | null
}

export const JOURNEY_STORAGE_KEY = 'wan-late-home:journey:v1'
const companionIds: Companion[] = ['tang', 'he', 'xi']
const activityIds: DuskActivity[] = ['wind', 'wreath', 'story']

export function validCompanion(value: unknown): value is Companion {
  return typeof value === 'string' && companionIds.includes(value as Companion)
}

export function validActivity(value: unknown): value is DuskActivity {
  return typeof value === 'string' && activityIds.includes(value as DuskActivity)
}

export function sanitizeJourneySnapshot(input: unknown, flowerCount: number, chapterCount: number): JourneySnapshot | null {
  if (!input || typeof input !== 'object') return null
  const value = input as Partial<JourneySnapshot>
  if (value.version !== 1) return null
  const uniqueNumbers = (items: unknown, max: number) => [...new Set(Array.isArray(items) ? items.filter((item): item is number => typeof item === 'number' && Number.isInteger(item) && item >= 0 && item < max) : [])]
  const petals = uniqueNumbers(value.petals, flowerCount).slice(0, 3)
  const woven = uniqueNumbers(value.woven, 4).slice(0, 4)
  const wovenFlowers: Record<number, number> = {}
  if (value.wovenFlowers && typeof value.wovenFlowers === 'object') {
    for (const [slot, flower] of Object.entries(value.wovenFlowers as Record<string, unknown>)) {
      const slotIndex = Number(slot)
      if (Number.isInteger(slotIndex) && slotIndex >= 0 && slotIndex < 4 && typeof flower === 'number' && Number.isInteger(flower) && flower >= 0 && flower < flowerCount) wovenFlowers[slotIndex] = flower
    }
  }
  const chapterIndex = typeof value.chapterIndex === 'number' && Number.isInteger(value.chapterIndex) ? Math.min(Math.max(value.chapterIndex, 0), chapterCount - 1) : 0
  const furthestChapter = typeof value.furthestChapter === 'number' && Number.isInteger(value.furthestChapter) ? Math.min(Math.max(value.furthestChapter, chapterIndex), chapterCount - 1) : chapterIndex
  const duskFriends = [...new Set(Array.isArray(value.duskFriends) ? value.duskFriends.filter(validCompanion) : [])]
  return {
    version: 1,
    chapterIndex,
    furthestChapter,
    petals,
    woven: woven.filter((slot) => Object.prototype.hasOwnProperty.call(wovenFlowers, slot)),
    wovenFlowers,
    plumChoice: validCompanion(value.plumChoice) ? value.plumChoice : null,
    companion: validCompanion(value.companion) ? value.companion : null,
    duskFriends,
    duskActivity: validActivity(value.duskActivity) ? value.duskActivity : null,
  }
}

export function readJourneySnapshot(flowerCount: number, chapterCount: number): JourneySnapshot | null {
  try {
    const raw = window.sessionStorage.getItem(JOURNEY_STORAGE_KEY)
    return raw ? sanitizeJourneySnapshot(JSON.parse(raw), flowerCount, chapterCount) : null
  } catch {
    return null
  }
}

export function writeJourneySnapshot(snapshot: JourneySnapshot) {
  try { window.sessionStorage.setItem(JOURNEY_STORAGE_KEY, JSON.stringify(snapshot)) } catch { /* Storage can be disabled by the browser. */ }
}

export function clearJourneySnapshot() {
  try { window.sessionStorage.removeItem(JOURNEY_STORAGE_KEY) } catch { /* Storage can be disabled by the browser. */ }
}

export function parseWovenParam(value: string | null, flowerCount: number): { woven: number[]; wovenFlowers: Record<number, number> } {
  const wovenFlowers: Record<number, number> = {}
  if (!value) return { woven: [], wovenFlowers }
  for (const pair of value.split(',')) {
    const [slotValue, flowerValue] = pair.split('-')
    const slot = Number(slotValue)
    const flower = Number(flowerValue)
    if (Number.isInteger(slot) && slot >= 0 && slot < 4 && Number.isInteger(flower) && flower >= 0 && flower < flowerCount) wovenFlowers[slot] = flower
  }
  return { woven: Object.keys(wovenFlowers).map(Number).sort((a, b) => a - b), wovenFlowers }
}

export function serializeWoven(wovenFlowers: Record<number, number>, flowerCount: number) {
  return Object.entries(wovenFlowers).filter(([slot, flower]) => Number(slot) >= 0 && Number(slot) < 4 && Number(flower) >= 0 && Number(flower) < flowerCount).sort(([a], [b]) => Number(a) - Number(b)).map(([slot, flower]) => `${slot}-${flower}`).join(',')
}
