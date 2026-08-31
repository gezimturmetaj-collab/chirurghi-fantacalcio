import type { Player, Role } from '../data/players'
import type { DataQuality, SourcePlayerData, UpdateManifest, UserPlayerData } from '../data/schema'
import { STORAGE_KEYS_V2 } from './storageManager'

export type LegacyPlayerUpdate = {
  playerKey: string
  name?: string
  team?: string
  role?: Role
  market8?: number | null
  market10?: number | null
  quotation?: number | null
  fvm?: number | null
  starterPct?: number | null
  pro?: string | null
  contra?: string | null
  usefulDetails?: string | null
  penalties?: boolean | null
  setPieces?: boolean | null
  injury?: string | null
  injuryStatus?: 'available' | 'doubt' | 'injured' | 'recovering' | 'suspended' | null
  expectedReturn?: string | null
  recoveryTime?: string | null
  lastUpdated?: string | null
  appearances?: number | null
  starts?: number | null
  minutes?: number | null
  goals?: number | null
  assists?: number | null
  fantasyAverage?: number | null
  xg?: number | null
  xa?: number | null
  shots90?: number | null
  chances90?: number | null
  bonus90?: number | null
  malus90?: number | null
  injuryDays?: number | null
  injuryCount?: number | null
  rotationRisk?: number | null
  transferRisk?: number | null
  cardRisk?: number | null
  position?: string | null
  competition?: string | null
  sourceUpdatedAt?: string | null
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function makeLegacyPlayerKey(name: string, team: string) {
  return `${name}|${team}`
}

export function makeStablePlayerId(index: number) {
  return `p_${String(index + 1).padStart(6, '0')}`
}

function qualityFromLegacy(player: Player): DataQuality {
  if (player.dataQuality === 'elite') return 'HIGH'
  if (player.dataQuality === 'auto') return 'MEDIUM'
  return 'LOW'
}

export function buildSourcePlayersFromLegacy(players: Player[]): SourcePlayerData[] {
  const now = new Date().toISOString()
  return players.map((player, index) => ({
    schemaVersion: '2.0',
    identity: {
      id: makeStablePlayerId(index),
      name: player.name,
      displayName: player.name,
      aliases: Array.from(new Set([player.name, normalizeText(player.name)])),
      team: player.team,
      teamId: null,
      realPosition: player.profile ?? null,
    },
    fantasy: {
      classicRole: player.role,
      mantraRoles: null,
      qiClassic: null,
      qaClassic: player.quotation ?? null,
      fvmClassic1000: player.fvm ?? null,
      qiMantra: null,
      qaMantra: null,
      fvmMantra1000: null,
      qaDelta: null,
      fvmDelta: null,
      quotationUpdatedAt: null,
    },
    availability: {
      status: null,
      starterProbability: null,
      voteProbability: null,
      expectedMinutes: null,
      competitors: null,
      injuryStatus: null,
      injuryDescription: null,
      expectedReturn: null,
      injuryRisk: null,
    },
    market: {
      market8: player.market8 ?? null,
      market10: player.market10 ?? null,
      maxBid: player.maxBid ?? null,
      marketValueEuro: null,
      transferStatus: null,
      transferRisk: null,
      rumorsScore: null,
    },
    editorial: {
      pro: player.use ? [player.use] : null,
      contro: null,
      summary: player.note ?? player.traits ?? null,
      sleeper: null,
      bet: null,
      breakoutCandidate: null,
      buyLow: null,
      sellHigh: null,
      hypeLevel: null,
      newsImpact: null,
      lastEditorialUpdate: null,
    },
    stats: {},
    advancedStats: {},
    sourceAudit: {
      players: { source: 'BASE_APP', updatedAt: now, confidence: null },
      fantacalcio: { source: 'BASE_APP', updatedAt: null, confidence: null },
    },
    dataQuality: qualityFromLegacy(player),
    legacy: {
      playerKey: makeLegacyPlayerKey(player.name, player.team),
      originalName: player.name,
      originalTeam: player.team,
      originalRole: player.role,
      tier: player.tier,
      traits: player.traits,
      fitP: player.fitP,
      fitD: player.fitD,
      fitC: player.fitC,
      fitA: player.fitA,
    },
    history: {
      quoteHistory: [],
      fvmHistory: [],
      ratingHistory: [],
      teamHistory: [{ value: player.team, at: now }],
      injuryHistory: [],
    },
  }))
}

function mapInjuryStatus(value: LegacyPlayerUpdate['injuryStatus']) {
  if (value === 'injured') return 'OUT' as const
  if (value === 'doubt') return 'DOUBT' as const
  if (value === 'recovering') return 'RETURNING' as const
  if (value === 'available') return 'FIT' as const
  return null
}

export function safeMergeLegacyUpdates(sourcePlayers: SourcePlayerData[], updates: LegacyPlayerUpdate[], sourceLabel?: string | null, generatedAt?: string | null) {
  const byLegacyKey = new Map(sourcePlayers.map((p) => [p.legacy.playerKey, p]))
  const byNormalizedIdentity = new Map(sourcePlayers.map((p) => [`${normalizeText(p.identity.displayName)}|${normalizeText(p.identity.team)}`, p]))
  const at = generatedAt ?? new Date().toISOString()

  for (const update of updates) {
    let player = byLegacyKey.get(update.playerKey)
    if (!player) {
      const [name = '', team = ''] = update.playerKey.split('|')
      player = byNormalizedIdentity.get(`${normalizeText(name)}|${normalizeText(team)}`)
    }
    if (!player) continue

    const oldTeam = player.identity.team
    if (typeof update.name === 'string' && update.name.trim()) {
      player.identity.displayName = update.name.trim()
      if (!player.identity.aliases.some((a) => normalizeText(a) === normalizeText(update.name!))) player.identity.aliases.push(update.name.trim())
    }
    if (typeof update.team === 'string' && update.team.trim() && update.team !== oldTeam) {
      player.identity.team = update.team.trim()
      player.history.teamHistory.push({ value: update.team.trim(), at })
    }
    if (update.role) player.fantasy.classicRole = update.role
    if (update.quotation !== undefined) {
      const old = player.fantasy.qaClassic ?? null
      player.fantasy.qaClassic = update.quotation
      if (old !== update.quotation) player.history.quoteHistory.push({ value: update.quotation ?? null, at })
    }
    if (update.fvm !== undefined) {
      const old = player.fantasy.fvmClassic1000 ?? null
      player.fantasy.fvmClassic1000 = update.fvm
      if (old !== update.fvm) player.history.fvmHistory.push({ value: update.fvm ?? null, at })
    }
    if (update.market8 !== undefined) player.market.market8 = update.market8
    if (update.market10 !== undefined) player.market.market10 = update.market10
    if (update.starterPct !== undefined) player.availability.starterProbability = update.starterPct
    if (update.injuryStatus !== undefined) player.availability.injuryStatus = mapInjuryStatus(update.injuryStatus)
    if (update.injury !== undefined) player.availability.injuryDescription = update.injury
    if (update.expectedReturn !== undefined) player.availability.expectedReturn = update.expectedReturn
    if (update.transferRisk !== undefined) player.market.transferRisk = update.transferRisk
    if (update.position !== undefined) player.identity.realPosition = update.position
    if (update.pro !== undefined) player.editorial.pro = update.pro ? [update.pro] : null
    if (update.contra !== undefined) player.editorial.contro = update.contra ? [update.contra] : null
    if (update.usefulDetails !== undefined) player.editorial.summary = update.usefulDetails

    const statsPairs: Array<[string, number | null | undefined]> = [
      ['appearances', update.appearances], ['starts', update.starts], ['minutes', update.minutes], ['goals', update.goals], ['assists', update.assists],
      ['fantasyAverage', update.fantasyAverage], ['xg', update.xg], ['xa', update.xa], ['shots90', update.shots90], ['chances90', update.chances90],
      ['bonus90', update.bonus90], ['malus90', update.malus90], ['injuryDays', update.injuryDays], ['injuryCount', update.injuryCount], ['rotationRisk', update.rotationRisk], ['cardRisk', update.cardRisk],
    ]
    for (const [key, value] of statsPairs) if (value !== undefined) player.stats[key] = value

    player.sourceAudit.fantacalcio = { source: sourceLabel ?? 'UPDATE_FEED', updatedAt: at, confidence: null }
  }

  return sourcePlayers
}

export class DataManager {
  private sourcePlayers: SourcePlayerData[]
  private userPlayers: UserPlayerData[]

  constructor(basePlayers: Player[]) {
    const stored = localStorage.getItem(STORAGE_KEYS_V2.sourceData)
    this.sourcePlayers = stored ? JSON.parse(stored) as SourcePlayerData[] : buildSourcePlayersFromLegacy(basePlayers)
    const user = localStorage.getItem(STORAGE_KEYS_V2.userPlayers)
    this.userPlayers = user ? JSON.parse(user) as UserPlayerData[] : []
  }

  getSourcePlayers() { return this.sourcePlayers }
  getUserPlayers() { return this.userPlayers }
  getById(id: string) { return this.sourcePlayers.find((p) => p.identity.id === id) ?? null }
  getByLegacyKey(key: string) { return this.sourcePlayers.find((p) => p.legacy.playerKey === key) ?? null }

  save() {
    localStorage.setItem(STORAGE_KEYS_V2.sourceData, JSON.stringify(this.sourcePlayers))
    localStorage.setItem(STORAGE_KEYS_V2.userPlayers, JSON.stringify(this.userPlayers))
  }

  replaceSourceData(next: SourcePlayerData[]) {
    this.sourcePlayers = next
    this.save()
  }

  mergeLegacyUpdates(updates: LegacyPlayerUpdate[], sourceLabel?: string | null, generatedAt?: string | null) {
    this.sourcePlayers = safeMergeLegacyUpdates(structuredClone(this.sourcePlayers), updates, sourceLabel, generatedAt)
    this.save()
    return this.sourcePlayers
  }

  setManifest(manifest: UpdateManifest) {
    localStorage.setItem(STORAGE_KEYS_V2.manifest, JSON.stringify(manifest))
  }
}