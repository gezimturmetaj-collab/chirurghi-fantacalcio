import type { Role } from './players'

export type DataQuality = 'HIGH' | 'MEDIUM' | 'LOW'
export type Confidence = number
export type FreshnessState = 'LIVE' | 'OGGI' | '1g' | '3g' | 'STALE' | 'N/D'
export type DatasetName =
  | 'players'
  | 'fantacalcio'
  | 'stats'
  | 'advancedStats'
  | 'injuries'
  | 'lineups'
  | 'fixtures'
  | 'editorial'
  | 'market'

export type SourceAudit = {
  source: string | null
  sourceUrl?: string | null
  updatedAt: string | null
  confidence: Confidence | null
}

export type PlayerIdentity = {
  id: string
  name: string
  surname?: string | null
  displayName: string
  aliases: string[]
  birthDate?: string | null
  age?: number | null
  nationality?: string | null
  heightCm?: number | null
  foot?: 'left' | 'right' | 'both' | null
  team: string
  teamId?: string | null
  shirtNumber?: number | null
  realPosition?: string | null
}

export type PlayerFantasy = {
  classicRole: Role
  mantraRoles?: string[] | null
  qiClassic?: number | null
  qaClassic?: number | null
  fvmClassic1000?: number | null
  qiMantra?: number | null
  qaMantra?: number | null
  fvmMantra1000?: number | null
  qaDelta?: number | null
  fvmDelta?: number | null
  quotationUpdatedAt?: string | null
}

export type PlayerAvailability = {
  status?: 'TITOLARE' | 'BALLOTTAGGIO' | 'RISERVA' | null
  starterProbability?: number | null
  voteProbability?: number | null
  expectedMinutes?: number | null
  competitors?: string[] | null
  injuryStatus?: 'OUT' | 'DOUBT' | 'RETURNING' | 'FIT' | null
  injuryDescription?: string | null
  expectedReturn?: string | null
  injuryRisk?: number | null
}

export type PlayerMarket = {
  market8?: number | null
  market10?: number | null
  maxBid?: number | null
  marketValueEuro?: number | null
  transferStatus?: string | null
  transferRisk?: number | null
  rumorsScore?: number | null
}

export type PlayerEditorial = {
  sentiment?: number | null
  pro?: string[] | null
  contro?: string[] | null
  summary?: string | null
  sleeper?: boolean | null
  bet?: boolean | null
  breakoutCandidate?: boolean | null
  buyLow?: boolean | null
  sellHigh?: boolean | null
  hypeLevel?: number | null
  newsImpact?: number | null
  lastEditorialUpdate?: string | null
}

export type PlayerStats = Record<string, number | string | boolean | null | undefined>

export type SourcePlayerData = {
  schemaVersion: '2.0'
  identity: PlayerIdentity
  fantasy: PlayerFantasy
  availability: PlayerAvailability
  market: PlayerMarket
  editorial: PlayerEditorial
  stats: PlayerStats
  advancedStats: PlayerStats
  sourceAudit: Partial<Record<DatasetName, SourceAudit>>
  dataQuality: DataQuality
  legacy: {
    playerKey: string
    originalName: string
    originalTeam: string
    originalRole: Role
    tier?: string | null
    traits?: string | null
    fitP?: number | null
    fitD?: number | null
    fitC?: number | null
    fitA?: number | null
    raw?: Record<string, unknown>
  }
  history: {
    quoteHistory: Array<{ value: number | null; at: string }>
    fvmHistory: Array<{ value: number | null; at: string }>
    ratingHistory: Array<{ value: number | null; at: string }>
    teamHistory: Array<{ value: string; at: string }>
    injuryHistory: Array<{ value: string | null; at: string }>
  }
}

export type UserPlayerData = {
  playerId: string
  favorite?: boolean
  watchlistCategory?: string | null
  note?: string | null
  customMax?: number | null
  updatedAt: string
}

export type DatasetManifestEntry = {
  updatedAt: string | null
  source?: string | null
  sourceUrl?: string | null
  confidence?: number | null
}

export type UpdateManifest = {
  season: '2026-27'
  schemaVersion: '2.0'
  modelVersion: string
  updatedAt: string
  datasets: Record<DatasetName, DatasetManifestEntry>
}

export type DataChangeSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

export type DataChange = {
  playerId: string
  playerName: string
  severity: DataChangeSeverity
  field: string
  oldValue: unknown
  newValue: unknown
  detectedAt: string
}

export type DataSnapshot = {
  schemaVersion: '2.0'
  createdAt: string
  sourcePlayers: SourcePlayerData[]
  manifest: UpdateManifest | null
}

export type UserBackup = {
  schemaVersion: '2.0'
  createdAt: string
  legacyAuctionState: unknown
  auctionStateV2: unknown
  userPlayers: UserPlayerData[]
  watchlist: unknown
  settings: unknown
  rawKeys: Record<string, string | null>
}