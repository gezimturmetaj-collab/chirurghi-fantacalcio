import type { UserBackup, UserPlayerData } from '../data/schema'

export const STORAGE_KEYS_V2 = {
  settings: 'fantawarroom_v2_settings',
  auction: 'fantawarroom_v2_auction',
  userPlayers: 'fantawarroom_v2_userPlayers',
  watchlist: 'fantawarroom_v2_watchlist',
  backup: 'fantawarroom_v2_backup',
  sourceData: 'fantawarroom_v2_sourceData',
  manifest: 'fantawarroom_v2_manifest',
  changes: 'fantawarroom_v2_changes',
  migrations: 'fantawarroom_v2_migrations',
} as const

export const LEGACY_KEYS = {
  auction: 'fantacalcio-auction-state-v1',
  dataUpdate: 'fantacalcio-data-update-v1',
  dataMeta: 'fantacalcio-data-update-meta-v1',
} as const

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try { return JSON.parse(raw) as T } catch { return fallback }
}

export function migrateLegacyStorage() {
  const marker = safeParse<Record<string, boolean>>(localStorage.getItem(STORAGE_KEYS_V2.migrations), {})
  if (marker.legacyV1ToV2) return false

  const legacyAuctionRaw = localStorage.getItem(LEGACY_KEYS.auction)
  if (legacyAuctionRaw && !localStorage.getItem(STORAGE_KEYS_V2.auction)) {
    localStorage.setItem(STORAGE_KEYS_V2.auction, legacyAuctionRaw)
  }

  const legacyAuction = safeParse<Record<string, unknown>>(legacyAuctionRaw, {})
  if (!localStorage.getItem(STORAGE_KEYS_V2.settings)) {
    const settings = {
      leagueSize: legacyAuction.leagueSize ?? 10,
      startingBudget: legacyAuction.startingBudget ?? 500,
      budget: legacyAuction.budget ?? legacyAuction.startingBudget ?? 500,
      strategy: legacyAuction.strategy ?? 'balanced',
      suggestionMode: legacyAuction.suggestionMode ?? 'target',
    }
    localStorage.setItem(STORAGE_KEYS_V2.settings, JSON.stringify(settings))
  }
  if (!localStorage.getItem(STORAGE_KEYS_V2.watchlist) && Array.isArray(legacyAuction.wishlist)) {
    localStorage.setItem(STORAGE_KEYS_V2.watchlist, JSON.stringify(legacyAuction.wishlist))
  }
  if (!localStorage.getItem(STORAGE_KEYS_V2.userPlayers)) {
    localStorage.setItem(STORAGE_KEYS_V2.userPlayers, JSON.stringify([] satisfies UserPlayerData[]))
  }

  localStorage.setItem(STORAGE_KEYS_V2.migrations, JSON.stringify({ ...marker, legacyV1ToV2: true, at: new Date().toISOString() }))
  return true
}

export function saveAuctionMirror(state: unknown) {
  localStorage.setItem(STORAGE_KEYS_V2.auction, JSON.stringify(state))
}

export function createUserBackup(): UserBackup {
  const rawKeys: Record<string, string | null> = {}
  const keys = [
    LEGACY_KEYS.auction,
    LEGACY_KEYS.dataUpdate,
    LEGACY_KEYS.dataMeta,
    ...Object.values(STORAGE_KEYS_V2),
  ]
  for (const key of keys) rawKeys[key] = localStorage.getItem(key)

  const backup: UserBackup = {
    schemaVersion: '2.0',
    createdAt: new Date().toISOString(),
    legacyAuctionState: safeParse(localStorage.getItem(LEGACY_KEYS.auction), null),
    auctionStateV2: safeParse(localStorage.getItem(STORAGE_KEYS_V2.auction), null),
    userPlayers: safeParse<UserPlayerData[]>(localStorage.getItem(STORAGE_KEYS_V2.userPlayers), []),
    watchlist: safeParse(localStorage.getItem(STORAGE_KEYS_V2.watchlist), null),
    settings: safeParse(localStorage.getItem(STORAGE_KEYS_V2.settings), null),
    rawKeys,
  }
  localStorage.setItem(STORAGE_KEYS_V2.backup, JSON.stringify(backup))
  return backup
}

export function restoreUserBackup(backup: UserBackup) {
  if (!backup || backup.schemaVersion !== '2.0' || !backup.rawKeys) throw new Error('Backup non valido.')
  for (const [key, value] of Object.entries(backup.rawKeys)) {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  }
}

export function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}