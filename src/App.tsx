import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { players, type Player as BasePlayer, type Role } from './data/players'
import { DataManager } from './services/dataManager'
import { UpdateManager, freshnessFor, loadManifest } from './services/updateManager'
import { createUserBackup, downloadJson, migrateLegacyStorage, restoreUserBackup, saveAuctionMirror } from './services/storageManager'
import type { DatasetName, UserBackup } from './data/schema'

type Player = BasePlayer & {
  bonus?: number | null
  penalties?: boolean
  setPieces?: boolean
  averageRating2526?: number | null
  reliability?: string | null
  reliabilityLeague?: string | null
  profile?: string | null
  use?: string | null
  biddingRule?: string | null
  note?: string | null
  quotation?: number
  fvm?: number
}

type Purchase = {
  player: Player
  price: number
}

type RivalSale = {
  player: Player
  price: number
  rivalId: number
}

type LeagueSize = 8 | 10
type StartingBudget = 500 | 750 | 1000
type ViewMode = 'war' | 'analysis' | 'compare' | 'pairings' | 'live' | 'myteam' | 'rivals' | 'history' | 'squad' | 'report' | 'ranking' | 'settings' | 'more'
type Strategy = 'balanced' | 'aggressive' | 'value' | 'patient' | 'stars' | 'free'
type SuggestionMode = 'target' | 'bet' | 'decoy'
type SuggestionCategory = 'top' | 'starter' | 'bet' | 'low' | 'decoy'

type WishlistItem = {
  playerKey: string
  priority: number
  comment?: string
  starred?: boolean
}

type PlayerUpdateData = {
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
  averageRating?: number | null
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
  photoUrl?: string | null
}

type UpdateChange = {
  type: 'new' | 'transfer' | 'role' | 'market' | 'starter' | 'injury' | 'return' | 'other'
  player: string
  detail: string
}

type UpdatePayload = {
  version: string
  generatedAt: string
  sourceLabel?: string
  players: PlayerUpdateData[]
  changes?: UpdateChange[]
}

type UpdateMeta = {
  version: string
  generatedAt: string
  downloadedAt: string
  sourceLabel?: string
  playerCount: number
}

type ExtendedPlayer = Player & {
  newToSerieA?: boolean
}

const BASE_BUDGET = 500
const STORAGE_KEY = 'fantacalcio-auction-state-v1'
const DATA_UPDATE_KEY = 'fantacalcio-data-update-v1'
const DATA_UPDATE_META_KEY = 'fantacalcio-data-update-meta-v1'
const UPDATE_ENDPOINT = '/.netlify/functions/fantacalcio-update'
const UPDATE_ENDPOINT_FALLBACK = 'https://celebrated-fox-b05fdb.netlify.app/.netlify/functions/fantacalcio-update'

type SavedAuction = {
  setupComplete?: boolean
  leagueSize: LeagueSize
  startingBudget: StartingBudget
  budget: number
  strategy: Strategy
  suggestionMode: SuggestionMode
  purchases: Purchase[]
  rivalSales: RivalSale[]
  rivalNames: string[]
  wishlist: WishlistItem[]
}

function loadSavedAuction(): Partial<SavedAuction> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function loadDataUpdates(): Record<string, PlayerUpdateData> {
  try {
    const raw = localStorage.getItem(DATA_UPDATE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as PlayerUpdateData[]
    return Object.fromEntries(parsed.map((item) => [item.playerKey, item]))
  } catch {
    return {}
  }
}

function loadUpdateMeta(): UpdateMeta | null {
  try {
    const raw = localStorage.getItem(DATA_UPDATE_META_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function isStorageQuotaError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error ?? '').toLowerCase()
  return (
    (typeof DOMException !== 'undefined' && error instanceof DOMException && (
      error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      error.code === 22 || error.code === 1014
    )) ||
    message.includes('quota') ||
    message.includes('storage') && message.includes('exceed')
  )
}

function clearOnlyOldSourceCaches(keepKey?: string) {
  const disposableKeys = [
    'fantawarroom_v2_sourceData',
    'fantawarroom_v2_changelog',
    'fantawarroom_v2_changes',
    'fantawarroom_v2_manifest',
    DATA_UPDATE_KEY,
    DATA_UPDATE_META_KEY,
  ].filter((key) => key !== keepKey)
  disposableKeys.forEach((key) => {
    try { localStorage.removeItem(key) } catch { /* cache non essenziale */ }
  })
}

function saveSourceJsonSafely(key: string, value: unknown) {
  const serialized = JSON.stringify(value)
  try {
    localStorage.setItem(key, serialized)
    return true
  } catch (error) {
    if (!isStorageQuotaError(error)) return false
  }

  // Safari/iOS può avere una quota molto piccola: eliminiamo SOLO vecchie cache sorgente.
  // Non tocchiamo mai rosa, acquisti, rivali, MY TEAM o impostazioni utente.
  clearOnlyOldSourceCaches(key)
  try {
    localStorage.setItem(key, serialized)
    return true
  } catch {
    // L'aggiornamento resta comunque attivo in memoria per la sessione d'asta.
    return false
  }
}

function compactUpdateForStorage(item: PlayerUpdateData): PlayerUpdateData {
  const compact: Record<string, unknown> = { playerKey: item.playerKey }
  const fields: (keyof PlayerUpdateData)[] = [
    'quotation','fvm','market8','market10','starterPct','pro','contra','usefulDetails',
    'penalties','setPieces','injury','injuryStatus','expectedReturn','recoveryTime',
    'appearances','averageRating','fantasyAverage','goals','assists','position','competition',
    'sourceUpdatedAt','lastUpdated','photoUrl'
  ]
  for (const field of fields) {
    const value = item[field]
    if (value !== null && value !== undefined && value !== '') compact[field] = value
  }
  return compact as PlayerUpdateData
}

const roles: Role[] = ['P', 'D', 'C', 'A']

const wishlistLimits: Record<Role, number> = {
  P: 20,
  D: 40,
  C: 40,
  A: 30,
}

const slotLimits: Record<Role, number> = {
  P: 3,
  D: 8,
  C: 8,
  A: 6,
}

const roleNames: Record<Role, string> = {
  P: 'PORTIERE',
  D: 'DIFENSORE',
  C: 'CENTROCAMPISTA',
  A: 'ATTACCANTE',
}

const strategies: Record<
  Strategy,
  { name: string; description: string; budgets: Record<Role, number> }
> = {
  balanced: {
    name: 'EQUILIBRATA',
    description: 'Distribuzione completa e bilanciata tra i reparti.',
    budgets: { P: 30, D: 80, C: 155, A: 235 },
  },
  aggressive: {
    name: 'AGGRESSIVA',
    description: 'Più crediti sui giocatori offensivi e sui profili premium.',
    budgets: { P: 25, D: 65, C: 135, A: 275 },
  },
  value: {
    name: 'VALUE',
    description: 'Punta sul rapporto qualità/prezzo e su una rosa profonda.',
    budgets: { P: 30, D: 100, C: 180, A: 190 },
  },
  patient: {
    name: 'ATTENDISTA',
    description: 'Riduce gli eccessi iniziali e conserva potere d’acquisto.',
    budgets: { P: 30, D: 90, C: 170, A: 210 },
  },
  stars: {
    name: 'STELLE & SCOMMESSE',
    description: 'Top player costosi accompagnati da low-cost ad alto potenziale.',
    budgets: { P: 25, D: 65, C: 125, A: 285 },
  },
  free: {
    name: 'FREE',
    description: 'Qualità pura: nei suggerimenti ignora costi, mercato e vincoli di budget.',
    budgets: { P: 30, D: 80, C: 155, A: 235 },
  },
}

const goalkeeperTeamPairs: Record<string, number> = {
  'Juventus|Torino': 60,
  'Lazio|Roma': 60,
  'Inter|Milan': 60,
  'Napoli|Roma': 45,
  'Parma|Sassuolo': 35,
  'Lecce|Parma': 35,
  'Genoa|Sassuolo': 35,
  'Atalanta|Frosinone': 30,
  'Como|Fiorentina': 32,
}

const goalkeeperCalendarNotes: Record<string, string> = {
  'Inter|Milan': 'incrocio perfetto: almeno una delle due gioca in casa in ogni turno',
  'Juventus|Torino': 'incrocio perfetto da derby: alternanza casa/trasferta',
  'Lazio|Roma': 'incrocio perfetto da derby: alternanza casa/trasferta',
  'Napoli|Roma': 'incrocio eccellente: pochissime trasferte contemporanee',
  'Parma|Sassuolo': 'uno dei migliori incastri low-cost della griglia 2026/27',
  'Genoa|Sassuolo': 'incastro molto favorevole della griglia 2026/27',
  'Atalanta|Frosinone': 'buona copertura calendario a costo potenzialmente contenuto',
  'Como|Fiorentina': 'coppia di fascia alta indicata tra le combinazioni più interessanti',
}

type PairingMode = 'goalkeepers' | 'attackers'
type FixtureMatch = { home: string; away: string }
type PairingRoundResult = {
  round: number
  team: string
  opponent: string
  home: boolean
  score: number
  level: 'FACILE' | 'MEDIA' | 'DIFFICILE'
}

// Calendario ufficiale Serie A Enilive 2026/27 (Lega Serie A, 38 giornate).
// Il calendario è dato fattuale; indice e suggerimenti sono calcolati dal nostro motore.
const SERIE_A_FIXTURES_2026_27: FixtureMatch[][] = [
  [['Atalanta','Sassuolo'],['Bologna','Lazio'],['Frosinone','Juventus'],['Genoa','Napoli'],['Inter','Monza'],['Parma','Cagliari'],['Roma','Fiorentina'],['Torino','Milan'],['Udinese','Como'],['Venezia','Lecce']],
  [['Atalanta','Bologna'],['Cagliari','Inter'],['Fiorentina','Frosinone'],['Juventus','Parma'],['Lazio','Genoa'],['Lecce','Roma'],['Milan','Venezia'],['Monza','Udinese'],['Napoli','Como'],['Sassuolo','Torino']],
  [['Bologna','Sassuolo'],['Cagliari','Lecce'],['Fiorentina','Torino'],['Frosinone','Venezia'],['Genoa','Como'],['Inter','Napoli'],['Juventus','Milan'],['Parma','Monza'],['Roma','Atalanta'],['Udinese','Lazio']],
  [['Atalanta','Cagliari'],['Como','Parma'],['Genoa','Frosinone'],['Inter','Udinese'],['Lazio','Milan'],['Lecce','Monza'],['Napoli','Bologna'],['Sassuolo','Juventus'],['Torino','Roma'],['Venezia','Fiorentina']],
  [['Bologna','Torino'],['Fiorentina','Napoli'],['Frosinone','Como'],['Juventus','Atalanta'],['Milan','Lecce'],['Monza','Sassuolo'],['Parma','Genoa'],['Roma','Inter'],['Udinese','Cagliari'],['Venezia','Lazio']],
  [['Atalanta','Venezia'],['Cagliari','Juventus'],['Como','Roma'],['Genoa','Fiorentina'],['Inter','Parma'],['Lazio','Monza'],['Lecce','Bologna'],['Napoli','Frosinone'],['Sassuolo','Milan'],['Torino','Udinese']],
  [['Bologna','Inter'],['Fiorentina','Como'],['Frosinone','Sassuolo'],['Juventus','Lazio'],['Milan','Atalanta'],['Monza','Cagliari'],['Parma','Torino'],['Roma','Genoa'],['Udinese','Lecce'],['Venezia','Napoli']],
  [['Atalanta','Frosinone'],['Cagliari','Bologna'],['Como','Sassuolo'],['Genoa','Venezia'],['Inter','Fiorentina'],['Lazio','Parma'],['Lecce','Juventus'],['Napoli','Roma'],['Torino','Monza'],['Udinese','Milan']],
  [['Fiorentina','Atalanta'],['Frosinone','Lecce'],['Genoa','Juventus'],['Milan','Bologna'],['Monza','Napoli'],['Parma','Udinese'],['Roma','Cagliari'],['Sassuolo','Lazio'],['Torino','Como'],['Venezia','Inter']],
  [['Atalanta','Parma'],['Bologna','Monza'],['Como','Venezia'],['Frosinone','Torino'],['Juventus','Napoli'],['Lazio','Cagliari'],['Lecce','Genoa'],['Milan','Inter'],['Sassuolo','Fiorentina'],['Udinese','Roma']],
  [['Cagliari','Frosinone'],['Fiorentina','Juventus'],['Genoa','Milan'],['Inter','Como'],['Monza','Atalanta'],['Napoli','Lazio'],['Parma','Bologna'],['Roma','Sassuolo'],['Torino','Lecce'],['Venezia','Udinese']],
  [['Atalanta','Inter'],['Bologna','Udinese'],['Como','Cagliari'],['Juventus','Venezia'],['Lazio','Lecce'],['Milan','Frosinone'],['Monza','Fiorentina'],['Napoli','Torino'],['Parma','Roma'],['Sassuolo','Genoa']],
  [['Cagliari','Milan'],['Como','Juventus'],['Frosinone','Parma'],['Inter','Genoa'],['Lecce','Atalanta'],['Roma','Monza'],['Sassuolo','Napoli'],['Torino','Lazio'],['Udinese','Fiorentina'],['Venezia','Bologna']],
  [['Bologna','Roma'],['Fiorentina','Cagliari'],['Frosinone','Inter'],['Genoa','Torino'],['Juventus','Udinese'],['Lazio','Atalanta'],['Milan','Parma'],['Monza','Como'],['Napoli','Lecce'],['Venezia','Sassuolo']],
  [['Atalanta','Genoa'],['Cagliari','Venezia'],['Como','Bologna'],['Inter','Torino'],['Juventus','Monza'],['Lazio','Roma'],['Lecce','Sassuolo'],['Napoli','Milan'],['Parma','Fiorentina'],['Udinese','Frosinone']],
  [['Atalanta','Napoli'],['Fiorentina','Bologna'],['Frosinone','Lazio'],['Genoa','Udinese'],['Lecce','Inter'],['Milan','Como'],['Roma','Juventus'],['Sassuolo','Parma'],['Torino','Cagliari'],['Venezia','Monza']],
  [['Bologna','Juventus'],['Cagliari','Genoa'],['Como','Lecce'],['Fiorentina','Lazio'],['Inter','Sassuolo'],['Monza','Milan'],['Parma','Napoli'],['Roma','Frosinone'],['Torino','Venezia'],['Udinese','Atalanta']],
  [['Atalanta','Como'],['Frosinone','Bologna'],['Genoa','Monza'],['Juventus','Torino'],['Lazio','Inter'],['Lecce','Parma'],['Milan','Fiorentina'],['Napoli','Cagliari'],['Sassuolo','Udinese'],['Venezia','Roma']],
  [['Bologna','Genoa'],['Cagliari','Sassuolo'],['Como','Lazio'],['Fiorentina','Lecce'],['Inter','Juventus'],['Monza','Frosinone'],['Parma','Venezia'],['Roma','Milan'],['Torino','Atalanta'],['Udinese','Napoli']],
  [['Atalanta','Roma'],['Cagliari','Como'],['Juventus','Genoa'],['Lazio','Bologna'],['Lecce','Udinese'],['Milan','Torino'],['Napoli','Fiorentina'],['Parma','Inter'],['Sassuolo','Monza'],['Venezia','Frosinone']],
  [['Bologna','Atalanta'],['Como','Napoli'],['Fiorentina','Sassuolo'],['Frosinone','Milan'],['Genoa','Parma'],['Inter','Venezia'],['Juventus','Cagliari'],['Lecce','Torino'],['Monza','Lazio'],['Roma','Udinese']],
  [['Atalanta','Fiorentina'],['Cagliari','Parma'],['Genoa','Lecce'],['Lazio','Venezia'],['Milan','Juventus'],['Monza','Roma'],['Napoli','Inter'],['Sassuolo','Como'],['Torino','Frosinone'],['Udinese','Bologna']],
  [['Atalanta','Lazio'],['Bologna','Milan'],['Como','Monza'],['Fiorentina','Udinese'],['Inter','Cagliari'],['Juventus','Sassuolo'],['Lecce','Napoli'],['Parma','Frosinone'],['Roma','Torino'],['Venezia','Genoa']],
  [['Bologna','Como'],['Cagliari','Lazio'],['Frosinone','Fiorentina'],['Genoa','Atalanta'],['Inter','Milan'],['Monza','Lecce'],['Napoli','Juventus'],['Roma','Parma'],['Torino','Sassuolo'],['Udinese','Venezia']],
  [['Atalanta','Monza'],['Como','Torino'],['Fiorentina','Inter'],['Juventus','Bologna'],['Lazio','Napoli'],['Lecce','Frosinone'],['Milan','Genoa'],['Sassuolo','Roma'],['Udinese','Parma'],['Venezia','Cagliari']],
  [['Bologna','Lecce'],['Cagliari','Udinese'],['Como','Milan'],['Frosinone','Napoli'],['Genoa','Lazio'],['Inter','Atalanta'],['Monza','Juventus'],['Parma','Sassuolo'],['Roma','Venezia'],['Torino','Fiorentina']],
  [['Atalanta','Torino'],['Fiorentina','Venezia'],['Juventus','Roma'],['Lazio','Frosinone'],['Lecce','Como'],['Milan','Cagliari'],['Monza','Genoa'],['Napoli','Parma'],['Sassuolo','Bologna'],['Udinese','Inter']],
  [['Bologna','Napoli'],['Cagliari','Fiorentina'],['Como','Udinese'],['Frosinone','Monza'],['Genoa','Roma'],['Lazio','Juventus'],['Milan','Sassuolo'],['Parma','Lecce'],['Torino','Inter'],['Venezia','Atalanta']],
  [['Atalanta','Milan'],['Fiorentina','Genoa'],['Frosinone','Inter'],['Juventus','Como'],['Monza','Bologna'],['Napoli','Venezia'],['Parma','Lazio'],['Roma','Lecce'],['Sassuolo','Cagliari'],['Udinese','Torino']],
  [['Cagliari','Napoli'],['Como','Fiorentina'],['Frosinone','Udinese'],['Genoa','Inter'],['Lecce','Lazio'],['Milan','Monza'],['Roma','Bologna'],['Sassuolo','Atalanta'],['Torino','Juventus'],['Venezia','Parma']],
  [['Bologna','Venezia'],['Cagliari','Atalanta'],['Fiorentina','Milan'],['Frosinone','Genoa'],['Inter','Roma'],['Juventus','Lecce'],['Lazio','Torino'],['Napoli','Sassuolo'],['Parma','Como'],['Udinese','Monza']],
  [['Atalanta','Udinese'],['Bologna','Cagliari'],['Como','Frosinone'],['Fiorentina','Parma'],['Milan','Napoli'],['Monza','Inter'],['Roma','Lazio'],['Sassuolo','Lecce'],['Torino','Genoa'],['Venezia','Juventus']],
  [['Cagliari','Monza'],['Frosinone','Roma'],['Genoa','Sassuolo'],['Inter','Bologna'],['Juventus','Fiorentina'],['Lazio','Como'],['Lecce','Milan'],['Napoli','Udinese'],['Parma','Atalanta'],['Venezia','Torino']],
  [['Atalanta','Juventus'],['Bologna','Fiorentina'],['Como','Inter'],['Lecce','Cagliari'],['Milan','Lazio'],['Monza','Venezia'],['Roma','Napoli'],['Sassuolo','Frosinone'],['Torino','Parma'],['Udinese','Genoa']],
  [['Fiorentina','Roma'],['Frosinone','Atalanta'],['Genoa','Cagliari'],['Inter','Lecce'],['Lazio','Sassuolo'],['Napoli','Monza'],['Parma','Milan'],['Torino','Bologna'],['Udinese','Juventus'],['Venezia','Como']],
  [['Bologna','Frosinone'],['Cagliari','Torino'],['Como','Atalanta'],['Juventus','Inter'],['Lazio','Udinese'],['Lecce','Fiorentina'],['Milan','Roma'],['Monza','Parma'],['Napoli','Genoa'],['Sassuolo','Venezia']],
  [['Atalanta','Lecce'],['Fiorentina','Monza'],['Frosinone','Cagliari'],['Genoa','Bologna'],['Inter','Lazio'],['Parma','Juventus'],['Roma','Como'],['Torino','Napoli'],['Udinese','Sassuolo'],['Venezia','Milan']],
  [['Bologna','Parma'],['Cagliari','Roma'],['Como','Genoa'],['Juventus','Frosinone'],['Lazio','Fiorentina'],['Lecce','Venezia'],['Milan','Udinese'],['Monza','Torino'],['Napoli','Atalanta'],['Sassuolo','Inter']],
].map((round) => round.map(([home, away]) => ({ home, away })))

const SERIE_A_TEAMS_2026_27 = Array.from(new Set(
  SERIE_A_FIXTURES_2026_27.flatMap((round) => round.flatMap((match) => [match.home, match.away]))
)).sort()

const fantacalcioPhotoIds: Record<string, number> = {
  'Malen': 5585,
  'Martinez L.': 2764,
  'Dimarco': 254,
  'Paz N.': 6875,
  'Calhanoglu': 2194,
  'Thuram': 4871,
  'McTominay': 4777,
  'Ramos G.': 6397,
  'Hojlund': 6052,
  'Orsolini': 2167,
  'Kean': 2097,
  'Kolo Muani': 5951,
  'Pulisic': 2423,
  'Rabiot': 2379,
  'Yildiz': 6434,
  'Douvikas': 7017,
  'Krstovic': 6435,
  'Scamacca': 2137,
  'Baturina': 7126,
  'Davis K.': 5637,
  'Mora': 7556,
  'Da Cunha': 5559,
  'Leao': 4510,
  'Svilar': 5841,
  'Berardi': 531,
  'Zaniolo': 2766,
  'Molina N.': 4998,
  'De Ketelaere': 5995,
  'Martinez Jo.': 5116,
  'Barella': 1870,
  'Esposito F.P.': 7071,
  'McKennie': 4973,
  'Wesley': 7181,
  'Carnesecchi': 4431,
  'Butez': 6966,
  'Atta': 6908,
  'Akanji': 4159,
  'Bremer': 2788,
  'Zaccagni': 632,
  'Vicario': 4964,
  'Dovbyk': 6675,
  'Maignan': 4312,
  'Mancini': 2296,
  'Dybala': 309,
  'Laurientè': 6060,
  'Simeone': 2061,
  'Raspadori': 4371,
  'Bastoni': 2120,
  'Pavlovic': 5022,
  'Rrahmani': 4409,
  'Santos A.': 7351,
  'Pellegrino M.': 7023,
  'Castro S.': 6572,
  'Esposito Se.': 4463,
  'Gudmundsson A.': 5800,
  'Kalulu': 4976,
  'Taylor K.': 7314,
  'Nkunku': 4728,
  "N'Dicka": 4317,
  'Pinamonti': 2038,
  'Vlasic': 5687,
  'Solet': 6956,
  'Kevin Carlos': 7547,
  'Ederson D.S.': 5792,
  'Samardzic': 5119,
  'Rodriguez Je.': 7129,
  'De Gea': 2521,
  'Bisseck': 6217,
  'Stones': 2514,
  'Alajbegovic': 7436,
  'Conceicao': 6884,
  'Gila': 5833,
  'Modric': 2606,
  'Di Lorenzo': 2816,
  'Soulè': 5734,
  'Adams A.': 7484,
  'Mastantuono': 7078
}

function PlayerPhoto({
  player,
  size = 42,
  card = false,
}: {
  player: Player
  size?: number
  card?: boolean
}) {
  const [failed, setFailed] = useState(false)
  const id = fantacalcioPhotoIds[player.name]
  const update = typeof window !== 'undefined'
    ? (() => {
        try {
          const raw = localStorage.getItem(DATA_UPDATE_KEY)
          if (!raw) return null
          const parsed = JSON.parse(raw) as PlayerUpdateData[]
          const key = `${player.name}|${player.team}`.toLowerCase()
          return parsed.find((item) => item.playerKey.toLowerCase() === key) ?? null
        } catch { return null }
      })()
    : null
  const authorizedPhotoUrl = update?.photoUrl ?? null

  const initials = player.name
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const width = card ? Math.round(size * 0.72) : size
  const height = card ? size : size

  if ((!id && !authorizedPhotoUrl) || failed) {
    return (
      <div
        title={`Figurina ${player.name}`}
        style={{
          width,
          height,
          flex: '0 0 auto',
          borderRadius: card ? '8px' : '50%',
          border: '1px solid rgba(148,163,184,.22)',
          background: 'linear-gradient(145deg,#182238,#0c1321)',
          boxShadow: '0 6px 18px rgba(0,0,0,.22)',
          display: 'grid',
          placeItems: 'center',
          color: '#9fb0ca',
          fontSize: card ? '11px' : '10px',
          fontWeight: 900,
          overflow: 'hidden',
        }}
      >
        {initials || player.role}
      </div>
    )
  }

  return (
    <img
      src={authorizedPhotoUrl || `https://content.fantacalcio.it/web/campioncini/21/card/${id}.png`}
      alt={`Figurina ${player.name}`}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      style={{
        width,
        height,
        flex: '0 0 auto',
        objectFit: 'cover',
        objectPosition: card ? 'center top' : 'center 18%',
        borderRadius: card ? '8px' : '50%',
        border: '1px solid rgba(148,163,184,.22)',
        background: '#0c1321',
        boxShadow: '0 6px 18px rgba(0,0,0,.22)',
      }}
    />
  )
}


const APP_THEME_CSS = `
  :root {
    color-scheme: dark;
    --app-bg: #111827;
    --app-bg-2: #172033;
    --surface: rgba(29, 41, 61, .94);
    --surface-2: rgba(37, 51, 74, .92);
    --surface-3: #22304a;
    --line: rgba(166, 190, 224, .20);
    --line-strong: rgba(166, 190, 224, .34);
    --text: #f8fafc;
    --muted: #aab9cf;
    --green: #32d583;
    --green-soft: rgba(50, 213, 131, .12);
    --blue: #4da3ff;
    --blue-soft: rgba(77, 163, 255, .13);
    --amber: #f6c453;
    --amber-soft: rgba(246, 196, 83, .13);
    --red: #ff6b7a;
    --red-soft: rgba(255, 107, 122, .12);
    --violet: #9b8cff;
    --violet-soft: rgba(155, 140, 255, .13);
    --radius-xl: 22px;
    --radius-lg: 17px;
    --radius-md: 13px;
    --shadow: 0 18px 50px rgba(0,0,0,.28);
  }

  * { box-sizing: border-box; }

  html {
    background: var(--app-bg);
  }

  body {
    margin: 0;
    background:
      radial-gradient(circle at 50% -10%, rgba(77,163,255,.13), transparent 34%),
      radial-gradient(circle at 100% 24%, rgba(155,140,255,.08), transparent 28%),
      linear-gradient(180deg, #17233a 0%, #111827 48%, #0f172a 100%);
    color: var(--text);
    -webkit-font-smoothing: antialiased;
  }

  body, button, input, select {
    font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "SF Pro Text",
      "Segoe UI", sans-serif;
  }

  button {
    -webkit-tap-highlight-color: transparent;
  }

  .app {
    width: min(100%, 760px) !important;
    max-width: 760px !important;
    margin: 0 auto !important;
    min-height: 100vh;
    padding: 14px 14px 110px !important;
    background: transparent !important;
  }

  .topbar {
    position: relative;
    overflow: hidden;
    margin: 3px 0 15px !important;
    padding: 18px 18px !important;
    border: 1px solid rgba(77,163,255,.15) !important;
    border-radius: var(--radius-xl) !important;
    background:
      radial-gradient(circle at 100% 0%, rgba(77,163,255,.20), transparent 42%),
      linear-gradient(145deg, rgba(39,55,82,.97), rgba(24,35,55,.98)) !important;
    box-shadow: var(--shadow);
  }

  .topbar::after {
    content: "";
    position: absolute;
    inset: auto -35px -55px auto;
    width: 150px;
    height: 150px;
    border-radius: 50%;
    background: rgba(155,140,255,.06);
    pointer-events: none;
  }

  .topbar h1 {
    margin: 3px 0 0 !important;
    letter-spacing: -.035em !important;
    font-size: clamp(26px, 7vw, 38px) !important;
    line-height: .98 !important;
    font-weight: 950 !important;
  }

  .eyebrow,
  .small-label {
    color: #7f93ad !important;
    letter-spacing: .14em !important;
    font-size: 9px !important;
    font-weight: 900 !important;
  }

  .budget-box {
    min-width: 88px !important;
    padding: 11px 13px !important;
    border: 1px solid rgba(50,213,131,.25) !important;
    border-radius: 16px !important;
    background: rgba(50,213,131,.09) !important;
    box-shadow: inset 0 0 0 1px rgba(255,255,255,.015);
  }

  .budget-box span {
    color: #82a897 !important;
    font-size: 7px !important;
    letter-spacing: .12em !important;
  }

  .budget-box strong {
    color: #d7ffe9 !important;
    font-size: 22px !important;
  }

  .section {
    margin: 0 0 14px !important;
    padding: 15px !important;
    border: 1px solid var(--line) !important;
    border-radius: var(--radius-xl) !important;
    background: linear-gradient(145deg, rgba(31,45,68,.96), rgba(23,34,53,.97)) !important;
    box-shadow: 0 10px 32px rgba(0,0,0,.17);
  }

  .section-title {
    display: flex !important;
    align-items: center !important;
    gap: 9px !important;
    margin-bottom: 12px !important;
    color: #e8eef8 !important;
    letter-spacing: .055em !important;
    font-size: 11px !important;
    font-weight: 950 !important;
  }

  .section-title > span {
    min-width: 29px !important;
    height: 29px !important;
    padding: 0 7px !important;
    display: inline-grid !important;
    place-items: center !important;
    border-radius: 9px !important;
    border: 1px solid rgba(77,163,255,.20) !important;
    background: var(--blue-soft) !important;
    color: #88c3ff !important;
    font-size: 9px !important;
  }

  .main-card,
  .target-card,
  .recommendation-main,
  .adaptive-status,
  .role-budget-card {
    border: 1px solid var(--line) !important;
    border-radius: var(--radius-lg) !important;
    background: linear-gradient(145deg, rgba(22,32,50,.88), rgba(13,20,33,.92)) !important;
    box-shadow: none !important;
  }

  .main-card,
  .target-card,
  .recommendation-main {
    padding: 14px !important;
  }

  .stats {
    display: grid !important;
    grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
    gap: 7px !important;
    margin: 0 0 14px !important;
    background: rgba(7,11,20,.88) !important;
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
  }

  .stat {
    min-width: 0;
    padding: 11px 8px !important;
    border: 1px solid var(--line) !important;
    border-radius: 14px !important;
    background: rgba(17,25,40,.88) !important;
    text-align: center !important;
  }

  .stat span {
    color: var(--muted) !important;
    font-size: 6.5px !important;
    letter-spacing: .07em !important;
  }

  .stat strong {
    margin-top: 4px !important;
    color: #fff !important;
    font-size: 17px !important;
  }

  .highlight-stat {
    border-color: rgba(50,213,131,.28) !important;
    background: var(--green-soft) !important;
  }

  .highlight-stat strong {
    color: #7bf0b0 !important;
  }

  .roster-summary,
  .role-budget-grid {
    gap: 8px !important;
  }

  .roster-summary > div {
    border: 1px solid var(--line) !important;
    border-radius: 14px !important;
    background: rgba(18,28,45,.82) !important;
  }

  .roster-summary > div:nth-child(1) { border-top: 2px solid var(--amber) !important; }
  .roster-summary > div:nth-child(2) { border-top: 2px solid var(--blue) !important; }
  .roster-summary > div:nth-child(3) { border-top: 2px solid var(--violet) !important; }
  .roster-summary > div:nth-child(4) { border-top: 2px solid var(--red) !important; }

  .purchase-row,
  .recommendation-item {
    border: 1px solid var(--line) !important;
    border-radius: 14px !important;
    background: rgba(15,23,38,.78) !important;
    transition: transform .16s ease, border-color .16s ease, background .16s ease;
  }

  .purchase-row {
    padding: 9px 10px !important;
    margin-bottom: 7px !important;
  }

  .purchase-role {
    border: 0 !important;
    border-radius: 9px !important;
    background: var(--blue-soft) !important;
    color: #88c3ff !important;
  }

  .purchase-price strong {
    color: #74e8a8 !important;
  }

  .role-budget-card {
    padding: 11px !important;
  }

  .role-budget-card:nth-child(1) { border-left: 3px solid var(--amber) !important; }
  .role-budget-card:nth-child(2) { border-left: 3px solid var(--blue) !important; }
  .role-budget-card:nth-child(3) { border-left: 3px solid var(--violet) !important; }
  .role-budget-card:nth-child(4) { border-left: 3px solid var(--red) !important; }

  .adaptive-status {
    padding: 13px !important;
    border-left: 3px solid var(--violet) !important;
    background: var(--violet-soft) !important;
  }

  .adaptive-status strong {
    color: #c0b8ff !important;
  }

  .role-tabs {
    gap: 7px !important;
  }

  .role-button {
    min-height: 58px !important;
    border: 1px solid var(--line) !important;
    border-radius: 15px !important;
    background: rgba(17,25,40,.86) !important;
    color: #c9d4e4 !important;
    transition: .16s ease;
  }

  .role-button.active {
    transform: translateY(-1px);
    border-color: rgba(77,163,255,.42) !important;
    background: var(--blue-soft) !important;
    color: #fff !important;
    box-shadow: 0 8px 24px rgba(77,163,255,.10);
  }

  .role-button:nth-child(1).active { border-color: rgba(246,196,83,.5) !important; background: var(--amber-soft) !important; }
  .role-button:nth-child(2).active { border-color: rgba(77,163,255,.5) !important; background: var(--blue-soft) !important; }
  .role-button:nth-child(3).active { border-color: rgba(155,140,255,.5) !important; background: var(--violet-soft) !important; }
  .role-button:nth-child(4).active { border-color: rgba(255,107,122,.5) !important; background: var(--red-soft) !important; }

  input,
  select {
    width: 100%;
    min-height: 46px !important;
    padding: 0 13px !important;
    border: 1px solid var(--line-strong) !important;
    border-radius: 13px !important;
    outline: none !important;
    background: #0c1422 !important;
    color: #f8fafc !important;
    font-size: 14px !important;
    transition: border-color .16s ease, box-shadow .16s ease;
  }

  input:focus,
  select:focus {
    border-color: rgba(77,163,255,.6) !important;
    box-shadow: 0 0 0 3px rgba(77,163,255,.10) !important;
  }

  label {
    display: block;
    margin: 10px 0 6px !important;
    color: #8fa0b6 !important;
    font-size: 8px !important;
    font-weight: 900 !important;
    letter-spacing: .08em !important;
  }

  .primary-button,
  .suggested-target-button {
    min-height: 49px !important;
    border: 0 !important;
    border-radius: 14px !important;
    background: linear-gradient(135deg, #2fd07f, #1aaa67) !important;
    color: #04130c !important;
    font-weight: 950 !important;
    letter-spacing: .025em !important;
    box-shadow: 0 10px 26px rgba(50,213,131,.17) !important;
  }

  .primary-button:active,
  .suggested-target-button:active {
    transform: scale(.985);
  }

  .undo-button {
    min-height: 42px !important;
    border: 1px solid rgba(255,107,122,.22) !important;
    border-radius: 13px !important;
    background: var(--red-soft) !important;
    color: #ff9ca6 !important;
    font-weight: 900 !important;
  }

  .decision-grid,
  .dynamic-info-grid,
  .adaptive-comparison {
    gap: 7px !important;
  }

  .decision-grid > div,
  .dynamic-info-grid > div,
  .adaptive-comparison > div {
    border: 1px solid var(--line) !important;
    border-radius: 13px !important;
    background: rgba(11,18,31,.76) !important;
  }

  .dynamic-main {
    border-color: rgba(50,213,131,.25) !important;
    background: var(--green-soft) !important;
  }

  .decision-box.buy,
  .decision-box.strong-buy,
  .decision-box.good {
    border-color: rgba(50,213,131,.30) !important;
    background: var(--green-soft) !important;
  }

  .decision-box.pass,
  .decision-box.danger,
  .decision-box.stop {
    border-color: rgba(255,107,122,.30) !important;
    background: var(--red-soft) !important;
  }

  .decision-box.wait,
  .decision-box.warning {
    border-color: rgba(246,196,83,.30) !important;
    background: var(--amber-soft) !important;
  }

  .recommendation-score {
    min-width: 78px !important;
    padding: 10px !important;
    border: 1px solid rgba(50,213,131,.25) !important;
    border-radius: 14px !important;
    background: var(--green-soft) !important;
  }

  .recommendation-score strong {
    color: #76edaa !important;
  }

  .recommendation-item {
    padding: 10px !important;
  }

  .recommendation-item:hover {
    border-color: rgba(77,163,255,.30) !important;
    background: rgba(77,163,255,.07) !important;
  }

  .tip,
  .description,
  .recommendation-reason {
    color: #94a3b8 !important;
    line-height: 1.55 !important;
  }

  .message {
    margin-top: 9px !important;
    padding: 11px 12px !important;
    border: 1px solid rgba(77,163,255,.22) !important;
    border-radius: 13px !important;
    background: var(--blue-soft) !important;
    color: #b8d9ff !important;
  }

  /* Barra navigazione: look da app */
  .app-nav {
    position: sticky;
    top: 7px;
    z-index: 60;
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 5px;
    margin-bottom: 15px;
    padding: 6px;
    border: 1px solid var(--line);
    border-radius: 17px;
    background: rgba(9,14,24,.90);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    box-shadow: 0 12px 30px rgba(0,0,0,.22);
  }

  .back-row {
    margin-bottom: 8px;
  }

  .back-button {
    min-height: 38px;
    padding: 0 12px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: rgba(17,25,40,.72);
    color: #9fb0c6;
    font-size: 10px;
    font-weight: 900;
    cursor: pointer;
  }

  .app-nav button {
    min-width: 0;
  }

  .app-nav .nav-caption {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .setup-shell {
    padding-top: max(14px, env(safe-area-inset-top));
  }

  .setup-hero {
    margin-bottom: 14px;
    padding: 20px;
    border: 1px solid rgba(77,163,255,.18);
    border-radius: 24px;
    background:
      radial-gradient(circle at 90% 0%, rgba(77,163,255,.24), transparent 40%),
      radial-gradient(circle at 15% 100%, rgba(155,140,255,.12), transparent 38%),
      linear-gradient(145deg,#111c30,#0b1220);
    box-shadow: var(--shadow);
  }

  .setup-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 9px;
    border: 1px solid rgba(50,213,131,.24);
    border-radius: 999px;
    background: var(--green-soft);
    color: #76edaa;
    font-size: 8px;
    font-weight: 950;
    letter-spacing: .08em;
  }

  .setup-hero h1 {
    margin: 13px 0 7px;
    font-size: clamp(31px, 9vw, 46px);
    line-height: .94;
    letter-spacing: -.045em;
  }

  .setup-hero p {
    margin: 0;
    color: #91a1b7;
    font-size: 12px;
    line-height: 1.55;
  }

  @media (max-width: 520px) {
    .app {
      padding: 10px 10px 105px !important;
    }

    .section {
      padding: 12px !important;
      border-radius: 18px !important;
    }

    .topbar {
      padding: 15px !important;
      border-radius: 19px !important;
    }

    .stats {
      gap: 5px !important;
    }

    .stat {
      padding: 9px 5px !important;
    }

    .stat span {
      font-size: 5.8px !important;
    }

    .stat strong {
      font-size: 15px !important;
    }

    .app-nav {
      gap: 3px;
      padding: 4px;
    }
  }

  /* =========================================================
     MASTER ULTIMATE ONE-SHOT — ALL FEATURES / PERFORMANCE / DESIGN
     Più pulita, moderna e leggibile durante l'asta
     ========================================================= */

  :root {
    --app-bg: #080a0d;
    --app-bg-2: #0c0f14;
    --surface: rgba(16,20,27,.94);
    --surface-2: rgba(20,25,34,.92);
    --surface-3: #161c25;
    --line: rgba(255,255,255,.065);
    --line-strong: rgba(255,255,255,.12);
    --text: #f5f7fb;
    --muted: #8d98a8;

    --green: #42d6a4;
    --green-soft: rgba(66,214,164,.10);

    --blue: #7c9cff;
    --blue-soft: rgba(124,156,255,.11);

    --amber: #f4c970;
    --amber-soft: rgba(244,201,112,.10);

    --red: #ff7387;
    --red-soft: rgba(255,115,135,.10);

    --violet: #a98cff;
    --violet-soft: rgba(169,140,255,.10);

    --radius-xl: 20px;
    --radius-lg: 16px;
    --radius-md: 12px;
    --shadow: 0 18px 50px rgba(0,0,0,.30);
  }

  html {
    background: #080a0d !important;
  }

  body {
    background:
      radial-gradient(circle at 50% -12%, rgba(124,156,255,.11), transparent 31%),
      radial-gradient(circle at 100% 16%, rgba(66,214,164,.045), transparent 23%),
      linear-gradient(180deg, #0a0d12 0%, #080a0d 48%, #06080b 100%) !important;
  }

  .app {
    padding-top: 11px !important;
  }

  /* Header più sobrio: niente effetto "gaming dashboard" */
  .topbar {
    border-color: rgba(255,255,255,.07) !important;
    background:
      radial-gradient(circle at 100% 0%, rgba(124,156,255,.12), transparent 42%),
      linear-gradient(145deg, rgba(20,25,34,.97), rgba(12,15,21,.98)) !important;
    box-shadow: 0 16px 44px rgba(0,0,0,.25) !important;
  }

  .topbar::after {
    background: rgba(124,156,255,.045) !important;
  }

  .eyebrow,
  .small-label {
    color: #7e8999 !important;
  }

  /* Card: superfici più piatte e gerarchia più chiara */
  .section {
    border-color: rgba(255,255,255,.065) !important;
    background:
      linear-gradient(180deg, rgba(17,21,28,.95), rgba(13,17,23,.96)) !important;
    box-shadow:
      0 10px 28px rgba(0,0,0,.16),
      inset 0 1px 0 rgba(255,255,255,.018) !important;
  }

  .main-card,
  .target-card,
  .recommendation-main,
  .role-budget-card {
    border-color: rgba(255,255,255,.07) !important;
    background: rgba(255,255,255,.028) !important;
  }

  .adaptive-status {
    border-color: rgba(169,140,255,.18) !important;
    border-left: 3px solid var(--violet) !important;
    background: rgba(169,140,255,.075) !important;
  }

  /* Titoli senza numeri/badge: tipografia più elegante */
  .section-title {
    gap: 0 !important;
    color: #f1f4f8 !important;
    letter-spacing: .035em !important;
    font-size: 11px !important;
    font-weight: 900 !important;
  }

  .section-title > span {
    min-width: auto !important;
    height: auto !important;
    padding: 4px 7px !important;
    margin-right: 7px !important;
    border-radius: 8px !important;
    border-color: rgba(169,140,255,.16) !important;
    background: rgba(169,140,255,.08) !important;
    color: #c5b6ff !important;
    font-size: 8px !important;
  }

  /* Statistiche: meno "box dentro box" */
  .stats {
    background: transparent !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
  }

  .stat {
    border-color: rgba(255,255,255,.065) !important;
    background: rgba(255,255,255,.028) !important;
  }

  .stat span {
    color: #7f8998 !important;
  }

  .highlight-stat {
    border-color: rgba(66,214,164,.20) !important;
    background: rgba(66,214,164,.085) !important;
  }

  .highlight-stat strong {
    color: #75e6bd !important;
  }

  /* Rosa / budget reparti */
  .roster-summary > div {
    border-color: rgba(255,255,255,.065) !important;
    background: rgba(255,255,255,.027) !important;
  }

  .role-budget-card {
    background: rgba(255,255,255,.025) !important;
  }

  /* Liste giocatori */
  .purchase-row,
  .recommendation-item {
    border-color: rgba(255,255,255,.065) !important;
    background: rgba(255,255,255,.025) !important;
  }

  .purchase-row:hover,
  .recommendation-item:hover {
    border-color: rgba(124,156,255,.20) !important;
    background: rgba(124,156,255,.055) !important;
  }

  .purchase-role {
    background: rgba(124,156,255,.10) !important;
    color: #b7c7ff !important;
  }

  .purchase-price strong {
    color: #75e6bd !important;
  }

  /* Input più "native app" */
  input,
  select {
    min-height: 45px !important;
    border-color: rgba(255,255,255,.10) !important;
    border-radius: 12px !important;
    background: rgba(7,10,14,.72) !important;
    color: #f4f7fb !important;
  }

  input::placeholder {
    color: #667180 !important;
  }

  input:focus,
  select:focus {
    border-color: rgba(124,156,255,.52) !important;
    box-shadow: 0 0 0 3px rgba(124,156,255,.09) !important;
  }

  label {
    color: #818c9b !important;
  }

  /* CTA principali: accent mint */
  .primary-button,
  .suggested-target-button {
    background: linear-gradient(135deg, #62ddb6, #32be94) !important;
    color: #07130f !important;
    box-shadow: 0 9px 24px rgba(50,190,148,.15) !important;
  }

  .recommendation-score {
    border-color: rgba(169,140,255,.20) !important;
    background: rgba(169,140,255,.085) !important;
  }

  .recommendation-score strong {
    color: #c7b8ff !important;
  }

  /* Badge più discreti */
  .setup-badge {
    border-color: rgba(124,156,255,.15) !important;
    background: rgba(124,156,255,.07) !important;
    color: #b9c8ff !important;
    letter-spacing: .055em !important;
  }

  /* Navigazione: pill glass più moderna */
  .app-nav {
    top: 7px;
    gap: 4px;
    padding: 5px;
    border-color: rgba(255,255,255,.075) !important;
    border-radius: 18px !important;
    background: rgba(10,13,18,.84) !important;
    backdrop-filter: blur(22px) saturate(145%) !important;
    -webkit-backdrop-filter: blur(22px) saturate(145%) !important;
    box-shadow:
      0 12px 34px rgba(0,0,0,.28),
      inset 0 1px 0 rgba(255,255,255,.025) !important;
  }

  .app-nav button {
    transition: transform .16s ease, background .16s ease, color .16s ease;
  }

  .app-nav button:active {
    transform: scale(.96);
  }

  .back-button {
    border-color: rgba(255,255,255,.075) !important;
    background: rgba(255,255,255,.03) !important;
    color: #9ba6b5 !important;
  }

  /* Messaggi e decisioni */
  .message {
    border-color: rgba(124,156,255,.17) !important;
    background: rgba(124,156,255,.075) !important;
    color: #c8d4ff !important;
  }

  .decision-grid > div,
  .dynamic-info-grid > div,
  .adaptive-comparison > div {
    border-color: rgba(255,255,255,.06) !important;
    background: rgba(255,255,255,.022) !important;
  }

  .dynamic-main,
  .decision-box.buy,
  .decision-box.strong-buy,
  .decision-box.good {
    border-color: rgba(66,214,164,.20) !important;
    background: rgba(66,214,164,.075) !important;
  }

  .decision-box.pass,
  .decision-box.danger,
  .decision-box.stop {
    border-color: rgba(255,115,135,.20) !important;
    background: rgba(255,115,135,.075) !important;
  }

  .decision-box.wait,
  .decision-box.warning {
    border-color: rgba(244,201,112,.20) !important;
    background: rgba(244,201,112,.075) !important;
  }

  .undo-button {
    border-color: rgba(255,115,135,.17) !important;
    background: rgba(255,115,135,.07) !important;
    color: #ff9baa !important;
  }

  .tip,
  .description,
  .recommendation-reason {
    color: #929cab !important;
  }

  /* Setup coerente col resto dell'app */
  .setup-hero {
    border-color: rgba(255,255,255,.075) !important;
    background:
      radial-gradient(circle at 90% 0%, rgba(124,156,255,.14), transparent 42%),
      radial-gradient(circle at 10% 100%, rgba(66,214,164,.055), transparent 34%),
      linear-gradient(145deg,#151a23,#0d1117) !important;
  }

  /* Micro-interazioni */
  button,
  .main-card,
  .section,
  input,
  select {
    transition:
      border-color .16s ease,
      background .16s ease,
      box-shadow .16s ease,
      transform .16s ease;
  }

  @media (max-width: 520px) {
    .section {
      margin-bottom: 10px !important;
    }

    .app-nav {
      margin-bottom: 11px !important;
    }
  }


  /* =========================================================
     PASSO 40 — MIDNIGHT SPECTRUM
     Palette più varia ma controllata:
     blu notte + cyan + indaco + viola + corallo + ambra + smeraldo
     ========================================================= */

  :root {
    --app-bg: #09101c;
    --app-bg-2: #0d1626;
    --surface: rgba(15,25,42,.94);
    --surface-2: rgba(20,32,52,.94);
    --surface-3: #18273d;
    --line: rgba(154,178,214,.11);
    --line-strong: rgba(174,198,232,.18);
    --text: #f7f9fd;
    --muted: #94a5bc;

    --cyan: #4dd7e8;
    --cyan-soft: rgba(77,215,232,.12);

    --indigo: #7187ff;
    --indigo-soft: rgba(113,135,255,.12);

    --violet: #b083ff;
    --violet-soft: rgba(176,131,255,.12);

    --green: #47d69d;
    --green-soft: rgba(71,214,157,.12);

    --amber: #f2bd5c;
    --amber-soft: rgba(242,189,92,.12);

    --coral: #ff7b72;
    --coral-soft: rgba(255,123,114,.12);

    --rose: #f477a8;
    --rose-soft: rgba(244,119,168,.12);
  }

  html {
    background: #09101c !important;
  }

  body {
    background:
      radial-gradient(circle at 8% -4%, rgba(77,215,232,.13), transparent 25%),
      radial-gradient(circle at 94% 7%, rgba(176,131,255,.14), transparent 27%),
      radial-gradient(circle at 48% 70%, rgba(113,135,255,.055), transparent 32%),
      linear-gradient(180deg,#0b1423 0%,#09101c 48%,#070d17 100%) !important;
  }

  /* Header: cyan -> violet, più riconoscibile */
  .topbar {
    border-color: rgba(121,159,211,.13) !important;
    background:
      radial-gradient(circle at 96% 5%, rgba(176,131,255,.18), transparent 37%),
      radial-gradient(circle at 4% 100%, rgba(77,215,232,.10), transparent 34%),
      linear-gradient(145deg,rgba(20,35,57,.98),rgba(12,21,36,.98)) !important;
    box-shadow: 0 18px 48px rgba(3,8,17,.34) !important;
  }

  .topbar h1 {
    background: linear-gradient(90deg,#ffffff 5%,#dce8ff 48%,#d5c2ff 100%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent !important;
  }

  .eyebrow {
    color: #65d9e7 !important;
  }

  /* Sezioni: alternanza cromatica molto leggera */
  .section {
    border-color: rgba(138,167,207,.10) !important;
    background:
      linear-gradient(180deg,rgba(18,30,49,.96),rgba(13,23,39,.97)) !important;
    box-shadow:
      0 11px 30px rgba(2,7,15,.19),
      inset 0 1px 0 rgba(255,255,255,.025) !important;
  }

  .section:nth-of-type(3n+1) {
    border-top-color: rgba(77,215,232,.23) !important;
  }

  .section:nth-of-type(3n+2) {
    border-top-color: rgba(176,131,255,.22) !important;
  }

  .section:nth-of-type(3n) {
    border-top-color: rgba(71,214,157,.20) !important;
  }

  .section-title {
    color: #f4f7fc !important;
  }

  /* Badge semantici */
  .section-title > span,
  .setup-badge {
    border-color: rgba(113,135,255,.20) !important;
    background: rgba(113,135,255,.10) !important;
    color: #bfc9ff !important;
  }

  /* Superfici secondarie */
  .main-card,
  .target-card,
  .recommendation-main,
  .role-budget-card,
  .purchase-row,
  .recommendation-item,
  .roster-summary > div {
    border-color: rgba(141,169,208,.095) !important;
    background: rgba(22,36,58,.72) !important;
  }

  .main-card:nth-child(3n+1) {
    box-shadow: inset 2px 0 0 rgba(77,215,232,.16);
  }

  .main-card:nth-child(3n+2) {
    box-shadow: inset 2px 0 0 rgba(176,131,255,.15);
  }

  .main-card:nth-child(3n) {
    box-shadow: inset 2px 0 0 rgba(71,214,157,.14);
  }

  /* Budget / valori economici = verde smeraldo */
  .highlight-stat {
    border-color: rgba(71,214,157,.25) !important;
    background:
      linear-gradient(145deg,rgba(71,214,157,.14),rgba(71,214,157,.065)) !important;
  }

  .highlight-stat strong,
  .purchase-price strong {
    color: #69e5b0 !important;
  }

  /* Score / suggerimento specifico = viola */
  .recommendation-score {
    border-color: rgba(176,131,255,.28) !important;
    background:
      linear-gradient(145deg,rgba(176,131,255,.17),rgba(113,135,255,.09)) !important;
  }

  .recommendation-score span {
    color: #b9a3e8 !important;
  }

  .recommendation-score strong {
    color: #d3bdff !important;
  }

  /* Ruolo = cyan */
  .purchase-role {
    border: 1px solid rgba(77,215,232,.19) !important;
    background: rgba(77,215,232,.10) !important;
    color: #8ce9f3 !important;
  }

  /* Strategia = indaco/viola */
  .adaptive-status {
    border-color: rgba(176,131,255,.22) !important;
    border-left: 3px solid #a77cf5 !important;
    background:
      linear-gradient(90deg,rgba(176,131,255,.11),rgba(113,135,255,.055)) !important;
  }

  /* Campi: blu profondo con focus cyan */
  input,
  select {
    border-color: rgba(139,169,209,.15) !important;
    background: rgba(8,17,30,.80) !important;
    color: #f6f8fc !important;
  }

  input:focus,
  select:focus {
    border-color: rgba(77,215,232,.56) !important;
    box-shadow: 0 0 0 3px rgba(77,215,232,.10) !important;
  }

  input::placeholder {
    color: #667d99 !important;
  }

  label {
    color: #8fa2bb !important;
  }

  /* Azione primaria = cyan brillante */
  .primary-button,
  .suggested-target-button {
    background: linear-gradient(135deg,#61deeb,#39bdcf) !important;
    color: #07151a !important;
    box-shadow: 0 10px 26px rgba(57,189,207,.18) !important;
  }

  .primary-button:hover,
  .suggested-target-button:hover {
    box-shadow: 0 12px 30px rgba(57,189,207,.25) !important;
  }

  /* Stati semantici */
  .decision-box.buy,
  .decision-box.strong-buy,
  .decision-box.good,
  .dynamic-main {
    border-color: rgba(71,214,157,.25) !important;
    background: rgba(71,214,157,.10) !important;
  }

  .decision-box.buy strong,
  .decision-box.strong-buy strong,
  .decision-box.good strong {
    color: #6ce6b3 !important;
  }

  .decision-box.wait,
  .decision-box.warning {
    border-color: rgba(242,189,92,.25) !important;
    background: rgba(242,189,92,.10) !important;
  }

  .decision-box.wait strong,
  .decision-box.warning strong {
    color: #f5ca78 !important;
  }

  .decision-box.pass,
  .decision-box.danger,
  .decision-box.stop {
    border-color: rgba(255,123,114,.25) !important;
    background: rgba(255,123,114,.10) !important;
  }

  .decision-box.pass strong,
  .decision-box.danger strong,
  .decision-box.stop strong {
    color: #ff9a92 !important;
  }

  .undo-button {
    border-color: rgba(244,119,168,.23) !important;
    background: rgba(244,119,168,.09) !important;
    color: #f8a2c4 !important;
  }

  /* Messaggi = indaco */
  .message {
    border-color: rgba(113,135,255,.23) !important;
    background: rgba(113,135,255,.095) !important;
    color: #c8d0ff !important;
  }

  /* Avvisi */
  .danger {
    color: #ff958d !important;
  }

  .positive {
    color: #6ce6b3 !important;
  }

  .neutral {
    color: #a8b8ce !important;
  }

  /* Tabelle e mini-box */
  .stat,
  .decision-grid > div,
  .dynamic-info-grid > div,
  .adaptive-comparison > div {
    border-color: rgba(139,169,209,.10) !important;
    background: rgba(19,32,52,.70) !important;
  }

  .stat span {
    color: #8296b0 !important;
  }

  /* Nav: ogni tab ha un'identità cromatica leggera */
  .app-nav {
    border-color: rgba(139,169,209,.13) !important;
    background: rgba(9,17,29,.88) !important;
    box-shadow:
      0 13px 36px rgba(2,7,15,.35),
      inset 0 1px 0 rgba(255,255,255,.03) !important;
  }

  .app-nav button:nth-child(1) span:first-child { color: #5bdce9; }
  .app-nav button:nth-child(2) span:first-child { color: #6fe2ae; }
  .app-nav button:nth-child(3) span:first-child { color: #ff95c8; }
  .app-nav button:nth-child(4) span:first-child { color: #b797ff; }
  .app-nav button:nth-child(5) span:first-child { color: #f1c66e; }
  .app-nav button:nth-child(6) span:first-child { color: #8fa7bd; }

  .app-nav button:hover {
    background: rgba(113,135,255,.07) !important;
  }

  /* Setup iniziale */
  .setup-hero {
    border-color: rgba(139,169,209,.13) !important;
    background:
      radial-gradient(circle at 90% 0%,rgba(176,131,255,.19),transparent 39%),
      radial-gradient(circle at 8% 100%,rgba(77,215,232,.12),transparent 35%),
      linear-gradient(145deg,#16263d,#0b1525) !important;
  }

  /* Testi secondari */
  .tip,
  .description,
  .recommendation-reason {
    color: #98a8bc !important;
  }

  .small-label {
    color: #8194ae !important;
  }

  /* Back button neutro */
  .back-button {
    border-color: rgba(139,169,209,.13) !important;
    background: rgba(19,32,52,.72) !important;
    color: #a9bad0 !important;
  }


  /* PASSO 41 — MY TEAM */
  .app-nav .nav-caption {
    font-size: 7px;
    letter-spacing: .025em;
  }

  @media (max-width: 520px) {
    .app-nav {
      gap: 2px !important;
      padding: 4px !important;
    }

    .app-nav button {
      min-width: 0 !important;
      padding-left: 2px !important;
      padding-right: 2px !important;
    }

    .app-nav .nav-caption {
      font-size: 6.5px !important;
    }
  }


  /* PASSO 42A — Offline / update center */
  button:disabled {
    opacity: .48 !important;
    cursor: not-allowed !important;
    box-shadow: none !important;
  }

  @keyframes updateSpin {
    to { transform: rotate(360deg); }
  }


  /* FINAL DESIGN — LIGHT VIBRANT */
  :root {
    color-scheme: light;
    --app-bg: #f4f8ff;
    --app-bg-2: #eef4ff;
    --surface: rgba(255,255,255,.94);
    --surface-2: rgba(249,251,255,.96);
    --surface-3: #ffffff;
    --line: rgba(49,76,135,.13);
    --line-strong: rgba(49,76,135,.22);
    --text: #14213d;
    --muted: #64748b;
  }
  html { background: #f4f8ff !important; }
  body { background: radial-gradient(circle at 8% 0%,rgba(0,194,255,.18),transparent 28%), radial-gradient(circle at 96% 10%,rgba(139,92,246,.16),transparent 30%), radial-gradient(circle at 50% 100%,rgba(255,183,3,.12),transparent 30%), linear-gradient(180deg,#f8fbff,#eef5ff) !important; color:#14213d !important; }
  .app { color:#14213d !important; }
  .topbar { background: linear-gradient(135deg,#ffffff 0%,#eef8ff 48%,#f5efff 100%) !important; border-color:rgba(58,102,190,.16) !important; box-shadow:0 16px 42px rgba(58,91,150,.12) !important; }
  .topbar h1 { background:linear-gradient(90deg,#087fdb,#6d42df,#e93f93) !important; -webkit-background-clip:text !important; background-clip:text !important; color:transparent !important; }
  .eyebrow { color:#087fdb !important; }
  .section { background:rgba(255,255,255,.91) !important; border-color:rgba(58,91,150,.12) !important; box-shadow:0 10px 30px rgba(70,94,140,.09) !important; }
  .section:nth-of-type(3n+1){border-top:3px solid #25b8e8 !important}.section:nth-of-type(3n+2){border-top:3px solid #8b5cf6 !important}.section:nth-of-type(3n){border-top:3px solid #ffb703 !important}
  .section-title,.main-card strong,.target-card strong,.purchase-player strong { color:#14213d !important; }
  .main-card,.target-card,.recommendation-main,.role-budget-card,.purchase-row,.recommendation-item,.roster-summary>div { background:linear-gradient(145deg,rgba(255,255,255,.98),rgba(245,249,255,.96)) !important; border-color:rgba(58,91,150,.12) !important; box-shadow:none !important; }
  .stat,.decision-grid>div,.dynamic-info-grid>div,.adaptive-comparison>div { background:#f4f8ff !important; border-color:rgba(58,91,150,.12) !important; }
  .stat span,.small-label,label { color:#64748b !important; }
  .stat strong { color:#172554 !important; }
  .highlight-stat { background:linear-gradient(135deg,#dffbf0,#e9fff6) !important; border-color:rgba(16,185,129,.22) !important; }
  .highlight-stat strong { color:#07875e !important; }
  .recommendation-score { background:linear-gradient(135deg,#efe8ff,#e8f1ff) !important; border-color:rgba(124,58,237,.20) !important; }
  .recommendation-score strong { color:#6d28d9 !important; }
  .tip,.description,.recommendation-reason { color:#5d6b82 !important; }
  input,select,textarea { background:#ffffff !important; color:#14213d !important; border-color:rgba(58,91,150,.18) !important; }
  input::placeholder,textarea::placeholder { color:#94a3b8 !important; }
  input:focus,select:focus,textarea:focus { border-color:#22aee8 !important; box-shadow:0 0 0 3px rgba(34,174,232,.12) !important; }
  .primary-button,.suggested-target-button { background:linear-gradient(135deg,#13c7e8,#3478f6,#7c3aed) !important; color:white !important; box-shadow:0 10px 24px rgba(52,120,246,.20) !important; }
  .app-nav { background:rgba(255,255,255,.94) !important; border-color:rgba(58,91,150,.13) !important; box-shadow:0 12px 34px rgba(70,94,140,.14) !important; }
  .app-nav button { color:#52617a !important; }
  .app-nav button[style*="rgba"] { color:#14213d !important; }
  .setup-badge,.purchase-role { background:#eaf4ff !important; color:#1769c2 !important; border-color:rgba(23,105,194,.16) !important; }
  .message { background:#edf2ff !important; color:#3949ab !important; }
  .back-button { background:#f4f7fb !important; color:#52617a !important; }


  /* MASTER ULTIMATE DESIGN — HIGH CONTRAST AUCTION UI */
  :root {
    color-scheme: dark;
    --app-bg:#07111f;
    --app-bg-2:#0b1728;
    --surface:#101d30;
    --surface-2:#14243a;
    --surface-3:#182b44;
    --line:#314864;
    --line-strong:#496887;
    --text:#f7fbff;
    --muted:#b4c2d3;
  }
  html { background:#07111f !important; }
  body {
    background:
      radial-gradient(circle at 10% 0%,rgba(25,157,218,.18),transparent 30%),
      radial-gradient(circle at 95% 8%,rgba(119,76,220,.14),transparent 28%),
      linear-gradient(180deg,#07111f 0%,#0a1627 55%,#07111f 100%) !important;
    color:#f7fbff !important;
  }
  .app { color:#f7fbff !important; }
  .topbar {
    background:linear-gradient(135deg,#10243a,#132a45 58%,#1c2544) !important;
    border:1px solid #36516f !important;
    box-shadow:0 14px 36px rgba(0,0,0,.28) !important;
  }
  .topbar h1 {
    background:none !important;
    -webkit-background-clip:initial !important;
    background-clip:initial !important;
    color:#ffffff !important;
    text-shadow:0 1px 12px rgba(72,190,255,.18);
  }
  .eyebrow { color:#70d7ff !important; }
  .section {
    background:#0e1b2d !important;
    border:1px solid #2b425e !important;
    box-shadow:0 8px 24px rgba(0,0,0,.18) !important;
  }
  .section:nth-of-type(3n+1){border-top:3px solid #32c7f2 !important}
  .section:nth-of-type(3n+2){border-top:3px solid #9c7cff !important}
  .section:nth-of-type(3n){border-top:3px solid #f4c95d !important}
  .section-title,.main-card strong,.target-card strong,.purchase-player strong { color:#ffffff !important; }
  .main-card,.target-card,.recommendation-main,.role-budget-card,.purchase-row,.recommendation-item,.roster-summary>div {
    background:#14243a !important;
    border-color:#334d6a !important;
    box-shadow:none !important;
  }
  .stat,.decision-grid>div,.dynamic-info-grid>div,.adaptive-comparison>div {
    background:#0c192a !important;
    border-color:#304963 !important;
  }
  .stat span,.small-label,label { color:#b8c6d8 !important; }
  .stat strong { color:#ffffff !important; }
  .highlight-stat { background:#10352f !important; border-color:#2b7b67 !important; }
  .highlight-stat strong { color:#82f0c2 !important; }
  .recommendation-score { background:#24204a !important; border-color:#6656aa !important; }
  .recommendation-score strong { color:#c8baff !important; }
  .tip,.description,.recommendation-reason { color:#c2cede !important; }
  input,select,textarea {
    background:#091727 !important;
    color:#ffffff !important;
    border:1px solid #48627e !important;
  }
  input::placeholder,textarea::placeholder { color:#8295ab !important; }
  input:focus,select:focus,textarea:focus { border-color:#52c8f5 !important; box-shadow:0 0 0 3px rgba(82,200,245,.16) !important; }
  .primary-button,.suggested-target-button {
    background:linear-gradient(135deg,#087fb5,#316be0) !important;
    color:#ffffff !important;
    border-color:#5ba7e8 !important;
    box-shadow:0 8px 20px rgba(20,103,196,.24) !important;
  }
  .back-button { background:#17283d !important; color:#eaf3ff !important; border-color:#405b77 !important; }
  .app-nav { background:#0b1728 !important; border-color:#334b66 !important; box-shadow:0 10px 30px rgba(0,0,0,.30) !important; }
  .app-nav button { color:#b8c7d9 !important; }
  .app-nav button[style*="rgba"] { color:#ffffff !important; background:#1b314b !important; }
  .setup-badge,.purchase-role { background:#123654 !important; color:#8edcff !important; border-color:#315f7e !important; }
  .message { background:#17284a !important; color:#dce7ff !important; border-color:#405c91 !important; }
  small,p,span { text-rendering:optimizeLegibility; }
  small { color:#aebed0; }
  [style*="color: '#78859b'"],[style*="color: '#68758d'"],[style*="color: '#64748b'"],[style*="color: '#a8b1c2'"] { color:#b9c7d8 !important; }
  [style*="background: '#0b111e'"] { background:#0b1829 !important; border-color:#334d69 !important; }
  [style*="background: '#10251d'"] { background:#123328 !important; }
  [style*="border: '1px solid #273149'"] { border-color:#334d69 !important; }
  button { -webkit-tap-highlight-color:transparent; }
  button:active { transform:translateY(1px); }


  /* FINAL ONE-SHOT: contrasto + mobile + touch */
  html, body, #root { min-height: 100%; background: #08111f !important; }
  body { color: #f8fafc !important; text-rendering: optimizeLegibility; }
  button, input, select, textarea { font: inherit; }
  button { min-height: 44px; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
  input, select, textarea {
    background: #0f1c2e !important;
    color: #f8fafc !important;
    border: 1px solid #38506d !important;
  }
  input::placeholder, textarea::placeholder { color: #aebdd0 !important; opacity: 1 !important; }
  select option { background: #0f1c2e; color: #f8fafc; }
  .main-card, .mini-card, .section, .player-row, .team-card, .rival-card {
    color: #f8fafc !important;
    border-color: #304863 !important;
  }
  .primary-button {
    background: #2563eb !important;
    color: #fff !important;
    border-color: #5b8df5 !important;
    font-weight: 800 !important;
  }
  .back-button {
    background: #17283d !important;
    color: #f8fafc !important;
    border-color: #46617f !important;
    font-weight: 700 !important;
  }
  .eyebrow { color: #b8c7da !important; }
  @media (max-width: 760px) {
    .app { padding-left: 10px !important; padding-right: 10px !important; }
    button, input, select { min-height: 46px; }
    h1 { line-height: 1.12 !important; }
    h2, h3 { line-height: 1.18 !important; }
  }
  /* FINAL CLEAN UI — meno ridondanza, più leggibilità */
.section { margin-bottom: 10px !important; }
.main-card + .main-card { margin-top: 7px; }
.app-nav { position: sticky; bottom: 8px; z-index: 60; }
.stat span { letter-spacing: .06em; }
@media (max-width: 760px) {
  .section { padding: 11px 10px !important; }
  .main-card { padding: 11px !important; }
  .app-nav { gap: 5px !important; }
}

/* ASTA TONIGHT — leggibilità e densità controllata */
@media (max-width: 760px) {
  .recommendation-score { min-width: 62px; }
  .tip { font-size: 12px !important; line-height: 1.48 !important; }
  .stat strong { font-size: 14px; }
}

@media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: .01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: .01ms !important;
      scroll-behavior: auto !important;
    }
  }

`


/* ========================================================================
   FANTACALCIO WAR ROOM 2026/27 — ENGINE V2
   Unico layer compatibile: nessun dato inventato, null => N/D.
   Le funzioni sono esportate per restare modulari/testabili senza rompere
   l'App esistente e senza obbligare a cambiare la struttura del progetto.
   ======================================================================== */

export type DataQuality = 'HIGH' | 'MEDIUM' | 'LOW'
export type TrendV2 = 'RISING' | 'STABLE' | 'FALLING'
export type FreshnessBadge = 'LIVE' | 'OGGI' | '1g' | '3g' | 'STALE' | 'N/D'

export type AuditValue<T> = {
  value: T | null
  source?: string | null
  sourceUrl?: string | null
  updatedAt?: string | null
  confidence?: number | null
  quality?: DataQuality | null
}

export type FantasyScoringV2 = {
  goal: number
  assist: number
  yellow: number
  red: number
  ownGoal: number
  penaltyMissed: number
  penaltySaved: number
  goalkeeperGoalConceded: number
}

export const DEFAULT_FANTASY_SCORING_V2: FantasyScoringV2 = {
  goal: 3,
  assist: 1,
  yellow: -0.5,
  red: -1,
  ownGoal: -2,
  penaltyMissed: -3,
  penaltySaved: 3,
  goalkeeperGoalConceded: -1,
}

export type RatingExplanationV2 = {
  score: number | null
  confidence: number
  quality: DataQuality
  components: Array<{ label: string; contribution: number; reason: string }>
  formula: string
}

export type PlayerProjectionV2 = {
  titolarita: number | null
  xMin: number | null
  pGoal: number | null
  pAssist: number | null
  pBonus: number | null
  pCard: number | null
  pCleanSheet: number | null
  xFP: number | null
  form: number | null
  consistency: number | null
  upside: number | null
  risk: number | null
  value: number | null
  vorp: number | null
  fdr: number | null
  overall: number | null
  confidence: number
  quality: DataQuality
}

export type ChangeSeverityV2 = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
export type DatasetChangeV2 = {
  playerId: string
  field: string
  oldValue: unknown
  newValue: unknown
  severity: ChangeSeverityV2
}

export const WARROOM_MODEL_VERSION = '2.0.0'
export const WARROOM_SCHEMA_VERSION = '2.0'

export const WARROOM_STORAGE_V2 = {
  settings: 'fantawarroom_v2_settings',
  auction: 'fantawarroom_v2_auction',
  userPlayers: 'fantawarroom_v2_userPlayers',
  watchlist: 'fantawarroom_v2_watchlist',
  backup: 'fantawarroom_v2_backup',
  sourceData: 'fantawarroom_v2_sourceData',
  history: 'fantawarroom_v2_history',
  changelog: 'fantawarroom_v2_changelog',
} as const

export function normalizeSearchV2(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’'`´]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function stablePlayerIdV2(player: { id?: string | null; name?: string | null; team?: string | null; role?: string | null }) {
  if (player.id?.trim()) return player.id.trim()
  const raw = `${normalizeSearchV2(player.name)}|${normalizeSearchV2(player.team)}|${player.role ?? ''}`
  let hash = 2166136261
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `legacy_${(hash >>> 0).toString(36)}`
}

export function clampV2(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value))
}

export function safeNumberV2(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return value
}

export function per90V2(total: number | null | undefined, minutes: number | null | undefined) {
  if (total == null || minutes == null || minutes <= 0) return null
  return total * 90 / minutes
}

export function shrinkMetricV2(
  playerMetric: number | null | undefined,
  roleAverage: number | null | undefined,
  minutes: number | null | undefined,
) {
  if (playerMetric == null) return roleAverage ?? null
  if (roleAverage == null) return playerMetric
  const mins = Math.max(0, minutes ?? 0)
  const weight = mins / (mins + 900)
  return weight * playerMetric + (1 - weight) * roleAverage
}

export function weightedFormIndexV2(values: Array<number | null | undefined>) {
  const weights = [0.35, 0.25, 0.18, 0.13, 0.09]
  const valid = values.slice(0, 5).map((v, i) => v == null ? null : { value: v, weight: weights[i] })
    .filter((x): x is { value: number; weight: number } => x !== null)
  if (!valid.length) return null
  const weighted = valid.reduce((sum, x) => sum + x.value * x.weight, 0)
  const weightSum = valid.reduce((sum, x) => sum + x.weight, 0)
  return clampV2(weighted / weightSum)
}

export function titolaritaIndexV2(input: {
  nextMatchProbability?: number | null
  seasonStartRate?: number | null
  recentStartRate?: number | null
  expectedMinutesScore?: number | null
  competitionScore?: number | null
  injuryPenalty?: number | null
  turnoverPenalty?: number | null
  competitionPenalty?: number | null
}) {
  const parts: Array<[number | null | undefined, number]> = [
    [input.nextMatchProbability, .35],
    [input.seasonStartRate, .25],
    [input.recentStartRate, .15],
    [input.expectedMinutesScore, .15],
    [input.competitionScore, .10],
  ]
  const valid = parts.filter(([v]) => v != null) as Array<[number, number]>
  if (!valid.length) return null
  const base = valid.reduce((s, [v, w]) => s + v * w, 0) / valid.reduce((s, [, w]) => s + w, 0)
  const penalty = (input.injuryPenalty ?? 0) + (input.turnoverPenalty ?? 0) + (input.competitionPenalty ?? 0)
  return clampV2(base - penalty)
}

export function expectedMinutesV2(input: {
  pStart?: number | null
  avgMinutesStarter?: number | null
  pSubIn?: number | null
  avgMinutesSub?: number | null
}) {
  const { pStart, avgMinutesStarter, pSubIn, avgMinutesSub } = input
  if (pStart == null || avgMinutesStarter == null) return null
  const ps = clampV2(pStart, 0, 100) / 100
  const psi = clampV2(pSubIn ?? 0, 0, 100) / 100
  const sub = avgMinutesSub ?? 0
  return clampV2(ps * avgMinutesStarter + (1 - ps) * psi * sub, 0, 90)
}

export function poissonAtLeastOneV2(lambda: number | null | undefined) {
  if (lambda == null || lambda < 0 || !Number.isFinite(lambda)) return null
  return clampV2(1 - Math.exp(-lambda), 0, 1)
}

export function goalProbabilityV2(input: {
  xG90?: number | null
  xMin?: number | null
  opponentAdjustment?: number | null
  penaltyExpectation?: number | null
}) {
  if (input.xG90 == null || input.xMin == null) return null
  const lambda = Math.max(0, input.xG90) * clampV2(input.xMin, 0, 90) / 90 *
    Math.max(0, input.opponentAdjustment ?? 1) + Math.max(0, input.penaltyExpectation ?? 0)
  return poissonAtLeastOneV2(lambda)
}

export function assistProbabilityV2(input: {
  xA90?: number | null
  xMin?: number | null
  opponentAdjustment?: number | null
}) {
  if (input.xA90 == null || input.xMin == null) return null
  const lambda = Math.max(0, input.xA90) * clampV2(input.xMin, 0, 90) / 90 *
    Math.max(0, input.opponentAdjustment ?? 1)
  return poissonAtLeastOneV2(lambda)
}

export function expectedFantasyPointsV2(input: {
  expectedBaseVote?: number | null
  pGoal?: number | null
  pAssist?: number | null
  pCleanSheet?: number | null
  pPenaltySave?: number | null
  pYellow?: number | null
  pRed?: number | null
  pOwnGoal?: number | null
  pPenaltyMiss?: number | null
  expectedGoalsConceded?: number | null
  scoring?: FantasyScoringV2
}) {
  if (input.expectedBaseVote == null) return null
  const s = input.scoring ?? DEFAULT_FANTASY_SCORING_V2
  let result = input.expectedBaseVote
  if (input.pGoal != null) result += input.pGoal * s.goal
  if (input.pAssist != null) result += input.pAssist * s.assist
  if (input.pPenaltySave != null) result += input.pPenaltySave * s.penaltySaved
  if (input.pYellow != null) result += input.pYellow * s.yellow
  if (input.pRed != null) result += input.pRed * s.red
  if (input.pOwnGoal != null) result += input.pOwnGoal * s.ownGoal
  if (input.pPenaltyMiss != null) result += input.pPenaltyMiss * s.penaltyMissed
  if (input.expectedGoalsConceded != null) result += input.expectedGoalsConceded * s.goalkeeperGoalConceded
  return Math.round(result * 100) / 100
}

export function teamExpectedGoalsV2(attackStrength: number | null, opponentDefenseStrength: number | null, home = false) {
  if (attackStrength == null || opponentDefenseStrength == null) return null
  const attack = clampV2(attackStrength) / 50
  const defenseWeakness = (100 - clampV2(opponentDefenseStrength)) / 50
  const homeFactor = home ? 1.10 : 1
  return clampV2(1.25 * attack * Math.max(.35, defenseWeakness) * homeFactor, 0.05, 4.5)
}

export function cleanSheetProbabilityV2(lambdaOpponentGoals: number | null | undefined) {
  if (lambdaOpponentGoals == null || lambdaOpponentGoals < 0) return null
  return clampV2(Math.exp(-lambdaOpponentGoals), 0, 1)
}

export function fixtureDifficultyV2(input: {
  opponentPower?: number | null
  opponentAttack?: number | null
  opponentDefense?: number | null
  away?: boolean
  formAdjustment?: number | null
  absenceAdjustment?: number | null
}) {
  const vals = [input.opponentPower, input.opponentAttack, input.opponentDefense].filter((v): v is number => v != null)
  if (!vals.length) return null
  const base = vals.reduce((a, b) => a + b, 0) / vals.length
  return clampV2(base + (input.away ? 5 : -3) + (input.formAdjustment ?? 0) + (input.absenceAdjustment ?? 0))
}

export function consistencyIndexV2(input: {
  fantasyStdDev?: number | null
  sufficientPct?: number | null
  votePct?: number | null
  minutesContinuity?: number | null
}) {
  const pieces: number[] = []
  if (input.fantasyStdDev != null) pieces.push(clampV2(100 - input.fantasyStdDev * 18))
  if (input.sufficientPct != null) pieces.push(clampV2(input.sufficientPct))
  if (input.votePct != null) pieces.push(clampV2(input.votePct))
  if (input.minutesContinuity != null) pieces.push(clampV2(input.minutesContinuity))
  return pieces.length ? pieces.reduce((a, b) => a + b, 0) / pieces.length : null
}

export function riskIndexV2(input: {
  rotation?: number | null
  injury?: number | null
  competition?: number | null
  discipline?: number | null
  volatility?: number | null
  market?: number | null
  europe?: number | null
  tactical?: number | null
}) {
  const weighted: Array<[number | null | undefined, number]> = [
    [input.rotation, .25], [input.injury, .20], [input.competition, .15],
    [input.discipline, .10], [input.volatility, .10], [input.market, .10],
    [input.europe, .05], [input.tactical, .05],
  ]
  const valid = weighted.filter(([v]) => v != null) as Array<[number, number]>
  if (!valid.length) return null
  return clampV2(valid.reduce((s, [v, w]) => s + clampV2(v) * w, 0) / valid.reduce((s, [, w]) => s + w, 0))
}

export function upsideIndexV2(input: {
  ageScore?: number | null
  xGiScore?: number | null
  offensiveRole?: number | null
  starterGrowth?: number | null
  transferImpact?: number | null
  setPieces?: number | null
  trend?: number | null
}) {
  const values = Object.values(input).filter((v): v is number => v != null)
  return values.length ? clampV2(values.reduce((a, b) => a + clampV2(b), 0) / values.length) : null
}

export function vorpV2(projectedSeasonValue: number | null, replacementLevelValue: number | null) {
  if (projectedSeasonValue == null || replacementLevelValue == null) return null
  return projectedSeasonValue - replacementLevelValue
}

export function scarcityIndexV2(input: {
  topPlayersLeft: number
  managersNeedingRole: number
  totalMissingSlots: number
  rivalBudgetPressure: number
}) {
  const supplyPressure = input.managersNeedingRole <= 0 ? 0 :
    clampV2((input.managersNeedingRole / Math.max(1, input.topPlayersLeft)) * 35)
  const slots = clampV2(input.totalMissingSlots * 4)
  const budget = clampV2(input.rivalBudgetPressure)
  return clampV2(supplyPressure + slots * .25 + budget * .4)
}

export function auctionInflationV2(actualSpend: number, expectedSpend: number) {
  if (expectedSpend <= 0) return 1
  return clampV2(actualSpend / expectedSpend, .5, 2)
}

export function personalMaxV2(input: {
  baseAuctionValue: number
  inflationFactor?: number
  scarcityFactor?: number
  needFactor?: number
  fitFactor?: number
  budgetSafetyFactor?: number
  budgetRemaining: number
  slotsRemaining: number
}) {
  const raw = input.baseAuctionValue *
    (input.inflationFactor ?? 1) *
    (input.scarcityFactor ?? 1) *
    (input.needFactor ?? 1) *
    (input.fitFactor ?? 1) *
    (input.budgetSafetyFactor ?? 1)
  const reserveCredits = Math.max(0, input.slotsRemaining - 1)
  const maxSpend = Math.max(0, input.budgetRemaining - reserveCredits)
  return Math.max(0, Math.min(Math.round(raw), maxSpend))
}

export function valueIndexV2(input: {
  projectedValue?: number | null
  vorp?: number | null
  expectedPrice?: number | null
  risk?: number | null
  upside?: number | null
}) {
  if (input.projectedValue == null || input.expectedPrice == null || input.expectedPrice <= 0) return null
  const efficiency = clampV2((input.projectedValue / input.expectedPrice) * 50)
  const vorp = input.vorp == null ? 50 : clampV2(50 + input.vorp)
  const riskAdj = input.risk == null ? 50 : 100 - clampV2(input.risk)
  const upside = input.upside == null ? 50 : clampV2(input.upside)
  return clampV2(efficiency * .45 + vorp * .25 + riskAdj * .15 + upside * .15)
}

export function overallRatingV2(role: Role, input: {
  bonus?: number | null
  xFP?: number | null
  titolarita?: number | null
  consistency?: number | null
  fixture?: number | null
  upside?: number | null
  risk?: number | null
  setPieces?: number | null
  cleanSheet?: number | null
  teamDefense?: number | null
  saveQuality?: number | null
  rotationValue?: number | null
}): RatingExplanationV2 {
  const normalizedXfp = input.xFP == null ? null : clampV2(input.xFP * 12)
  const fixtureEase = input.fixture == null ? null : 100 - clampV2(input.fixture)
  const riskAdj = input.risk == null ? null : 100 - clampV2(input.risk)
  const configs: Record<Role, Array<[string, number | null | undefined, number]>> = {
    A: [['Bonus', input.bonus, .30], ['xFP', normalizedXfp, .20], ['Titolarità', input.titolarita, .15],
        ['Consistency', input.consistency, .10], ['Calendario', fixtureEase, .10], ['Upside', input.upside, .10], ['Rischio', riskAdj, .05]],
    C: [['Bonus', input.bonus, .25], ['xFP', normalizedXfp, .20], ['Titolarità', input.titolarita, .15],
        ['Piazzati', input.setPieces, .10], ['Consistency', input.consistency, .10], ['Calendario', fixtureEase, .10],
        ['Upside/Risk', input.upside != null && riskAdj != null ? (input.upside + riskAdj) / 2 : input.upside ?? riskAdj, .10]],
    D: [['xFP', normalizedXfp, .20], ['Titolarità', input.titolarita, .20], ['Clean sheet', input.cleanSheet, .15],
        ['Bonus', input.bonus, .15], ['Consistency', input.consistency, .10], ['Calendario', fixtureEase, .10], ['Rischio', riskAdj, .10]],
    P: [['Difesa squadra', input.teamDefense, .25], ['Qualità parate', input.saveQuality, .20], ['Clean sheet', input.cleanSheet, .20],
        ['Calendario', fixtureEase, .15], ['Titolarità', input.titolarita, .10], ['Rotazione', input.rotationValue, .10]],
  }
  const valid = configs[role].filter(([, v]) => v != null) as Array<[string, number, number]>
  if (!valid.length) return { score: null, confidence: 0, quality: 'LOW', components: [], formula: `Overall ${role}: dati insufficienti` }
  const usedWeight = valid.reduce((s, [, , w]) => s + w, 0)
  const score = clampV2(valid.reduce((s, [, v, w]) => s + clampV2(v) * w, 0) / usedWeight)
  const confidence = clampV2(usedWeight * 100)
  const quality: DataQuality = confidence >= 80 ? 'HIGH' : confidence >= 55 ? 'MEDIUM' : 'LOW'
  return {
    score: Math.round(score),
    confidence: Math.round(confidence),
    quality,
    components: valid.map(([label, value, weight]) => ({
      label,
      contribution: Math.round((value * weight / usedWeight) * 10) / 10,
      reason: `${label}: ${Math.round(value)}/100`,
    })),
    formula: `Media pesata per ruolo ${role}; pesi rinormalizzati solo sui dati realmente disponibili.`,
  }
}

export function freshnessBadgeV2(updatedAt: string | null | undefined, staleHours: number): FreshnessBadge {
  if (!updatedAt) return 'N/D'
  const time = new Date(updatedAt).getTime()
  if (!Number.isFinite(time)) return 'N/D'
  const hours = Math.max(0, (Date.now() - time) / 3_600_000)
  if (hours <= 1) return 'LIVE'
  if (hours < 24) return 'OGGI'
  if (hours < 48) return '1g'
  if (hours < 96 && hours <= staleHours) return '3g'
  return hours > staleHours ? 'STALE' : '3g'
}

export const DATASET_STALE_HOURS_V2 = {
  quotations: 48,
  injuries: 12,
  lineups: 12,
  news: 24,
  stats: 48,
  fixtures: 168,
  market: 24,
} as const

export function classifyChangeV2(field: string, oldValue: unknown, newValue: unknown): ChangeSeverityV2 {
  const f = field.toLowerCase()
  if (['role', 'outofseriea', 'severeinjury'].some(x => f.includes(x))) return 'CRITICAL'
  if (['team', 'penalty', 'starter', 'titolar'].some(x => f.includes(x))) return 'HIGH'
  if (['fvm', 'rating', 'quotation', 'quote'].some(x => f.includes(x))) {
    if (typeof oldValue === 'number' && typeof newValue === 'number' && oldValue !== 0) {
      const delta = Math.abs((newValue - oldValue) / oldValue)
      return delta > .15 ? 'HIGH' : delta >= .05 ? 'MEDIUM' : 'LOW'
    }
    return 'MEDIUM'
  }
  return 'LOW'
}

export function compareDatasetsV2(
  oldData: Array<Record<string, unknown>>,
  newData: Array<Record<string, unknown>>,
): DatasetChangeV2[] {
  const oldMap = new Map(oldData.map(p => [String(p.id ?? ''), p]))
  const changes: DatasetChangeV2[] = []
  for (const current of newData) {
    const id = String(current.id ?? '')
    if (!id) continue
    const previous = oldMap.get(id)
    if (!previous) {
      changes.push({ playerId: id, field: 'newPlayer', oldValue: null, newValue: current, severity: 'CRITICAL' })
      continue
    }
    for (const [field, value] of Object.entries(current)) {
      if (field === 'updatedAt' || field === 'source') continue
      const before = previous[field]
      if (JSON.stringify(before) !== JSON.stringify(value)) {
        changes.push({ playerId: id, field, oldValue: before, newValue: value, severity: classifyChangeV2(field, before, value) })
      }
    }
  }
  return changes
}

export function safeMergePlayerV2<T extends Record<string, unknown>, U extends Record<string, unknown>>(
  sourcePlayerData: T,
  userPlayerData: U | null | undefined,
): T & U {
  return { ...sourcePlayerData, ...(userPlayerData ?? {}) } as T & U
}

export function validatePlayersV2(data: Array<Record<string, unknown>>) {
  const warnings: string[] = []
  const ids = new Set<string>()
  data.forEach((p, index) => {
    const id = String(p.id ?? '')
    if (!id) warnings.push(`Player #${index + 1}: id mancante`)
    else if (ids.has(id)) warnings.push(`ID duplicato: ${id}`)
    else ids.add(id)
    if (!String(p.name ?? p.displayName ?? '').trim()) warnings.push(`${id || `#${index + 1}`}: nome mancante`)
    const role = String(p.role ?? '')
    if (role && !['P', 'D', 'C', 'A'].includes(role)) warnings.push(`${id}: ruolo non valido ${role}`)
    const fvm = safeNumberV2(p.fvm)
    if (fvm != null && fvm < 0) warnings.push(`${id}: FVM negativo`)
    const xmin = safeNumberV2(p.xMin)
    if (xmin != null && (xmin < 0 || xmin > 90)) warnings.push(`${id}: xMin fuori range`)
  })
  return warnings
}

export function exportWarRoomBackupV2(payload: Record<string, unknown>) {
  const backup = {
    schemaVersion: WARROOM_SCHEMA_VERSION,
    modelVersion: WARROOM_MODEL_VERSION,
    exportedAt: new Date().toISOString(),
    ...payload,
  }
  const date = new Date().toISOString().slice(0, 10)
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `fantawarroom-backup-${date}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function runWarRoomSelfTestsV2() {
  const failures: string[] = []
  const assert = (condition: boolean, label: string) => { if (!condition) failures.push(label) }
  assert(personalMaxV2({ baseAuctionValue: 100, budgetRemaining: 50, slotsRemaining: 5 }) <= 46, 'personalMax riserva crediti')
  assert(expectedMinutesV2({ pStart: 100, avgMinutesStarter: 95, pSubIn: 0, avgMinutesSub: 0 }) === 90, 'xMin clamp 90')
  assert(clampV2(140) === 100 && clampV2(-4) === 0, 'rating clamp 0-100')
  const p = poissonAtLeastOneV2(1)
  assert(p != null && p >= 0 && p <= 1, 'probabilità 0-1')
  const merged = safeMergePlayerV2({ id: 'p1', team: 'A' }, { note: 'x' })
  assert(merged.id === 'p1' && merged.note === 'x', 'safe merge')
  assert(normalizeSearchV2('Çalhanoğlu') === 'calhanoglu', 'ricerca accenti')
  return { ok: failures.length === 0, failures }
}

export const WarRoomV2 = {
  modelVersion: WARROOM_MODEL_VERSION,
  schemaVersion: WARROOM_SCHEMA_VERSION,
  storage: WARROOM_STORAGE_V2,
  normalizeSearch: normalizeSearchV2,
  stablePlayerId: stablePlayerIdV2,
  per90: per90V2,
  shrinkMetric: shrinkMetricV2,
  weightedFormIndex: weightedFormIndexV2,
  titolaritaIndex: titolaritaIndexV2,
  expectedMinutes: expectedMinutesV2,
  goalProbability: goalProbabilityV2,
  assistProbability: assistProbabilityV2,
  expectedFantasyPoints: expectedFantasyPointsV2,
  teamExpectedGoals: teamExpectedGoalsV2,
  cleanSheetProbability: cleanSheetProbabilityV2,
  fixtureDifficulty: fixtureDifficultyV2,
  consistencyIndex: consistencyIndexV2,
  riskIndex: riskIndexV2,
  upsideIndex: upsideIndexV2,
  vorp: vorpV2,
  scarcityIndex: scarcityIndexV2,
  auctionInflation: auctionInflationV2,
  personalMax: personalMaxV2,
  valueIndex: valueIndexV2,
  overallRating: overallRatingV2,
  freshnessBadge: freshnessBadgeV2,
  compareDatasets: compareDatasetsV2,
  safeMergePlayer: safeMergePlayerV2,
  validatePlayers: validatePlayersV2,
  exportBackup: exportWarRoomBackupV2,
  selfTest: runWarRoomSelfTestsV2,
}


/* ======================================================================
   MASTER TOTALE — COMPLETAMENTO SPEC 102
   Layer modulare finale. Non sostituisce i motori legacy: li completa.
   Ogni funzione usa solo dati disponibili; assenza dato => null / N/D.
   ====================================================================== */

export type WatchCategoryV2 =
  'TOP TARGET'|'VALUE'|'SCOMMESSA'|'LOW COST'|'EVITA'|'DA MONITORARE'

export type VerdictV2 =
  'TOP ASSOLUTO'|'TARGET'|'VALUE'|'BUON ACQUISTO'|'SOLO A PREZZO'|
  'SCOMMESSA'|'COPERTURA'|'RISCHIOSO'|'EVITA'

export type ManagerProfileV2 = {
  aggression: number | null
  topBias: number | null
  budgetSaving: number | null
  roleSpending: Partial<Record<Role, number>>
  averageOverpay: number | null
}

export function dataQualityV2(minutes: number | null | undefined, confidence: number | null | undefined): DataQuality {
  const c=confidence ?? 0, m=minutes ?? 0
  if(c>=80 && m>=900) return 'HIGH'
  if(c>=55 && m>=270) return 'MEDIUM'
  return 'LOW'
}

export function displayMetricV2(v: unknown, digits=1) {
  return typeof v==='number' && Number.isFinite(v) ? v.toFixed(digits).replace(/\.0$/,'') : 'N/D'
}

export function trendV2(values: Array<number|null|undefined>): TrendV2|null {
  const v=values.filter((x):x is number=>x!=null && Number.isFinite(x))
  if(v.length<2) return null
  const d=v[v.length-1]-v[0]
  const scale=Math.max(1,Math.abs(v[0]))
  if(d/scale>.05) return 'RISING'
  if(d/scale<-.05) return 'FALLING'
  return 'STABLE'
}

export function underValueTagV2(ourValue:number|null, expected:number|null, threshold=.20) {
  if(ourValue==null||expected==null||expected<=0) return null
  const gap=(ourValue-expected)/expected
  return gap>=threshold?'UNDERVALUED':gap<=-threshold?'OVERPRICED':'FAIR'
}

export function expectedWinningBidV2(input:{
  expectedPrice?:number|null; inflation?:number|null; scarcity?:number|null;
  marketSamples?:number[]|null
}) {
  if(input.expectedPrice==null) return {price:null,low:null,high:null,confidence:0}
  const samples=(input.marketSamples??[]).filter(Number.isFinite)
  const infl=input.inflation ?? 1
  const scarcity=1+clampV2(input.scarcity??0)*.002
  const price=Math.max(1,Math.round(input.expectedPrice*infl*scarcity))
  const spread=samples.length>=5?.08:samples.length>=2?.12:.18
  return {
    price, low:Math.max(1,Math.round(price*(1-spread))),
    high:Math.round(price*(1+spread)),
    confidence:clampV2(35+samples.length*7)
  }
}

export function fitRosaV2(input:{
  sameTeam:number; riskyPlayers:number; uncertainStarters:number;
  penaltyTakers:number; roleNeed:number; goalkeeperOverlap?:number
}) {
  let score=100
  score-=Math.max(0,input.sameTeam-3)*7
  score-=Math.max(0,input.riskyPlayers-3)*6
  score-=Math.max(0,input.uncertainStarters-3)*7
  if(input.penaltyTakers===0) score-=8
  score-=clampV2(input.goalkeeperOverlap??0)*.12
  score+=clampV2(input.roleNeed)*.08
  return clampV2(score)
}

export function recommendationV2(input:{
  overall?:number|null; value?:number|null; risk?:number|null; upside?:number|null;
  currentPrice?:number|null; personalMax?:number|null; starter?:number|null
}):VerdictV2|null {
  const {overall,value,risk,upside,currentPrice,personalMax,starter}=input
  if(currentPrice!=null&&personalMax!=null&&currentPrice>personalMax) return 'EVITA'
  if(overall==null&&value==null) return null
  if((overall??0)>=90&&(risk??50)<=35) return 'TOP ASSOLUTO'
  if((value??0)>=82) return 'VALUE'
  if((overall??0)>=82&&(starter??50)>=70) return 'TARGET'
  if((value??0)>=68&&(risk??50)<=55) return 'BUON ACQUISTO'
  if((upside??0)>=75) return 'SCOMMESSA'
  if((risk??0)>=70) return 'RISCHIOSO'
  return 'SOLO A PREZZO'
}

export function deterministicCommentV2(input:{
  titolarita?:number|null; bonus?:number|null; fdr?:number|null;
  risk?:number|null; personalMax?:number|null; verdict?:VerdictV2|null
}) {
  const a:string[]=[]
  if(input.titolarita!=null) a.push(input.titolarita>=80?'Titolarità molto alta.':input.titolarita<50?'Titolarità incerta.':'Titolarità discreta.')
  if(input.bonus!=null&&input.bonus>=70) a.push('Potenziale bonus elevato.')
  if(input.fdr!=null) a.push(input.fdr<=40?'Calendario favorevole.':input.fdr>=70?'Calendario impegnativo.':'Calendario equilibrato.')
  if(input.risk!=null&&input.risk>=65) a.push('Profilo di rischio alto.')
  if(input.personalMax!=null) a.push(`Tetto consigliato ${Math.round(input.personalMax)} crediti.`)
  return a.slice(0,3).join(' ') || 'Dati insufficienti per un commento affidabile.'
}

export function managerProfileV2(sales:Array<{price:number;expected?:number|null;role:Role}>, initialBudget:number):ManagerProfileV2 {
  if(!sales.length) return {aggression:null,topBias:null,budgetSaving:null,roleSpending:{},averageOverpay:null}
  const total=sales.reduce((s,x)=>s+x.price,0)
  const roleSpending:Partial<Record<Role,number>>={}
  for(const x of sales) roleSpending[x.role]=(roleSpending[x.role]??0)+x.price
  const over=sales.filter(x=>x.expected!=null&&x.expected!>0).map(x=>(x.price-x.expected!)/x.expected!*100)
  return {
    aggression:clampV2(total/Math.max(1,initialBudget)*100),
    topBias:null,
    budgetSaving:clampV2((initialBudget-total)/Math.max(1,initialBudget)*100),
    roleSpending,
    averageOverpay:over.length?over.reduce((a,b)=>a+b,0)/over.length:null
  }
}

export function rosterScoreV2(parts:Partial<Record<'P'|'D'|'C'|'A'|'Bonus'|'Titolarita'|'Upside'|'Risk'|'Depth',number|null>>) {
  const vals=Object.entries(parts).filter(([,v])=>v!=null) as Array<[string,number]>
  if(!vals.length) return null
  return Math.round(clampV2(vals.reduce((s,[k,v])=>s+(k==='Risk'?100-v:v),0)/vals.length))
}

export function teamExposureV2(players:Array<{team?:string|null}>) {
  const m=new Map<string,number>()
  for(const p of players) if(p.team) m.set(p.team,(m.get(p.team)??0)+1)
  return [...m.entries()].sort((a,b)=>b[1]-a[1])
}

export function similarityScoreV2(a:Record<string,unknown>,b:Record<string,unknown>) {
  let score=0, used=0
  const numeric=['overall','xFP','bonus','price','upside','risk']
  for(const k of numeric) {
    const x=safeNumberV2(a[k]), y=safeNumberV2(b[k])
    if(x!=null&&y!=null){score+=clampV2(100-Math.abs(x-y)*4);used++}
  }
  if(a.role&&b.role){score+=a.role===b.role?100:0;used++}
  if(a.archetype&&b.archetype){score+=a.archetype===b.archetype?100:30;used++}
  return used?score/used:null
}

export function goalkeeperRotationV2(
  keepers:Array<{id:string;cost?:number|null;fixtures:Array<{round:number;fdrDefense:number|null;cleanSheet?:number|null}>}>
) {
  const rounds=new Set<number>()
  keepers.forEach(k=>k.fixtures.forEach(f=>rounds.add(f.round)))
  let fdrSum=0,fdrN=0,cs=0,critical=0
  const choices=[...rounds].sort((a,b)=>a-b).map(round=>{
    const options=keepers.map(k=>({k,f:k.fixtures.find(x=>x.round===round)})).filter(x=>x.f?.fdrDefense!=null)
      .sort((a,b)=>a.f!.fdrDefense!-b.f!.fdrDefense!)
    const best=options[0]
    if(best){fdrSum+=best.f!.fdrDefense!;fdrN++;cs+=best.f!.cleanSheet??0;if(best.f!.fdrDefense!>=70)critical++}
    return {round,keeperId:best?.k.id??null,fdr:best?.f?.fdrDefense??null}
  })
  return {
    choices, averageFdr:fdrN?fdrSum/fdrN:null, expectedCleanSheets:fdrN?cs:null,
    criticalRounds:critical, totalCost:keepers.reduce((s,k)=>s+(k.cost??0),0)
  }
}

export function bestXiScoreV2(xfp:number|null, starterProbability:number|null, matchup:number|null, noVoteRisk:number|null) {
  if(xfp==null) return null
  return xfp*(starterProbability==null?1:clampV2(starterProbability)/100)*
    (matchup==null?1:(1.15-clampV2(matchup)/200))*
    (noVoteRisk==null?1:(1-clampV2(noVoteRisk)/130))
}

export function tradeAnalyzerV2(a:{rosXfp?:number|null;vorp?:number|null;risk?:number|null;fixture?:number|null},
 b:{rosXfp?:number|null;vorp?:number|null;risk?:number|null;fixture?:number|null}) {
  const score=(x:typeof a)=>{
    const vals:number[]=[]
    if(x.rosXfp!=null) vals.push(x.rosXfp*10)
    if(x.vorp!=null) vals.push(50+x.vorp)
    if(x.risk!=null) vals.push(100-x.risk)
    if(x.fixture!=null) vals.push(100-x.fixture)
    return vals.length?vals.reduce((s,v)=>s+clampV2(v),0)/vals.length:null
  }
  const sa=score(a),sb=score(b)
  if(sa==null||sb==null)return {verdict:null,delta:null}
  const d=sb-sa
  return {verdict:d>7?'VANTAGGIOSO':d<-7?'SFAVOREVOLE':'EQUILIBRATO',delta:d}
}

export function migrateLegacyStorageV2() {
  if(typeof localStorage==='undefined') return
  const migrations:Array<[string,string]>=[
    ['fantawarroom_settings',WARROOM_STORAGE_V2.settings],
    ['fantawarroom_auction',WARROOM_STORAGE_V2.auction],
    ['fantawarroom_watchlist',WARROOM_STORAGE_V2.watchlist],
  ]
  for(const [oldKey,newKey] of migrations){
    if(localStorage.getItem(newKey)==null){
      const old=localStorage.getItem(oldKey)
      if(old!=null)localStorage.setItem(newKey,old)
    }
  }
}

export function saveVersionedV2(key:keyof typeof WARROOM_STORAGE_V2,value:unknown){
  if(typeof localStorage==='undefined')return
  localStorage.setItem(WARROOM_STORAGE_V2[key],JSON.stringify({
    schemaVersion:WARROOM_SCHEMA_VERSION,modelVersion:WARROOM_MODEL_VERSION,
    updatedAt:new Date().toISOString(),value
  }))
}

export function createUpdateManifestV2(datasets:Record<string,string|null>) {
  return {season:'2026-27',schemaVersion:WARROOM_SCHEMA_VERSION,modelVersion:WARROOM_MODEL_VERSION,
    updatedAt:new Date().toISOString(),datasets}
}

export function sourceStatusV2(manifest:ReturnType<typeof createUpdateManifestV2>) {
  const stale:Record<string,number>={players:48,fantacalcio:48,stats:48,advancedStats:48,injuries:12,lineups:12,fixtures:168,editorial:24,market:24}
  return Object.entries(manifest.datasets).map(([dataset,updatedAt])=>({
    dataset,updatedAt,badge:freshnessBadgeV2(updatedAt,stale[dataset]??48)
  }))
}

export function validateWarRoomV2(input:{
  players:Array<Record<string,unknown>>;budget?:number;slots?:Partial<Record<Role,number>>
}) {
  const warnings=validatePlayersV2(input.players)
  if(input.budget!=null&&input.budget<0)warnings.push('Budget negativo')
  for(const [r,n] of Object.entries(input.slots??{}))if(n!=null&&n<0)warnings.push(`Slot ${r} negativo`)
  return warnings
}

export const WarRoomMaster102 = {
  dataQuality:dataQualityV2, displayMetric:displayMetricV2, trend:trendV2,
  underValueTag:underValueTagV2, expectedWinningBid:expectedWinningBidV2,
  fitRosa:fitRosaV2, recommendation:recommendationV2,
  comment:deterministicCommentV2, managerProfile:managerProfileV2,
  rosterScore:rosterScoreV2, teamExposure:teamExposureV2,
  similarity:similarityScoreV2, goalkeeperRotation:goalkeeperRotationV2,
  bestXiScore:bestXiScoreV2, tradeAnalyzer:tradeAnalyzerV2,
  migrateLegacyStorage:migrateLegacyStorageV2, saveVersioned:saveVersionedV2,
  createManifest:createUpdateManifestV2, sourceStatus:sourceStatusV2,
  validate:validateWarRoomV2
}

function App() {
  const saved = useMemo(() => {
    migrateLegacyStorage()
    return loadSavedAuction()
  }, [])
  const phase1DataManager = useMemo(() => new DataManager(players), [])
  const phase1UpdateManager = useMemo(() => new UpdateManager(phase1DataManager), [phase1DataManager])

  const [view, setView] = useState<ViewMode>('war')
  const [setupComplete, setSetupComplete] = useState(saved.setupComplete ?? false)
  const [leagueSize, setLeagueSize] = useState<LeagueSize>(saved.leagueSize ?? 10)
  const [startingBudget, setStartingBudget] = useState<StartingBudget>(saved.startingBudget ?? 500)
  const [budget, setBudget] = useState(saved.budget ?? saved.startingBudget ?? 500)
  const [strategy, setStrategy] = useState<Strategy>(saved.strategy ?? 'balanced')
  const [suggestionMode, setSuggestionMode] = useState<SuggestionMode>(saved.suggestionMode ?? 'target')
  const [suggestionRole, setSuggestionRole] = useState<'ALL' | Role>('ALL')
  const [suggestionCategory, setSuggestionCategory] = useState<SuggestionCategory | null>(null)
  const [squadReportOpen, setSquadReportOpen] = useState(false)
  const [alertsOpen, setAlertsOpen] = useState(false)
  const [commandCallRole, setCommandCallRole] = useState<Role>('A')
  const [commandDecoyRole, setCommandDecoyRole] = useState<Role>('A')
  const [wishlist, setWishlist] = useState<WishlistItem[]>(saved.wishlist ?? [])
  const [wishlistAddRole, setWishlistAddRole] = useState<Role>('P')
  const [wishlistSearch, setWishlistSearch] = useState('')
  const [wishlistFilterRole, setWishlistFilterRole] = useState<'ALL' | Role>('ALL')
  const [wishlistFilterSearch, setWishlistFilterSearch] = useState('')
  const [wishlistAddOpen, setWishlistAddOpen] = useState(false)
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine)
  const [dataUpdates, setDataUpdates] = useState<Record<string, PlayerUpdateData>>(() => loadDataUpdates())
  const [updateMeta, setUpdateMeta] = useState<UpdateMeta | null>(() => loadUpdateMeta())
  const [updateChanges, setUpdateChanges] = useState<UpdateChange[]>([])
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'updating' | 'success' | 'error'>('idle')
  const [updateError, setUpdateError] = useState('')
  const [updateChangesOpen, setUpdateChangesOpen] = useState(false)
  const [dataManifest, setDataManifest] = useState(() => loadManifest())
  const [phase1ChangeCount, setPhase1ChangeCount] = useState(() => phase1UpdateManager.getLastChanges().length)
  const [warRoleChosen, setWarRoleChosen] = useState(false)
  const [warCallChosen, setWarCallChosen] = useState(false)
  const [pairingMode, setPairingMode] = useState<PairingMode>('goalkeepers')
  const [pairingTeams, setPairingTeams] = useState<string[]>(['Atalanta', 'Cagliari', 'Frosinone'])
  const [selectedName, setSelectedName] = useState('')
  const [playerSearch, setPlayerSearch] = useState('')
  const [debouncedPlayerSearch, setDebouncedPlayerSearch] = useState('')
  const [comparisonNames, setComparisonNames] = useState<string[]>([])
  const [price, setPrice] = useState(1)
  const [purchases, setPurchases] = useState<Purchase[]>(saved.purchases ?? [])
  const [rivalSales, setRivalSales] = useState<RivalSale[]>(saved.rivalSales ?? [])
  const [message, setMessage] = useState('')
  const [liveSearch, setLiveSearch] = useState('')
  const [liveSelectedName, setLiveSelectedName] = useState('')
  const [livePrice, setLivePrice] = useState(1)
  const [liveMessage, setLiveMessage] = useState('')
  const [selectedRivalId, setSelectedRivalId] = useState(0)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved')
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [rivalNames, setRivalNames] = useState(
    saved.rivalNames ?? [
      'Rivale 1', 'Rivale 2', 'Rivale 3', 'Rivale 4', 'Rivale 5',
      'Rivale 6', 'Rivale 7', 'Rivale 8', 'Rivale 9',
    ]
  )

  useEffect(() => {
    const state: SavedAuction = {
      setupComplete,
      leagueSize,
      startingBudget,
      budget,
      strategy,
      suggestionMode,
      purchases,
      rivalSales,
      rivalNames,
      wishlist,
    }

    setSaveStatus('saving')
    try {
      const serialized = JSON.stringify(state)
      localStorage.setItem(STORAGE_KEY, serialized)
      saveAuctionMirror(state)

      const verification = localStorage.getItem(STORAGE_KEY)
      if (verification !== serialized) throw new Error('Verifica salvataggio fallita')

      setLastSavedAt(new Date())
      setSaveStatus('saved')
    } catch {
      setSaveStatus('error')
    }
  }, [
    setupComplete,
    leagueSize,
    startingBudget,
    budget,
    strategy,
    suggestionMode,
    purchases,
    rivalSales,
    rivalNames,
    wishlist,
  ])

  useEffect(() => {
    phase1UpdateManager.loadManifestFromUrl().then(setDataManifest).catch(() => undefined)
  }, [phase1UpdateManager])

  useEffect(() => {
    if (view === 'report') {
      setView('squad')
      setSquadReportOpen(true)
    }
  }, [view])

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // FASE 2A: aggiornamento dati automatico in background.
  // Controlla all'apertura e poi ogni ora senza ricaricare la War Room durante l'asta.
  useEffect(() => {
    const ONE_HOUR = 60 * 60 * 1000
    const check = () => {
      if (!navigator.onLine) return
      try {
        const raw = localStorage.getItem(DATA_UPDATE_META_KEY)
        const meta = raw ? JSON.parse(raw) as UpdateMeta : null
        const downloaded = meta?.downloadedAt ? new Date(meta.downloadedAt).getTime() : 0
        if (!downloaded || Date.now() - downloaded >= ONE_HOUR) {
          void runDataUpdate({ silent: true, reload: false })
        }
      } catch {
        void runDataUpdate({ silent: true, reload: false })
      }
    }
    const timer = window.setInterval(check, ONE_HOUR)
    window.setTimeout(check, 1500)
    return () => window.clearInterval(timer)
  }, [])

  const multiplier = startingBudget / BASE_BUDGET
  const activeRivalCount = leagueSize - 1
  const activeRivals = rivalNames.slice(0, activeRivalCount)
  const currentStrategy = strategies[strategy]

  function scaleValue(value: number | null | undefined) {
    if (value === null || value === undefined) return 1
    return Math.max(1, Math.round(value * multiplier))
  }

  function plannedRoleBudget(currentRole: Role) {
    return Math.round(currentStrategy.budgets[currentRole] * multiplier)
  }

  function scaledDbMax(player: Player) {
    return scaleValue(player.maxBid)
  }

  function dataUpdateFor(player: Player) {
    const exact = dataUpdates[`${player.name}|${player.team}`]
    if (exact) return exact

    // Fallback per trasferimenti: prova il nome se il team è cambiato nel feed.
    return (Object.values(dataUpdates) as PlayerUpdateData[]).find(
      (item) => item.name?.toLowerCase() === player.name.toLowerCase()
    )
  }

  function getMarket(player: Player) {
    const update = dataUpdateFor(player)
    const value =
      leagueSize === 8
        ? update?.market8 ?? update?.market10 ?? player.market8 ?? player.market10
        : update?.market10 ?? update?.market8 ?? player.market10 ?? player.market8
    return scaleValue(value)
  }

  function getFit(player: Player) {
    if (player.role === 'P') return player.fitP
    if (player.role === 'D') return player.fitD
    if (player.role === 'C') return player.fitC
    return player.fitA
  }

  function roleCount(currentRole: Role) {
    return purchases.filter((purchase) => purchase.player.role === currentRole).length
  }

  function roleRemaining(currentRole: Role) {
    return Math.max(0, slotLimits[currentRole] - roleCount(currentRole))
  }

  function spentByRole(currentRole: Role) {
    return purchases
      .filter((purchase) => purchase.player.role === currentRole)
      .reduce((total, purchase) => total + purchase.price, 0)
  }
  function rivalPurchases(rivalId: number) {
    return rivalSales.filter((sale) => sale.rivalId === rivalId)
  }

  function rivalSpent(rivalId: number) {
    return rivalPurchases(rivalId).reduce((total, sale) => total + sale.price, 0)
  }

  function rivalBudget(rivalId: number) {
    return Math.max(0, startingBudget - rivalSpent(rivalId))
  }

  function rivalRoleCount(rivalId: number, currentRole: Role) {
    return rivalPurchases(rivalId).filter((sale) => sale.player.role === currentRole).length
  }

  function rivalNeedsRole(rivalId: number, currentRole: Role) {
    return rivalRoleCount(rivalId, currentRole) < slotLimits[currentRole]
  }

  function rivalSlotsRemaining(rivalId: number) {
    return Math.max(0, 25 - rivalPurchases(rivalId).length)
  }

  function rivalMaxOffer(rivalId: number) {
    const remainingSlots = rivalSlotsRemaining(rivalId)
    if (remainingSlots <= 0) return 0
    return Math.max(0, rivalBudget(rivalId) - Math.max(0, remainingSlots - 1))
  }

  function rivalThreat(rivalId: number) {
    const max = rivalMaxOffer(rivalId)
    const highLimit = startingBudget * 0.2
    const mediumLimit = startingBudget * 0.1
    if (max >= highLimit) return { label: 'ALTA', color: '#ff8b8b' }
    if (max >= mediumLimit) return { label: 'MEDIA', color: '#f2c66d' }
    return { label: 'BASSA', color: '#70d6a1' }
  }

  function rivalIntelligence(rivalId: number) {
    const sales = rivalPurchases(rivalId)
    const spent = rivalSpent(rivalId)
    const remaining = rivalBudget(rivalId)
    const maxOffer = rivalMaxOffer(rivalId)

    const ratios = sales.map((sale) => {
      const market = Math.max(1, getMarket(sale.player))
      return sale.price / market
    })
    const avgMarketRatio = ratios.length > 0
      ? ratios.reduce((total, value) => total + value, 0) / ratios.length
      : 1

    const overMarket = ratios.filter((value) => value > 1.05).length
    const bargainBuys = ratios.filter((value) => value < 0.85).length
    const sample = sales.length

    let aggression = 5
    if (sample > 0) {
      aggression = 5 + (avgMarketRatio - 1) * 8 + (overMarket / sample) * 2
    }
    aggression = Math.max(1, Math.min(10, aggression))

    const spendingRate = startingBudget > 0 ? spent / startingBudget : 0
    const rosterRate = sales.length / 25
    const pace = rosterRate > 0 ? spendingRate / rosterRate : 1

    let profile = 'IN OSSERVAZIONE'
    if (sample >= 2) {
      if (aggression >= 7) profile = 'AGGRESSIVO'
      else if (avgMarketRatio <= 0.88 || bargainBuys >= Math.max(2, overMarket + 1)) profile = 'VALUE'
      else if (pace <= 0.78 && remaining >= startingBudget * 0.55) profile = 'RISPARMIATORE'
      else if (pace >= 1.22) profile = 'SPENDACCIONE'
      else profile = 'EQUILIBRATO'
    }

    const power = startingBudget > 0 ? maxOffer / startingBudget : 0
    const threatScore = Math.max(1, Math.min(10,
      2.5 + aggression * 0.35 + Math.min(1, power / 0.2) * 3 + (remaining / startingBudget) * 1.5
    ))

    return {
      profile,
      aggression,
      threatScore,
      avgMarketRatio,
      overMarket,
      sample,
    }
  }

  function rivalPlayerDanger(rivalId: number, player: Player, currentPrice: number) {
    if (!rivalNeedsRole(rivalId, player.role)) return 1
    const intel = rivalIntelligence(rivalId)
    const max = rivalMaxOffer(rivalId)
    const market = Math.max(1, getMarket(player))
    const budgetPower = Math.min(10, (max / Math.max(1, currentPrice)) * 3.5)
    const roleMissing = slotLimits[player.role] - rivalRoleCount(rivalId, player.role)
    const roleNeed = Math.min(10, 4 + (roleMissing / slotLimits[player.role]) * 6)
    const priceAppeal = currentPrice <= market ? 8 : currentPrice <= market * 1.2 ? 6 : 3
    const score =
      intel.aggression * 0.30 +
      budgetPower * 0.30 +
      roleNeed * 0.25 +
      priceAppeal * 0.15
    return Math.max(1, Math.min(10, score))
  }

  const unavailableNames = useMemo(
    () => [
      ...purchases.map((purchase) => purchase.player.name),
      ...rivalSales.map((sale) => sale.player.name),
    ],
    [purchases, rivalSales]
  )

  const availablePlayers = useMemo(
    () => players.filter((player) => !unavailableNames.includes(player.name)),
    [unavailableNames]
  )

  const totalSlots = 25
  const slotsRemaining = totalSlots - purchases.length

  const adaptiveBudgets = useMemo(() => {
    const result: Record<Role, number> = { P: 0, D: 0, C: 0, A: 0 }
    const openRoles = roles.filter((currentRole) => roleRemaining(currentRole) > 0)
    if (openRoles.length === 0 || budget <= 0) return result

    const minimumNeeded = openRoles.reduce(
      (total, currentRole) => total + roleRemaining(currentRole), 0
    )

    if (budget < minimumNeeded) {
      openRoles.forEach((currentRole) => {
        result[currentRole] =
          minimumNeeded > 0 ? budget * (roleRemaining(currentRole) / minimumNeeded) : 0
      })
      return result
    }

    openRoles.forEach((currentRole) => {
      result[currentRole] = roleRemaining(currentRole)
    })

    const discretionaryBudget = budget - minimumNeeded
    const desiredExtra: Record<Role, number> = { P: 0, D: 0, C: 0, A: 0 }
    let totalDesiredExtra = 0

    openRoles.forEach((currentRole) => {
      const plannedRemaining = Math.max(
        roleRemaining(currentRole),
        plannedRoleBudget(currentRole) - spentByRole(currentRole)
      )
      desiredExtra[currentRole] = Math.max(
        0, plannedRemaining - roleRemaining(currentRole)
      )
      totalDesiredExtra += desiredExtra[currentRole]
    })

    if (totalDesiredExtra > 0 && discretionaryBudget <= totalDesiredExtra) {
      openRoles.forEach((currentRole) => {
        result[currentRole] +=
          discretionaryBudget * (desiredExtra[currentRole] / totalDesiredExtra)
      })
      return result
    }

    openRoles.forEach((currentRole) => {
      result[currentRole] += desiredExtra[currentRole]
    })

    const surplus = discretionaryBudget - totalDesiredExtra
    if (surplus <= 0) return result

    const totalWeight = openRoles.reduce(
      (total, currentRole) => total + plannedRoleBudget(currentRole), 0
    )

    openRoles.forEach((currentRole) => {
      const weight = plannedRoleBudget(currentRole) / totalWeight
      result[currentRole] += surplus * weight
    })

    return result
  }, [budget, purchases, strategy, startingBudget])

  function adaptiveRoleBudget(currentRole: Role) {
    return adaptiveBudgets[currentRole] ?? 0
  }

  function adaptiveAverage(currentRole: Role) {
    const remaining = roleRemaining(currentRole)
    if (remaining <= 0) return 0
    return adaptiveRoleBudget(currentRole) / remaining
  }

  function calculateStructuralMax(player: Player) {
    const remainingRoleSlots = roleRemaining(player.role)
    if (remainingRoleSlots <= 0) return 0
    const roleReserve = Math.max(0, remainingRoleSlots - 1)
    const maxFromRole = adaptiveRoleBudget(player.role) - roleReserve
    const globalReserve = Math.max(0, slotsRemaining - 1)
    const maxFromTotal = budget - globalReserve
    return Math.max(0, Math.floor(Math.min(maxFromRole, maxFromTotal)))
  }

  function tierScore(player: Player) {
    const tier = player.tier?.toLowerCase().trim() ?? ''
    if (tier.startsWith('1') || tier.includes('top')) return 100
    if (tier.startsWith('2')) return 82
    if (tier.startsWith('3')) return 66
    if (tier.startsWith('4')) return 50
    if (tier.startsWith('5')) return 35
    return 45
  }

  function strategyMaxMultiplier(player: Player) {
    const tier = tierScore(player)
    const market = getMarket(player)
    const average = adaptiveAverage(player.role)
    const progress = purchases.length / 25

    if (strategy === 'balanced' || strategy === 'free') return 1

    if (strategy === 'aggressive') {
      if (player.role === 'A' && tier >= 82) return 1.12
      if (player.role === 'C' && tier >= 82) return 1.08
      if (tier >= 82) return 1.04
      return 0.98
    }

    if (strategy === 'value') {
      if (average > 0 && market <= average * 0.85) return 1.03
      return 0.93
    }

    if (strategy === 'patient') {
      if (progress < 0.35) return 0.88
      if (progress < 0.65) return 0.95
      return 1.03
    }

    if (strategy === 'stars') {
      if (tier >= 82) return 1.14
      if (market <= startingBudget * 0.025) return 1.02
      return 0.88
    }

    return 1
  }

  function calculateDynamicMax(player: Player) {
    const starMultiplier = wishlistItemFor(player)?.starred ? 1.08 : 1
    const dbMax = scaledDbMax(player) * strategyMaxMultiplier(player) * starMultiplier
    return Math.max(
      0,
      Math.floor(Math.min(dbMax, calculateStructuralMax(player)))
    )
  }

  function goalkeeperPairBonus(player: Player) {
    if (player.role !== 'P') return 0
    const keepers = purchases.filter((purchase) => purchase.player.role === 'P')
    let bestBonus = 0

    keepers.forEach((purchase) => {
      const bought = purchase.player
      const directNames = [bought.name, player.name].sort().join('|')
      if (directNames === ['Paleari', 'Vicario'].sort().join('|')) {
        bestBonus = Math.max(bestBonus, 70)
      }
      const teams = [bought.team, player.team].sort().join('|')
      bestBonus = Math.max(bestBonus, goalkeeperTeamPairs[teams] ?? 0)
    })

    return bestBonus
  }

  function calculateStrategyFit(player: Player) {
    const market = getMarket(player)
    const tier = tierScore(player)
    const fit = getFit(player) ?? 50
    const average = Math.max(1, adaptiveAverage(player.role))
    const dbMax = Math.max(1, scaledDbMax(player))
    const marketVsAverage = market / average
    const valueRatio = market / dbMax
    const progress = purchases.length / 25

    let score = 50

    if (strategy === 'free') {
      const starter = estimatedStarterPct(player)
      const bonusProfile =
        (player.penalties ? 100 : 45) * 0.45 +
        (player.setPieces ? 100 : 45) * 0.35 +
        Math.min(100, Math.max(30, (player.bonus ?? 0) * 12 + 45)) * 0.20

      score =
        tier * 0.36 +
        fit * 0.31 +
        starter * 0.23 +
        bonusProfile * 0.10
    }

    if (strategy === 'balanced') {
      score =
        fit * 0.42 +
        tier * 0.23 +
        (marketVsAverage <= 1 ? 90 : marketVsAverage <= 1.5 ? 70 : 45) * 0.20 +
        (valueRatio <= 0.9 ? 90 : valueRatio <= 1.05 ? 72 : 45) * 0.15
    }

    if (strategy === 'aggressive') {
      const attackingRoleBonus =
        player.role === 'A' ? 100 :
        player.role === 'C' ? 88 :
        player.role === 'D' ? 55 : 45

      score =
        tier * 0.38 +
        fit * 0.25 +
        attackingRoleBonus * 0.22 +
        (market <= calculateStructuralMax(player) ? 78 : 45) * 0.15
    }

    if (strategy === 'value') {
      const valueComponent =
        valueRatio <= 0.70 ? 100 :
        valueRatio <= 0.85 ? 92 :
        valueRatio <= 1 ? 78 :
        valueRatio <= 1.15 ? 52 : 25

      const budgetComponent =
        marketVsAverage <= 0.70 ? 100 :
        marketVsAverage <= 1 ? 90 :
        marketVsAverage <= 1.35 ? 65 : 35

      score =
        valueComponent * 0.38 +
        budgetComponent * 0.27 +
        fit * 0.22 +
        tier * 0.13
    }

    if (strategy === 'patient') {
      const patienceComponent =
        progress < 0.35
          ? marketVsAverage <= 0.8 ? 100 : marketVsAverage <= 1.1 ? 72 : 30
          : progress < 0.65
          ? marketVsAverage <= 1.1 ? 90 : marketVsAverage <= 1.5 ? 68 : 42
          : tier >= 82 ? 92 : marketVsAverage <= 1.5 ? 78 : 55

      score =
        patienceComponent * 0.38 +
        fit * 0.27 +
        tier * 0.18 +
        (valueRatio <= 1 ? 88 : 48) * 0.17
    }

    if (strategy === 'stars') {
      const profileComponent =
        tier >= 82 ? 100 :
        market <= startingBudget * 0.02 ? 92 :
        market <= startingBudget * 0.035 ? 75 :
        28

      const middleBandPenalty =
        tier < 82 &&
        market > startingBudget * 0.035 &&
        market < startingBudget * 0.10
          ? 22
          : 0

      score =
        profileComponent * 0.42 +
        fit * 0.25 +
        tier * 0.20 +
        (valueRatio <= 1 ? 82 : 48) * 0.13 -
        middleBandPenalty
    }

    return Math.max(0, Math.min(100, Math.round(score * 10) / 10))
  }

  function strategyReason(player: Player) {
    const market = getMarket(player)
    const tier = tierScore(player)
    const average = Math.max(1, adaptiveAverage(player.role))
    const dbMax = Math.max(1, scaledDbMax(player))
    const progress = purchases.length / 25

    if (strategy === 'balanced') {
      if ((getFit(player) ?? 0) >= 80 && market <= average * 1.2)
        return 'Ottimo per EQUILIBRATA: qualità, fit e costo sono ben bilanciati'
      return 'EQUILIBRATA: profilo valutato sul miglior compromesso complessivo'
    }

    if (strategy === 'aggressive') {
      if (player.role === 'A' && tier >= 82)
        return 'Perfetto per AGGRESSIVA: attaccante premium su cui vale concentrare budget'
      if (player.role === 'C' && tier >= 82)
        return 'Molto adatto ad AGGRESSIVA: centrocampista di fascia alta'
      return 'AGGRESSIVA: meno priorità ai profili che non spostano abbastanza'
    }

    if (strategy === 'value') {
      if (market <= dbMax * 0.85)
        return 'Ottimo per VALUE: prezzo sensibilmente inferiore al valore stimato'
      if (market <= average)
        return 'Buono per VALUE: costo sostenibile rispetto al budget medio del ruolo'
      return 'VALUE: interessante solo se il prezzo resta sotto controllo'
    }

    if (strategy === 'patient') {
      if (progress < 0.35 && market <= average * 0.8)
        return 'Ottimo per ATTENDISTA: occasione iniziale senza intaccare il potere d’acquisto'
      if (progress < 0.35)
        return 'ATTENDISTA: all’inizio conviene evitare di inseguire troppo il prezzo'
      if (progress >= 0.65 && tier >= 82)
        return 'ATTENDISTA: ora puoi usare il budget conservato per un profilo forte'
      return 'ATTENDISTA: profilo coerente con la fase attuale dell’asta'
    }

    if (strategy === 'stars') {
      if (tier >= 82)
        return 'Perfetto per STELLE & SCOMMESSE: vero top su cui concentrare crediti'
      if (market <= startingBudget * 0.025)
        return 'Ottimo per STELLE & SCOMMESSE: low-cost utile per finanziare le stelle'
      return 'STELLE & SCOMMESSE: fascia intermedia poco prioritaria, meglio top o low-cost'
    }

    return 'Compatibile con la strategia scelta'
  }

  function strategyScoreBonus(player: Player) {
    const strategyFit = calculateStrategyFit(player)
    return (strategyFit - 50) * 0.28
  }

  function calculateTargetScore(player: Player) {
    const market = Math.max(1, getMarket(player))
    const fit = getFit(player) ?? 50
    const tier = tierScore(player)
    const dynamicMax = calculateDynamicMax(player)
    const average = adaptiveAverage(player.role)

    let affordability = 0
    if (market <= dynamicMax) affordability = 100
    else if (market <= dynamicMax * 1.15) affordability = 72
    else if (market <= dynamicMax * 1.35) affordability = 45
    else affordability = 15

    let budgetFit = 50
    if (average > 0) {
      const ratio = market / average
      if (ratio <= 0.8) budgetFit = 100
      else if (ratio <= 1.2) budgetFit = 82
      else if (ratio <= 1.8) budgetFit = 60
      else if (ratio <= 2.6) budgetFit = 38
      else budgetFit = 20
    }

    const dbMax = scaledDbMax(player)
    const valueRatio = dbMax > 0 ? market / dbMax : 1
    let valueScore = 50
    if (valueRatio <= 0.7) valueScore = 100
    else if (valueRatio <= 0.9) valueScore = 85
    else if (valueRatio <= 1) valueScore = 70
    else if (valueRatio <= 1.2) valueScore = 45
    else valueScore = 25

    const strategyFit = calculateStrategyFit(player)

    const score =
      fit * 0.24 +
      tier * 0.17 +
      affordability * 0.19 +
      budgetFit * 0.11 +
      valueScore * 0.12 +
      strategyFit * 0.17 +
      goalkeeperPairBonus(player) +
      strategyScoreBonus(player)

    return Math.round(score * 10) / 10
  }

  function pairingPlayerSignal(player: Player, mode: PairingMode) {
    const update = dataUpdateFor(player)
    const starter = update?.starterPct ?? 50
    const quotation = update?.quotation ?? player.quotation ?? 1
    const avg = update?.fantasyAverage ?? update?.averageRating ?? player.averageRating2526 ?? 6
    const goals = update?.goals ?? 0
    const assists = update?.assists ?? 0
    const base = tierScore(player)

    if (mode === 'attackers') {
      return base * 0.42 + avg * 5.2 + starter * 0.12 + quotation * 0.22 + goals * 2.8 + assists * 2
    }
    return base * 0.48 + avg * 4.6 + starter * 0.12 + quotation * 0.18
  }

  const pairingPower = useMemo(() => {
    const raw: Record<string, { attack: number; defense: number }> = {}
    SERIE_A_TEAMS_2026_27.forEach((team) => {
      const teamPlayers = players.filter((player) => player.team === team)
      const attack = teamPlayers
        .filter((player) => player.role === 'A' || player.role === 'C')
        .map((player) => pairingPlayerSignal(player, 'attackers'))
        .sort((a, b) => b - a)
        .slice(0, 7)
      const defense = teamPlayers
        .filter((player) => player.role === 'P' || player.role === 'D')
        .map((player) => pairingPlayerSignal(player, 'goalkeepers'))
        .sort((a, b) => b - a)
        .slice(0, 7)
      raw[team] = {
        attack: attack.length ? attack.reduce((sum, value) => sum + value, 0) / attack.length : 50,
        defense: defense.length ? defense.reduce((sum, value) => sum + value, 0) / defense.length : 50,
      }
    })

    const normalize = (key: 'attack' | 'defense') => {
      const values = Object.values(raw).map((value) => value[key])
      const min = Math.min(...values)
      const max = Math.max(...values)
      const result: Record<string, number> = {}
      Object.entries(raw).forEach(([team, value]) => {
        result[team] = max === min ? 50 : 20 + ((value[key] - min) / (max - min)) * 70
      })
      return result
    }

    return { attack: normalize('attack'), defense: normalize('defense') }
  }, [dataUpdates])

  function pairingMatchForTeam(roundIndex: number, team: string) {
    const match = SERIE_A_FIXTURES_2026_27[roundIndex]?.find((item) => item.home === team || item.away === team)
    if (!match) return null
    const home = match.home === team
    return { opponent: home ? match.away : match.home, home }
  }

  function pairingFixtureScore(team: string, roundIndex: number, mode: PairingMode) {
    const fixture = pairingMatchForTeam(roundIndex, team)
    if (!fixture) return null
    const opponentPower = mode === 'goalkeepers'
      ? pairingPower.attack[fixture.opponent] ?? 50
      : pairingPower.defense[fixture.opponent] ?? 50
    const venue = fixture.home ? (mode === 'goalkeepers' ? 6 : 5) : (mode === 'goalkeepers' ? -3 : -2)
    return Math.max(5, Math.min(95, 100 - opponentPower + venue))
  }

  function evaluatePairing(selected: string[], mode: PairingMode) {
    const clean = Array.from(new Set(selected.filter(Boolean)))
    const rounds: PairingRoundResult[] = SERIE_A_FIXTURES_2026_27.map((_, roundIndex) => {
      const options = clean.map((team) => {
        const fixture = pairingMatchForTeam(roundIndex, team)
        const score = pairingFixtureScore(team, roundIndex, mode)
        return fixture && score != null ? { team, fixture, score } : null
      }).filter((item): item is { team: string; fixture: { opponent: string; home: boolean }; score: number } => Boolean(item))
      const best = options.sort((a, b) => b.score - a.score)[0]
      const score = best?.score ?? 0
      return {
        round: roundIndex + 1,
        team: best?.team ?? 'N/D',
        opponent: best?.fixture.opponent ?? 'N/D',
        home: best?.fixture.home ?? false,
        score,
        level: score >= 62 ? 'FACILE' : score >= 46 ? 'MEDIA' : 'DIFFICILE',
      }
    })
    const easy = rounds.filter((item) => item.level === 'FACILE').length
    const medium = rounds.filter((item) => item.level === 'MEDIA').length
    const hard = rounds.filter((item) => item.level === 'DIFFICILE').length
    const home = rounds.filter((item) => item.home).length
    const index = rounds.length ? Math.round(rounds.reduce((sum, item) => sum + item.score, 0) / rounds.length) : 0
    return { teams: clean, rounds, easy, medium, hard, home, away: rounds.length - home, index }
  }

  const activePairing = useMemo(
    () => evaluatePairing(pairingTeams, pairingMode),
    [pairingTeams, pairingMode, pairingPower]
  )

  const topPairings = useMemo(() => {
    const combos: { teams: string[]; index: number; easy: number; hard: number }[] = []
    const teams = SERIE_A_TEAMS_2026_27
    for (let i = 0; i < teams.length; i += 1) {
      for (let j = i + 1; j < teams.length; j += 1) {
        for (let k = j + 1; k < teams.length; k += 1) {
          const result = evaluatePairing([teams[i], teams[j], teams[k]], pairingMode)
          combos.push({ teams: result.teams, index: result.index, easy: result.easy, hard: result.hard })
        }
      }
    }
    return combos.sort((a, b) => b.index - a.index || b.easy - a.easy || a.hard - b.hard).slice(0, 8)
  }, [pairingMode, pairingPower])

  function updatePairingTeam(index: number, team: string) {
    setPairingTeams((current) => {
      const next = [...current]
      next[index] = team
      return next
    })
  }

  function scoreOutOf10(score: number) {
    const value = Math.max(1, Math.min(10, score / 10))
    return value.toFixed(1)
  }

  function isNewToSerieA(player: Player) {
    return Boolean((player as ExtendedPlayer).newToSerieA)
  }

  function calculateBetScore(player: Player) {
    const market = getMarket(player)
    const fit = getFit(player) ?? 50
    const tier = tierScore(player)
    const max = calculateDynamicMax(player)
    const budgetPercentage = market / startingBudget

    let cheapScore = 0
    if (budgetPercentage <= 0.006) cheapScore = 100
    else if (budgetPercentage <= 0.012) cheapScore = 92
    else if (budgetPercentage <= 0.02) cheapScore = 82
    else if (budgetPercentage <= 0.035) cheapScore = 68
    else if (budgetPercentage <= 0.05) cheapScore = 45
    else cheapScore = 15

    const upside = Math.min(100, fit * 0.75 + tier * 0.25)
    const affordability =
      market <= max ? 100 : market <= max * 1.15 ? 65 : 30
    const newBonus = isNewToSerieA(player) ? 18 : 0
    let strategyBonus = 0
    if (strategy === 'stars') strategyBonus = 10
    if (strategy === 'value') strategyBonus = 6

    const strategyFit = calculateStrategyFit(player)

    const score =
      cheapScore * 0.35 +
      upside * 0.30 +
      affordability * 0.19 +
      strategyFit * 0.16 +
      newBonus +
      strategyBonus

    return Math.round(score * 10) / 10
  }
  function calculateDecoyScore(player: Player) {
    const tier = tierScore(player)
    const market = getMarket(player)
    const fit = getFit(player) ?? 50
    const targetScore = calculateTargetScore(player)

    const roleDemand = activeRivals.filter((_, rivalId) =>
      rivalNeedsRole(rivalId, player.role)
    ).length

    const demandScore = activeRivalCount > 0
      ? (roleDemand / activeRivalCount) * 100
      : 0

    const marketShare = market / Math.max(1, startingBudget)
    const prestigeScore = Math.min(100, marketShare * 700)
    const strategyFit = calculateStrategyFit(player)
    const expendability = Math.max(
      0,
      100 - Math.min(100, strategyFit * 0.65 + targetScore * 0.35)
    )

    const score =
      tier * 0.27 +
      prestigeScore * 0.18 +
      fit * 0.08 +
      demandScore * 0.27 +
      expendability * 0.20

    return Math.round(score * 10) / 10
  }

  function rivalRolePressure(rivalId: number, currentRole: Role) {
    const missing = Math.max(0, slotLimits[currentRole] - rivalRoleCount(rivalId, currentRole))
    if (missing <= 0) return 0

    const need = (missing / slotLimits[currentRole]) * 100
    const maxPower = Math.min(100, (rivalMaxOffer(rivalId) / Math.max(1, startingBudget * .18)) * 100)
    const intel = rivalIntelligence(rivalId)
    const roleTemp = roleMarketTemperature(currentRole)
    const heat = roleTemp.sample >= 2 ? Math.max(0, Math.min(100, 50 + roleTemp.pct * 1.4)) : 50

    return clampScore(
      need * .48 +
      maxPower * .24 +
      intel.aggression * 10 * .18 +
      heat * .10
    )
  }

  function rivalPrediction(rivalId: number) {
    const intel = rivalIntelligence(rivalId)
    const rolePressures = roles
      .map((currentRole) => ({
        role: currentRole,
        pressure: rivalRolePressure(rivalId, currentRole),
        missing: Math.max(0, slotLimits[currentRole] - rivalRoleCount(rivalId, currentRole)),
      }))
      .filter((item) => item.missing > 0)
      .sort((a, b) => b.pressure - a.pressure)

    const primary = rolePressures[0] ?? null
    const secondary = rolePressures[1] ?? null
    const remaining = rivalBudget(rivalId)
    const maxOffer = rivalMaxOffer(rivalId)
    const slots = rivalSlotsRemaining(rivalId)

    let behavior = 'ATTENDISTA'
    if (intel.aggression >= 7.2 && maxOffer >= startingBudget * .16) behavior = 'RILANCERÀ FORTE'
    else if (intel.profile === 'VALUE') behavior = 'CERCHERÀ OCCASIONI'
    else if (intel.profile === 'SPENDACCIONE') behavior = 'PUÒ BRUCIARE BUDGET'
    else if (intel.profile === 'RISPARMIATORE') behavior = 'CONSERVERÀ CASSA'
    else if (slots <= 8) behavior = 'DOVRÀ ACCELERARE'

    let counter = 'Non inseguirlo sui rilanci emotivi.'
    if (primary?.pressure && primary.pressure >= 78) {
      counter = `Ha forte bisogno di ${primary.role}: usa quel reparto per farlo spendere oppure anticipalo sui tuoi target.`
    } else if (intel.profile === 'VALUE') {
      counter = 'Evita di regalargli low-cost puliti: alza il prezzo sui profili value che non sono tuoi obiettivi.'
    } else if (intel.profile === 'RISPARMIATORE') {
      counter = 'Non lasciargli arrivare alla fase finale con troppa cassa: usa esche appetibili prima.'
    }

    return {
      rivalId,
      name: rivalNames[rivalId],
      profile: intel.profile,
      aggression: intel.aggression,
      threat: intel.threatScore,
      remaining,
      maxOffer,
      slots,
      primary,
      secondary,
      behavior,
      counter,
    }
  }


  function rivalMemory(rivalId: number) {
    const sales = rivalSales.filter((sale) => sale.rivalId === rivalId)
    const byRole = roles.map((role) => {
      const roleSales = sales.filter((sale) => sale.player.role === role)
      const spent = roleSales.reduce((total, sale) => total + sale.price, 0)
      const avg = roleSales.length > 0 ? spent / roleSales.length : 0
      const overMarket = roleSales.length > 0
        ? roleSales.reduce((total, sale) => {
            const market = Math.max(1, getMarket(sale.player))
            return total + ((sale.price - market) / market) * 100
          }, 0) / roleSales.length
        : 0
      return { role, count: roleSales.length, spent, avg, overMarket }
    })

    const hottestRole = [...byRole].sort((a, b) => b.overMarket - a.overMarket)[0]
    const favoriteRole = [...byRole].sort((a, b) => b.spent - a.spent)[0]
    const avgPaid = sales.length > 0
      ? sales.reduce((total, sale) => total + sale.price, 0) / sales.length
      : 0
    const avgOverMarket = sales.length > 0
      ? sales.reduce((total, sale) => {
          const market = Math.max(1, getMarket(sale.player))
          return total + ((sale.price - market) / market) * 100
        }, 0) / sales.length
      : 0

    let tendency = 'DATI INSUFFICIENTI'
    if (sales.length >= 2) {
      if (avgOverMarket >= 18) tendency = 'RILANCIATORE'
      else if (avgOverMarket <= -8) tendency = 'CACCIATORE VALUE'
      else tendency = 'PREZZO DI MERCATO'
    }

    return {
      salesCount: sales.length,
      avgPaid,
      avgOverMarket,
      hottestRole,
      favoriteRole,
      tendency,
      byRole,
    }
  }

  function predictedRivalBid(rivalId: number, player: Player) {
    const memory = rivalMemory(rivalId)
    const prediction = rivalPrediction(rivalId)
    const market = Math.max(1, getMarket(player))
    const roleData = memory.byRole.find((item) => item.role === player.role)
    const rolePremium = roleData && roleData.count > 0 ? roleData.overMarket : memory.avgOverMarket
    const needBoost = prediction.primary?.role === player.role ? 1.14 : prediction.secondary?.role === player.role ? 1.07 : 1
    const aggressionBoost = 1 + Math.max(0, prediction.aggression - 5) * .035
    const learnedBoost = 1 + Math.max(-.18, Math.min(.35, rolePremium / 100))
    const raw = Math.round(market * needBoost * aggressionBoost * learnedBoost)
    return Math.max(1, Math.min(prediction.maxOffer, raw))
  }

  function bluffWindow(player: Player) {
    const market = Math.max(1, getMarket(player))
    const interested = activeRivals
      .map((_, rivalId) => ({
        rivalId,
        predicted: predictedRivalBid(rivalId, player),
        danger: rivalPlayerDanger(rivalId, player, market),
      }))
      .filter((item) => item.predicted > market)
      .sort((a, b) => b.predicted - a.predicted)

    const leader = interested[0] ?? null
    const ceiling = leader ? Math.max(market, leader.predicted - 1) : market
    const safeBluff = Math.max(1, Math.min(calculateDynamicMax(player), ceiling))
    return { leader, safeBluff, interested }
  }


  function finalPriceForecast(player: Player, currentPrice: number) {
    const market = Math.max(1, getMarket(player))
    const myMax = Math.max(1, calculateDynamicMax(player))
    const rivalBids = activeRivals
      .map((_, rivalId) => ({
        rivalId,
        name: rivalNames[rivalId],
        predicted: predictedRivalBid(rivalId, player),
        danger: rivalPlayerDanger(rivalId, player, currentPrice),
        needsRole: rivalNeedsRole(rivalId, player.role),
      }))
      .filter((item) => item.needsRole)
      .sort((a, b) => b.predicted - a.predicted || b.danger - a.danger)

    const strongest = rivalBids[0] ?? null
    const second = rivalBids[1] ?? null
    const rivalCeiling = strongest?.predicted ?? market
    const secondCeiling = second?.predicted ?? market

    const demand = clampScore(
      28 +
      rivalBids.length * 10 +
      (strongest?.danger ?? 1) * 4 +
      Math.max(0, estimatedStarterPct(player) - 65) * .20
    )

    const predictedFinal = Math.max(
      1,
      Math.round(
        market * .52 +
        rivalCeiling * .30 +
        secondCeiling * .10 +
        Math.min(myMax, market * 1.35) * .08
      )
    )

    const low = Math.max(1, Math.round(predictedFinal * .90))
    const high = Math.max(low, Math.round(predictedFinal * 1.10))
    const entryThreshold = Math.max(
      1,
      Math.min(myMax, Math.round(predictedFinal * .72))
    )

    let entry = 'OSSERVA'
    if (currentPrice <= Math.max(1, Math.round(entryThreshold * .78))) entry = 'NON SCOPRIRTI'
    else if (currentPrice < entryThreshold) entry = 'PREPARATI'
    else if (currentPrice <= Math.min(myMax, predictedFinal)) entry = 'ENTRA ORA'
    else if (currentPrice <= myMax) entry = 'SOLO RILANZI SECCHI'
    else entry = 'STOP'

    let tactic = 'Aspetta: il prezzo è ancora troppo basso per mostrare interesse.'
    if (entry === 'PREPARATI') tactic = `Avvicinati solo quando supera circa ${entryThreshold}: evita rilanci inutili prima.`
    if (entry === 'ENTRA ORA') tactic = 'Entra con decisione: sei nella finestra in cui il prezzo è ancora difendibile.'
    if (entry === 'SOLO RILANZI SECCHI') tactic = 'Se vuoi chiuderlo, niente micro-rilanci emotivi: resta rigorosamente sotto il tuo MAX.'
    if (entry === 'STOP') tactic = 'Lascia andare: il prezzo ha superato il limite sostenibile.'

    const valueGap = myMax - predictedFinal
    const winChance = clampScore(
      50 +
      (myMax - rivalCeiling) / Math.max(1, market) * 42 +
      (budget - averageRivalBudget) / Math.max(1, startingBudget) * 35 -
      Math.max(0, rivalBids.length - 2) * 5
    )

    return {
      predictedFinal,
      low,
      high,
      entryThreshold,
      entry,
      tactic,
      demand,
      strongest,
      rivalBids,
      rivalCeiling,
      valueGap,
      winChance,
      myMax,
      market,
    }
  }

  function getAuctionPressure(player: Player, currentPrice: number) {
    const interested = activeRivals
      .map((_, rivalId) => ({
        rivalId,
        name: rivalNames[rivalId],
        max: rivalMaxOffer(rivalId),
        needsRole: rivalNeedsRole(rivalId, player.role),
        danger: rivalPlayerDanger(rivalId, player, currentPrice),
        profile: rivalIntelligence(rivalId).profile,
      }))
      .filter((rival) => rival.needsRole && rival.max > currentPrice)
      .sort((a, b) => b.danger - a.danger || b.max - a.max)

    const strongest = interested[0]
    const avgDanger = interested.length > 0
      ? interested.reduce((total, rival) => total + rival.danger, 0) / interested.length
      : 1
    let level: 'BASSA' | 'MEDIA' | 'ALTA' = 'BASSA'

    if (interested.length >= 4 || avgDanger >= 7.5 || (strongest && strongest.danger >= 8.5)) level = 'ALTA'
    else if (interested.length >= 2 || avgDanger >= 5.5 || (strongest && strongest.danger >= 6.5)) level = 'MEDIA'

    return { level, rivals: interested.length, strongest, avgDanger }
  }

  function calculateGameTheoryMax(player: Player, currentPrice: number) {
    const baseMax = calculateDynamicMax(player)
    if (baseMax <= 0) return 0
    const structuralMax = calculateStructuralMax(player)
    const pressure = getAuctionPressure(player, currentPrice)
    const score =
      suggestionMode === 'bet'
        ? calculateBetScore(player)
        : suggestionMode === 'decoy'
        ? calculateDecoyScore(player)
        : calculateTargetScore(player)

    let factor = 1
    if (pressure.level === 'ALTA' && score >= 82) factor = 1.05
    if (strategy === 'patient' && purchases.length < 8) factor *= 0.96
    if (suggestionMode === 'bet') factor = Math.min(factor, 1)

    return Math.max(
      1,
      Math.min(structuralMax, Math.round(baseMax * factor))
    )
  }

  function getDecision(player: Player, currentPrice: number) {
    const dynamicMax = calculateGameTheoryMax(player, currentPrice)
    const market = getMarket(player)

    if (roleRemaining(player.role) <= 0)
      return {
        label: 'REPARTO PIENO',
        className: 'pass',
        message: 'Non hai più slot disponibili in questo ruolo.',
      }

    if (dynamicMax <= 0)
      return {
        label: 'RISCHIO ALTO',
        className: 'pass',
        message: 'Il piano attuale non lascia margine consigliato.',
      }

    if (currentPrice > dynamicMax)
      return {
        label: 'PASSA',
        className: 'pass',
        message: `Oltre il MAX consigliato di ${dynamicMax}. Puoi acquistare comunque.`,
      }

    if (suggestionMode === 'decoy')
      return {
        label: 'LASCIA SALIRE',
        className: 'warning',
        message: 'È un’esca: l’obiettivo è far spendere i rivali, non vincere necessariamente il giocatore.',
      }

    if (suggestionMode === 'bet' && currentPrice <= market)
      return {
        label: 'SCOMMETTI',
        className: 'buy',
        message: `Prezzo compatibile con una scommessa. Non superare ${dynamicMax}.`,
      }

    if (currentPrice <= market * 0.8)
      return {
        label: 'COMPRA FORTE',
        className: 'buy',
        message: `Prezzo molto favorevole. MAX LIVE ${dynamicMax}.`,
      }

    if (currentPrice <= market)
      return {
        label: 'COMPRA',
        className: 'buy',
        message: `Prezzo coerente. MAX LIVE ${dynamicMax}.`,
      }

    return {
      label: 'VALUTA',
      className: 'warning',
      message: `Sopra mercato, ma ancora entro il MAX ${dynamicMax}.`,
    }
  }



  function roleStrategyBias(currentRole: Role) {
    if (strategy === 'balanced') return 0

    if (strategy === 'aggressive') {
      if (currentRole === 'A') return 16
      if (currentRole === 'C') return 9
      if (currentRole === 'P') return -5
      return 0
    }

    if (strategy === 'value') {
      if (currentRole === 'D') return 8
      if (currentRole === 'C') return 6
      if (currentRole === 'P') return 3
      return 0
    }

    if (strategy === 'patient') {
      if (purchases.length < 9) {
        if (currentRole === 'P' || currentRole === 'D') return 8
        if (currentRole === 'A') return -7
      }
      if (purchases.length >= 16 && currentRole === 'A') return 8
      return 0
    }

    if (strategy === 'stars') {
      if (currentRole === 'A') return 18
      if (currentRole === 'C') return 5
      if (currentRole === 'D') return -5
      return 0
    }

    return 0
  }

  function roleMoveReason(
    currentRole: Role,
    bestPlayer: Player | null,
    urgency: number
  ) {
    const remaining = roleRemaining(currentRole)

    if (remaining <= 0) return 'Reparto già completato'

    if (!bestPlayer)
      return 'Pochi profili disponibili: monitora il reparto senza forzare'

    if (strategy === 'aggressive' && currentRole === 'A')
      return 'La strategia AGGRESSIVA richiede di concentrare risorse sugli attaccanti forti'

    if (strategy === 'value' && getMarket(bestPlayer) <= adaptiveAverage(currentRole))
      return 'Occasione coerente con VALUE: il miglior profilo è sostenibile per il budget del ruolo'

    if (strategy === 'patient' && purchases.length < 9)
      return 'Fase iniziale ATTENDISTA: priorità ai reparti acquistabili senza bruciare budget'

    if (strategy === 'stars' && tierScore(bestPlayer) >= 82)
      return 'STELLE & SCOMMESSE: è disponibile un profilo premium su cui valutare l’affondo'

    if (urgency >= 8)
      return 'Priorità alta: molti slot ancora aperti e buon target disponibile'

    if (calculateTargetScore(bestPlayer) >= 82)
      return 'Target molto forte disponibile: finestra interessante per intervenire'

    return 'Reparto da tenere attivo, ma senza necessità di forzare la chiamata'
  }

  function buildRoleMove(currentRole: Role) {
    const remaining = roleRemaining(currentRole)

    const candidates = availablePlayers
      .filter((player) => player.role === currentRole)
      .map((player) => ({
        player,
        score: calculateTargetScore(player),
      }))
      .sort((a, b) => b.score - a.score)

    const best = candidates[0]?.player ?? null
    const bestScore = candidates[0]?.score ?? 0

    if (remaining <= 0) {
      return {
        role: currentRole,
        urgency: 0,
        bestPlayer: null as Player | null,
        bestScore: 0,
        reason: 'Reparto già completato',
      }
    }

    const slotNeed =
      (remaining / Math.max(1, slotLimits[currentRole])) * 100

    const roleBudgetShare =
      budget > 0
        ? Math.min(100, (adaptiveRoleBudget(currentRole) / budget) * 100)
        : 0

    const phasePressure =
      purchases.length >= 18
        ? 14
        : purchases.length >= 12
        ? 8
        : purchases.length >= 6
        ? 3
        : 0

    const rawUrgency =
      slotNeed * 0.38 +
      Math.min(100, bestScore) * 0.32 +
      roleBudgetShare * 0.16 +
      phasePressure +
      roleStrategyBias(currentRole)

    const urgency = Math.max(
      1,
      Math.min(10, Math.round((rawUrgency / 10) * 10) / 10)
    )

    return {
      role: currentRole,
      urgency,
      bestPlayer: best,
      bestScore,
      reason: roleMoveReason(currentRole, best, urgency),
    }
  }

  const auctionMoves = useMemo(
    () =>
      roles
        .map((currentRole) => buildRoleMove(currentRole))
        .sort((a, b) => b.urgency - a.urgency),
    [
      availablePlayers,
      purchases,
      rivalSales,
      budget,
      startingBudget,
      leagueSize,
      strategy,
      dataUpdates,
      wishlist,
    ]
  )

  const filteredAuctionMoves =
    suggestionRole === 'ALL'
      ? auctionMoves
      : auctionMoves.filter((move) => move.role === suggestionRole)

  const nextAuctionMove =
    filteredAuctionMoves.find((move) => move.urgency > 0) ?? null



  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedPlayerSearch(playerSearch), 140)
    return () => window.clearTimeout(timer)
  }, [playerSearch])

  const searchedPlayers = useMemo(() => {
    const search = debouncedPlayerSearch.trim().toLowerCase()
    if (!search) return []
    return availablePlayers
      .filter(
        (player) =>
          player.name.toLowerCase().includes(search) ||
          player.team.toLowerCase().includes(search)
      )
      .slice(0, 18)
  }, [availablePlayers, debouncedPlayerSearch])

  const selectedPlayer =
    availablePlayers.find((player) => player.name === selectedName) ?? null

  const comparisonPlayers = useMemo(
    () =>
      comparisonNames.flatMap((name) => {
        const player = availablePlayers.find((item) => item.name === name)
        return player ? [player] : []
      }),
    [comparisonNames, availablePlayers]
  )


  function estimatedStarterPct(player: Player) {
    const update = dataUpdateFor(player)
    if (update?.starterPct !== null && update?.starterPct !== undefined) {
      return Math.max(0, Math.min(100, Math.round(update.starterPct)))
    }

    const reliability = `${player.reliability ?? ''} ${player.reliabilityLeague ?? ''}`.toUpperCase()
    const use = (player.use ?? '').toUpperCase()
    let value = 66
    if (reliability.includes('ALTA')) value += 18
    else if (reliability.includes('MEDIA')) value += 8
    else if (reliability.includes('BASSA')) value -= 16
    if (use.includes('1°') || use.includes('PRIMO') || use.includes('TITOLAR')) value += 8
    if (use.includes('PROFONDIT')) value -= 14
    if (tierScore(player) >= 82) value += 7
    if (tierScore(player) <= 50) value -= 6
    return Math.max(25, Math.min(98, Math.round(value)))
  }

  function clampScore(value: number) {
    return Math.max(0, Math.min(100, Math.round(value)))
  }

  function playerStats(player: Player) {
    const update = dataUpdateFor(player)
    return {
      appearances: update?.appearances ?? null,
      averageRating: update?.averageRating ?? null,
      starts: update?.starts ?? null,
      minutes: update?.minutes ?? null,
      goals: update?.goals ?? null,
      assists: update?.assists ?? null,
      fantasyAverage: update?.fantasyAverage ?? null,
      xg: update?.xg ?? null,
      xa: update?.xa ?? null,
      shots90: update?.shots90 ?? null,
      chances90: update?.chances90 ?? null,
      bonus90: update?.bonus90 ?? null,
      malus90: update?.malus90 ?? null,
      injuryDays: update?.injuryDays ?? null,
      injuryCount: update?.injuryCount ?? null,
      rotationRisk: update?.rotationRisk ?? null,
      transferRisk: update?.transferRisk ?? null,
      cardRisk: update?.cardRisk ?? null,
      position: update?.position ?? player.use ?? null,
    }
  }

  function chirurgoScore(player: Player) {
    const stats = playerStats(player)
    const update = dataUpdateFor(player)
    const quality = tierScore(player)
    const starter = estimatedStarterPct(player)
    const fit = calculateStrategyFit(player)
    const market = Math.max(1, getMarket(player))
    const max = Math.max(1, calculateDynamicMax(player))
    const value = clampScore(72 + ((max - market) / max) * 90)
    const bonusBase = (player.bonus ?? 0) * 10 + (player.penalties ? 18 : 0) + (player.setPieces ? 10 : 0)
    const bonus = clampScore(quality * .48 + bonusBase + (stats.goals ?? 0) * 1.4 + (stats.assists ?? 0))

    const liveForm = clampScore(
      stats.appearances === null && stats.averageRating === null && stats.fantasyAverage === null
        ? 55
        : 28 +
          Math.min(24, (stats.appearances ?? 0) * 2) +
          Math.max(0, ((stats.averageRating ?? 5.8) - 5.5) * 18) +
          Math.max(0, ((stats.fantasyAverage ?? 5.8) - 5.5) * 13) +
          (stats.goals ?? 0) * 2.5 +
          (stats.assists ?? 0) * 1.8
    )

    const availability =
      update?.injuryStatus === 'injured' ? 18 :
      update?.injuryStatus === 'suspended' ? 35 :
      update?.injuryStatus === 'doubt' ? 52 :
      update?.injuryStatus === 'recovering' ? 66 : 92

    const physicalPenalty =
      (stats.injuryDays ?? 0) * .18 +
      (stats.injuryCount ?? 0) * 5 +
      Math.max(0, 92 - availability) * .45

    const reliability = clampScore(starter * .48 + quality * .24 + availability * .28 - physicalPenalty)
    const upside = clampScore(quality * .42 + fit * .24 + bonus * .19 + liveForm * .15)
    const total = clampScore(
      quality * .20 +
      starter * .15 +
      value * .18 +
      fit * .13 +
      reliability * .11 +
      upside * .09 +
      liveForm * .08 +
      availability * .06
    )

    return {
      total,
      quality: clampScore(quality),
      starter,
      value,
      fit: clampScore(fit),
      bonus,
      reliability,
      upside,
      liveForm,
      availability,
    }
  }


  function buyNowIntelligence(player: Player, currentPrice: number) {
    const live = chirurgoScore(player)
    const market = Math.max(1, getMarket(player))
    const max = Math.max(1, calculateGameTheoryMax(player, currentPrice))
    const pressure = getAuctionPressure(player, currentPrice)
    const temperature = roleMarketTemperature(player.role)
    const remainingRole = roleRemaining(player.role)
    const remainingTotal = roles.reduce((total, role) => total + roleRemaining(role), 0)
    const reserveAfter = Math.max(0, remainingTotal - 1)
    const budgetAfter = Math.max(0, budget - currentPrice)
    const structuralSafety = budgetAfter >= reserveAfter ? 100 : 20
    const headroomPct = Math.round(((max - currentPrice) / max) * 100)

    const strongAlternatives = availablePlayers.filter((candidate) =>
      candidate.role === player.role &&
      candidate.name !== player.name &&
      chirurgoScore(candidate).total >= Math.max(72, live.total - 5)
    ).length

    const scarcity =
      strongAlternatives <= 2 ? 96 :
      strongAlternatives <= 5 ? 78 :
      strongAlternatives <= 9 ? 58 : 38

    const roleNeed = clampScore(
      (remainingRole / Math.max(1, slotLimits[player.role])) * 72 +
      (roleCount(player.role) === 0 ? 22 : 0)
    )

    const pressureScore =
      pressure.level === 'ALTA' ? 90 :
      pressure.level === 'MEDIA' ? 65 : 35

    const marketHeat =
      temperature.sample < 2 ? 50 :
      temperature.pct >= 15 ? 82 :
      temperature.pct >= 5 ? 66 :
      temperature.pct <= -10 ? 35 : 50

    const starredBoost = isStarred(player) ? 14 : wishlistItemFor(player) ? 7 : 0
    const affordability =
      currentPrice <= max * .78 ? 100 :
      currentPrice <= max * .92 ? 84 :
      currentPrice <= max ? 68 :
      currentPrice <= max * 1.08 ? 38 : 10

    const risk = clampScore(
      (100 - live.availability) * .40 +
      pressureScore * .20 +
      marketHeat * .12 +
      (100 - structuralSafety) * .20 +
      Math.max(0, currentPrice - market) / market * 100 * .08
    )

    const actionScore = clampScore(
      live.total * .34 +
      live.value * .16 +
      roleNeed * .13 +
      scarcity * .12 +
      affordability * .13 +
      structuralSafety * .08 +
      pressureScore * .04 +
      starredBoost -
      risk * .10
    )

    const fairPrice = Math.max(
      1,
      Math.min(
        max,
        Math.round((market * .58) + (max * .42))
      )
    )
    const attackPrice = Math.max(
      1,
      Math.min(max, Math.round(fairPrice * (isStarred(player) ? 1.06 : 1.02)))
    )
    const bargainPrice = Math.max(1, Math.min(fairPrice, Math.round(market * .88)))

    let priority: 'MASSIMA' | 'ALTA' | 'MEDIA' | 'BASSA' = 'BASSA'
    if (actionScore >= 86) priority = 'MASSIMA'
    else if (actionScore >= 74) priority = 'ALTA'
    else if (actionScore >= 60) priority = 'MEDIA'

    let action = 'PASSA'
    if (currentPrice > max) action = 'STOP'
    else if (actionScore >= 86 && currentPrice <= attackPrice) action = 'CHIUDI ORA'
    else if (actionScore >= 74 && currentPrice <= fairPrice) action = 'COMPRA'
    else if (actionScore >= 62 && currentPrice <= max) action = 'RESTA IN GARA'
    else if (currentPrice <= bargainPrice) action = 'OCCASIONE'
    else action = 'ASPETTA'

    const reasons: string[] = []
    if (isStarred(player)) reasons.push('obiettivo ★')
    if (live.availability < 65) reasons.push('rischio disponibilità')
    if (scarcity >= 78) reasons.push('poche alternative equivalenti')
    if (pressure.level === 'ALTA') reasons.push('forte pressione rivali')
    if (temperature.sample >= 2 && temperature.pct >= 10) reasons.push('reparto surriscaldato')
    if (headroomPct >= 20) reasons.push('ampio margine sotto MAX')
    if (structuralSafety < 60) reasons.push('budget residuo da proteggere')

    return {
      actionScore,
      priority,
      action,
      risk,
      scarcity,
      roleNeed,
      pressureScore,
      marketHeat,
      strongAlternatives,
      fairPrice,
      attackPrice,
      bargainPrice,
      max,
      market,
      headroomPct,
      budgetAfter,
      structuralSafety,
      pressure,
      temperature,
      reasons,
    }
  }


  function simulatePurchaseImpact(player: Player, simulatedPrice: number) {
    const priceNow = Math.max(1, simulatedPrice)
    const futureBudget = Math.max(0, budget - priceNow)
    const futureRoleRemaining = Math.max(0, roleRemaining(player.role) - 1)
    const futureSlots = Math.max(0, roles.reduce((total, role) => total + roleRemaining(role), 0) - 1)
    const mandatoryReserve = futureSlots
    const freeBudget = Math.max(0, futureBudget - mandatoryReserve)
    const avgFreePerSlot = futureSlots > 0 ? freeBudget / futureSlots : freeBudget

    const roleNeedsAfter = roles.map((role) => ({
      role,
      missing: role === player.role ? futureRoleRemaining : roleRemaining(role),
    }))

    const criticalRoles = roleNeedsAfter
      .filter((item) => item.missing > 0)
      .sort((a, b) => b.missing - a.missing)

    const futureTargets = availablePlayers
      .filter((candidate) => candidate.name !== player.name)
      .filter((candidate) => roleNeedsAfter.some((item) => item.role === candidate.role && item.missing > 0))
      .map((candidate) => ({
        candidate,
        max: calculateDynamicMax(candidate),
        score: chirurgoScore(candidate).total,
      }))
      .filter((item) => item.max <= Math.max(1, freeBudget))
      .sort((a, b) => b.score - a.score)

    const premiumAffordable = futureTargets.filter((item) => item.score >= 82).length
    const strongAffordable = futureTargets.filter((item) => item.score >= 72).length

    let verdict = 'SOSTENIBILE'
    if (futureBudget < mandatoryReserve) verdict = 'BLOCCA LA ROSA'
    else if (avgFreePerSlot < 3) verdict = 'MOLTO STRETTO'
    else if (premiumAffordable === 0 && futureSlots >= 4) verdict = 'LIMITA I TOP FUTURI'
    else if (freeBudget >= startingBudget * .20) verdict = 'MARGINE BUONO'

    return {
      futureBudget,
      futureSlots,
      mandatoryReserve,
      freeBudget,
      avgFreePerSlot,
      criticalRoles,
      premiumAffordable,
      strongAffordable,
      futureTargets: futureTargets.slice(0, 5),
      verdict,
    }
  }

  function roleOpportunityScore(player: Player) {
    const intel = buyNowIntelligence(player, getMarket(player))
    return intel.actionScore + (isStarred(player) ? 8 : 0)
  }

  function roleMarketTemperature(currentRole: Role) {
    const sales = [
      ...purchases.filter((item) => item.player.role === currentRole).map((item) => ({ player: item.player, price: item.price })),
      ...rivalSales.filter((item) => item.player.role === currentRole).map((item) => ({ player: item.player, price: item.price })),
    ]
    if (sales.length < 2) return { pct: 0, sample: sales.length, label: 'POCHI DATI' }
    const ratios = sales.map((item) => item.price / Math.max(1, getMarket(item.player)))
    const pct = Math.round((ratios.reduce((a, b) => a + b, 0) / ratios.length - 1) * 100)
    return { pct, sample: sales.length, label: pct >= 10 ? 'SURRISCALDATO' : pct <= -10 ? 'SCONTO' : 'REGOLARE' }
  }
  function commandCallScore(player: Player) {
    return specificSuggestionScore(player, 'top') + (isStarred(player) ? 28 : 0)
  }

  const nextCallCandidate = availablePlayers
    .filter((player) => player.role === commandCallRole)
    .map((player) => ({ player, score: commandCallScore(player) }))
    .sort((a, b) => b.score - a.score)[0] ?? null

  const bestDecoyCandidate = availablePlayers
    .filter((player) => player.role === commandDecoyRole)
    .filter((player) => !isStarred(player))
    .map((player) => ({ player, score: calculateDecoyScore(player) }))
    .sort((a, b) => b.score - a.score)[0] ?? null

  function commandCallWhy(player: Player) {
    const wish = wishlistItemFor(player)
    const roleLeft = roleRemaining(player.role)
    const market = getMarket(player)
    const max = calculateDynamicMax(player)
    const starter = estimatedStarterPct(player)
    const parts = [
      wish?.starred ? '★ È uno dei tuoi obiettivi prioritari' : `È il profilo ${player.role} più coerente con la situazione attuale`,
      `${roleLeft} slot del ruolo ancora liberi`,
      `titolarità stimata ${starter}%`,
      `mercato ${market} e MAX sostenibile ${max}`,
    ]
    if (player.penalties) parts.push('ha priorità anche per i rigori')
    if (player.setPieces) parts.push('porta calci piazzati')
    return `${parts.join(' · ')}. Chiamarlo ora serve a controllare il timing: se il prezzo resta nella fascia sostenibile puoi attaccare; se sale troppo, fai spendere gli altri senza compromettere il budget protetto per gli obiettivi con ★.`
  }

  function commandDecoyWhy(player: Player) {
    const temp = roleMarketTemperature(player.role)
    const market = getMarket(player)
    return `Non è marcato ★ e quindi può essere sacrificato come leva d'asta. Ha mercato ${market}; ${temp.sample >= 2 ? `il reparto è ${temp.label.toLowerCase()} (${temp.pct > 0 ? '+' : ''}${temp.pct}%)` : 'il reparto ha ancora pochi prezzi registrati'}. L'obiettivo è far uscire crediti ai rivali interessati al ruolo, conservando il tuo budget per i giocatori prioritari.`
  }

  function formatLiveStat(value: number | null | undefined, digits = 0) {
    if (value === null || value === undefined || Number.isNaN(value)) return '—'
    return digits > 0 ? value.toFixed(digits) : String(Math.round(value))
  }
  function evaluationComment(player: Player) {
    const market = getMarket(player)
    const max = calculateDynamicMax(player)
    const fit = calculateStrategyFit(player)
    const starter = estimatedStarterPct(player)
    if (market <= max * 0.78 && fit >= 75)
      return `Profilo molto interessante: il prezzo di mercato è sotto il tuo limite e il fit con ${currentStrategy.name} è alto. Puoi essere aggressivo senza perdere equilibrio.`
    if (player.penalties && player.setPieces && starter >= 75)
      return 'Profilo completo per bonus: buona titolarità stimata, rigori e piazzati aumentano il potenziale. Vale un piccolo premio rispetto al mercato.'
    if (market > max)
      return `Profilo valido, ma al prezzo di mercato rischia di comprimere il reparto. Prova a restare entro ${max} crediti oppure cerca un’alternativa con miglior rapporto qualità/prezzo.`
    if (starter < 60)
      return 'Profilo da usare come upside, non come certezza: la titolarità stimata è più bassa. Acquistalo solo con margine di prezzo.'
    return `Acquisto coerente con la strategia ${currentStrategy.name}: il punto chiave è non superare ${max} crediti e preservare il budget per gli slot ancora liberi.`
  }

  function freeMarketPercentile(player: Player) {
    const pool = availablePlayers
      .filter((candidate) =>
        suggestionRole === 'ALL'
          ? true
          : candidate.role === suggestionRole
      )
      .map((candidate) => getMarket(candidate))
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b)

    if (pool.length <= 1) return 50

    const market = getMarket(player)
    let belowOrEqual = 0

    pool.forEach((value) => {
      if (value <= market) belowOrEqual += 1
    })

    return Math.round(((belowOrEqual - 1) / (pool.length - 1)) * 100)
  }

  function freePureQuality(player: Player) {
    const tier = tierScore(player)
    const starter = estimatedStarterPct(player)
    const ratingRaw = player.averageRating2526 ?? 6
    const rating = Math.max(0, Math.min(100, (ratingRaw - 5) * 50))
    const bonus = Math.max(0, Math.min(100, (player.bonus ?? 0) * 12 + 40))
    const penalty = player.penalties ? 100 : 35
    const setPiece = player.setPieces ? 100 : 35
    const reliability =
      player.reliability?.toLowerCase().includes('alta') ||
      player.reliabilityLeague?.toLowerCase().includes('alta')
        ? 100
        : player.reliability?.toLowerCase().includes('media') ||
          player.reliabilityLeague?.toLowerCase().includes('media')
        ? 70
        : 50

    return (
      tier * 0.36 +
      starter * 0.24 +
      rating * 0.14 +
      bonus * 0.10 +
      reliability * 0.08 +
      penalty * 0.05 +
      setPiece * 0.03
    )
  }

  function freeQualityScore(player: Player, category: SuggestionCategory) {
    const quality = freePureQuality(player)
    const starter = estimatedStarterPct(player)
    const pricePct = freeMarketPercentile(player)
    const tier = tierScore(player)
    const bonus = Math.max(0, Math.min(100, (player.bonus ?? 0) * 12 + 40))
    const penalty = player.penalties ? 100 : 30
    const setPiece = player.setPieces ? 100 : 30

    // TOP — nessun vincolo economico: solo i migliori profili disponibili.
    if (category === 'top') {
      return quality
    }

    // TITOLARE — deve essere affidabile e collocarsi in una fascia di costo media.
    // 50° percentile = fascia ideale; il punteggio scende andando verso gli estremi.
    if (category === 'starter') {
      const mediumCostFit = Math.max(0, 100 - Math.abs(pricePct - 50) * 2)
      return (
        starter * 0.48 +
        quality * 0.28 +
        mediumCostFit * 0.20 +
        setPiece * 0.04
      )
    }

    // SCOMMESSA — costo basso, ma potenziale tecnico elevato.
    // Premia profili non ancora pienamente titolari, evitando però riserve pure.
    if (category === 'bet') {
      const cheapness = 100 - pricePct
      const upside =
        Math.max(0, 100 - starter) * 0.42 +
        tier * 0.28 +
        bonus * 0.14 +
        penalty * 0.08 +
        setPiece * 0.08

      const usableStarterFloor =
        starter >= 40 ? 100 : Math.max(0, starter * 2.5)

      return (
        cheapness * 0.38 +
        upside * 0.38 +
        quality * 0.14 +
        usableStarterFloor * 0.10
      )
    }

    // LOW BUDGET — pochissimi crediti ma con reale probabilità di giocare.
    if (category === 'low') {
      const cheapness = 100 - pricePct
      const starterGate =
        starter >= 70
          ? 100
          : starter >= 60
          ? 82
          : starter >= 50
          ? 58
          : starter >= 40
          ? 30
          : 0

      return (
        cheapness * 0.50 +
        starter * 0.30 +
        starterGate * 0.15 +
        quality * 0.05
      )
    }

    // ESCA — nomi appetibili e costosi, che hanno probabilità di attirare rilanci.
    // Qui il prezzo alto è volutamente un pregio, perché l'obiettivo è far spendere i rivali.
    return (
      pricePct * 0.46 +
      quality * 0.30 +
      tier * 0.12 +
      penalty * 0.07 +
      setPiece * 0.05
    )
  }

  function categoryScore(player: Player, category: SuggestionCategory) {
    if (strategy === 'free') return freeQualityScore(player, category)

    const target = calculateTargetScore(player)
    const starter = estimatedStarterPct(player)
    const market = getMarket(player)
    const max = Math.max(1, calculateDynamicMax(player))
    const value = Math.max(0, Math.min(100, 100 - (market / max) * 45))
    if (category === 'top') return target + tierScore(player) * 0.28 + (player.penalties ? 5 : 0)
    if (category === 'starter') return target * 0.58 + starter * 0.42
    if (category === 'bet') return calculateBetScore(player) + (100 - starter) * 0.08
    if (category === 'low') return value * 0.52 + target * 0.30 + starter * 0.18
    return calculateDecoyScore(player)
  }
  function squadTeamCount(team: string) {
    return purchases.filter((purchase) => purchase.player.team === team).length
  }

  function squadTeamShareWith(player: Player) {
    const futureSize = purchases.length + 1
    if (futureSize <= 0) return 0
    return Math.round(((squadTeamCount(player.team) + 1) / futureSize) * 100)
  }

  function modifierPotential(player: Player) {
    if (player.role !== 'D' && player.role !== 'P') return 0

    const starter = estimatedStarterPct(player)
    const rating = player.averageRating2526 ?? 6
    const ratingScore = Math.max(0, Math.min(100, (rating - 5.4) * 100))
    const reliabilityText = `${player.reliability ?? ''} ${player.reliabilityLeague ?? ''}`.toLowerCase()
    const reliability =
      reliabilityText.includes('alta') ? 100 :
      reliabilityText.includes('media') ? 72 : 52

    return Math.max(
      0,
      Math.min(
        100,
        ratingScore * 0.48 +
          starter * 0.32 +
          reliability * 0.20
      )
    )
  }

  function bugRolePotential(player: Player) {
    const textProfile = `${player.traits ?? ''} ${player.profile ?? ''} ${player.use ?? ''}`.toLowerCase()

    if (
      player.role === 'D' &&
      /(esterno|quinto|ala|offensiv|trequart|fascia)/.test(textProfile)
    ) return 100

    if (
      player.role === 'C' &&
      /(trequart|ala|seconda punta|attacc|offensiv|sottopunta)/.test(textProfile)
    ) return 100

    return 0
  }

  function goalkeeperSpecificFit(player: Player) {
    if (player.role !== 'P') return { bonus: 0, reasons: [] as string[] }

    let bonus = 0
    const reasons: string[] = []
    const ownedGoalkeepers = purchases.filter((purchase) => purchase.player.role === 'P')

    ownedGoalkeepers.forEach((purchase) => {
      const owned = purchase.player

      if (owned.team === player.team) {
        const sameTeamGoalkeepers = ownedGoalkeepers.filter((item) => item.player.team === player.team).length
        if (sameTeamGoalkeepers < 2) {
          bonus = Math.max(bonus, 18)
          reasons.push(
            `Completa il blocco ${player.team}: copertura diretta del portiere già acquistato ${owned.name}.`
          )
        }
      }

      const pairKey = [owned.team, player.team].sort().join('|')
      const pairBonus = goalkeeperTeamPairs[pairKey] ?? 0

      if (pairBonus > 0) {
        bonus = Math.max(bonus, Math.min(22, 7 + pairBonus * 0.22))
        const calendarNote = goalkeeperCalendarNotes[pairKey]
        reasons.push(
          calendarNote
            ? `Ottimo incastro con ${owned.name} (${owned.team}): ${calendarNote}.`
            : `Buon incastro di calendario con ${owned.name} (${owned.team}).`
        )
      }
    })

    return { bonus, reasons }
  }

  function staffettaSpecificFit(player: Player) {
    const mates = purchases.filter(
      (purchase) =>
        purchase.player.team === player.team &&
        purchase.player.role === player.role
    )

    if (mates.length === 0) return { bonus: 0, reasons: [] as string[] }

    const candidateStarter = estimatedStarterPct(player)
    const usefulMate = mates.find((purchase) => {
      const ownedStarter = estimatedStarterPct(purchase.player)
      return (
        (candidateStarter >= 40 && candidateStarter <= 80) ||
        (ownedStarter >= 40 && ownedStarter <= 80)
      )
    })

    if (!usefulMate) {
      return {
        bonus: -4,
        reasons: [`Hai già un ${player.role} del ${player.team}: aumenta la concentrazione sullo stesso club.`],
      }
    }

    return {
      bonus: 8,
      reasons: [
        `Potenziale staffetta/copertura con ${usefulMate.player.name} del ${player.team}: utile se il minutaggio viene ruotato.`,
      ],
    }
  }

  function squadSpecificAnalysis(player: Player) {
    let bonus = 0
    const positives: string[] = []
    const cautions: string[] = []

    const teamCount = squadTeamCount(player.team)
    const teamShare = squadTeamShareWith(player)

    // Concentrazione club: premia diversificazione, ma non penalizza i blocchi portieri.
    if (player.role !== 'P') {
      if (teamCount === 0) {
        bonus += 4
        positives.push(`Diversifica la rosa: al momento non hai giocatori del ${player.team}.`)
      } else if (teamShare >= 24) {
        bonus -= 15
        cautions.push(
          `Con questo acquisto circa il ${teamShare}% della rosa attuale sarebbe del ${player.team}: concentrazione molto alta.`
        )
      } else if (teamShare >= 18) {
        bonus -= 8
        cautions.push(
          `Il ${player.team} diventerebbe molto presente nella tua rosa (${teamShare}% della rosa attuale).`
        )
      } else if (teamCount >= 2) {
        bonus -= 3
        cautions.push(`Hai già ${teamCount} giocatori del ${player.team}: attenzione alla correlazione di calendario.`)
      }
    }

    const gk = goalkeeperSpecificFit(player)
    bonus += gk.bonus
    positives.push(...gk.reasons)

    const staffetta = staffettaSpecificFit(player)
    bonus += staffetta.bonus
    if (staffetta.bonus > 0) positives.push(...staffetta.reasons)
    else cautions.push(...staffetta.reasons)

    const modifier = modifierPotential(player)
    if (player.role === 'D' || player.role === 'P') {
      if (modifier >= 78) {
        bonus += 9
        positives.push(
          `Profilo molto interessante da modificatore (${Math.round(modifier)}/100): combina voto, affidabilità e titolarità.`
        )
      } else if (modifier >= 65) {
        bonus += 5
        positives.push(`Buona predisposizione al modificatore (${Math.round(modifier)}/100).`)
      }
    }

    const bug = bugRolePotential(player)
    if (bug >= 100) {
      bonus += 10
      positives.push(
        player.role === 'D'
          ? 'Possibile profilo “buggato”: listato difensore ma con caratteristiche/posizione più offensiva.'
          : 'Possibile profilo “buggato”: listato centrocampista ma con utilizzo avanzato/offensivo.'
      )
    }

    // Specialisti: utili soprattutto se la rosa non ne possiede già molti.
    const ownedPenalty = purchases.filter((purchase) => purchase.player.penalties).length
    const ownedSetPieces = purchases.filter((purchase) => purchase.player.setPieces).length

    if (player.penalties) {
      if (ownedPenalty === 0) bonus += 8
      else if (ownedPenalty <= 2) bonus += 4
      positives.push(
        ownedPenalty === 0
          ? 'Aggiunge il primo rigorista della tua rosa.'
          : `Aumenta la copertura rigori: hai già ${ownedPenalty} rigorist${ownedPenalty === 1 ? 'a' : 'i'}.`
      )
    }

    if (player.setPieces) {
      if (ownedSetPieces === 0) bonus += 6
      else if (ownedSetPieces <= 2) bonus += 3
      positives.push('Porta valore sui calci piazzati e aumenta le fonti di bonus.')
    }

    // Equilibrio del reparto.
    const remaining = roleRemaining(player.role)
    const boughtInRole = roleCount(player.role)
    const roleShare = slotLimits[player.role] > 0
      ? boughtInRole / slotLimits[player.role]
      : 0

    if (remaining > 0 && roleShare < purchases.length / 25) {
      bonus += 5
      positives.push(`Aiuta a riequilibrare il reparto ${player.role}, oggi meno completo rispetto al resto della rosa.`)
    }

    // Titolarità / copertura generale.
    const starter = estimatedStarterPct(player)
    if (starter >= 82) {
      bonus += 5
      positives.push(`Titolarità stimata molto alta (${starter}%): aumenta la stabilità della rosa.`)
    } else if (starter < 45) {
      bonus -= 5
      cautions.push(`Titolarità stimata ${starter}%: richiede copertura e tolleranza al rischio.`)
    }

    return {
      bonus: Math.max(-25, Math.min(30, bonus)),
      positives: Array.from(new Set(positives)),
      cautions: Array.from(new Set(cautions)),
      teamShare,
      modifier,
      bug,
    }
  }

  function playerKey(player: Player) {
    return `${player.name}|${player.team}`
  }

  function wishlistItemFor(player: Player) {
    return wishlist.find((item) => item.playerKey === playerKey(player))
  }

  function isStarred(player: Player) {
    return wishlistItemFor(player)?.starred === true
  }

  function wishlistPriorityBonus(player: Player) {
    const item = wishlistItemFor(player)
    if (!item) return 0
    const priorityBonus = Math.max(3, 17 - (Math.max(1, Math.min(20, item.priority)) - 1) * 0.75)
    // La stella è un obiettivo d'asta: pesa in tutti i suggerimenti senza superare i limiti strutturali.
    return priorityBonus + (item.starred ? 24 : 0)
  }

  function specificSuggestionScore(player: Player, category: SuggestionCategory) {
    const base = categoryScore(player, category)
    const analysis = squadSpecificAnalysis(player)
    const wishlistBonus = wishlistPriorityBonus(player)
    const live = chirurgoScore(player)
    const liveAdjustment =
      (live.liveForm - 55) * 0.10 +
      (live.availability - 70) * 0.12 +
      (live.value - 60) * 0.05

    // La categoria resta dominante; rosa, MY TEAM e dati live riordinano i profili vicini.
    return Math.max(0, Math.min(120, base + analysis.bonus + wishlistBonus + liveAdjustment))
  }

  function specificSuggestionExplanation(player: Player, category: SuggestionCategory) {
    const analysis = squadSpecificAnalysis(player)
    const reasons = analysis.positives.slice(0, 5)
    const warnings = analysis.cautions.slice(0, 3)
    const wish = wishlistItemFor(player)

    if (wish) {
      reasons.unshift(wish.starred
        ? `★ OBIETTIVO PRIORITARIO: è marcato con la stella. Il piano d'asta protegge budget e timing per aumentare le probabilità di prenderlo senza sforare il MAX sostenibile.`
        : `È nella tua MY TEAM con priorità ${wish.priority}: il motore lo considera esplicitamente tra i tuoi obiettivi.`)
    }

    const categoryIntro =
      category === 'top'
        ? 'È un TOP che si integra bene con ciò che hai già costruito.'
        : category === 'starter'
        ? 'È un TITOLARE che migliora equilibrio e affidabilità della rosa.'
        : category === 'bet'
        ? 'È una SCOMMESSA con upside coerente con le coperture già presenti.'
        : category === 'low'
        ? 'È un LOW BUDGET che prova a massimizzare minuti e utilità per credito.'
        : 'È un’ESCA utile per spostare budget degli avversari senza diventare una necessità per la tua rosa.'

    const positiveText =
      reasons.length > 0
        ? reasons.map((reason, index) => `${index + 1}) ${reason}`).join(' ')
        : 'Non crea una sinergia speciale con gli acquisti attuali, quindi viene valutato soprattutto per il suo profilo individuale.'

    const warningText =
      warnings.length > 0
        ? ` Attenzione: ${warnings.join(' ')}`
        : ''

    const live = chirurgoScore(player)
    const liveText = ` Dati live: forma ${scoreOutOf10(live.liveForm)}/10 · disponibilità ${scoreOutOf10(live.availability)}/10 · Chirurgo Score ${scoreOutOf10(live.total)}/10.`

    return `${categoryIntro} ${positiveText}${warningText}${liveText}`
  }
  const suggestionCandidates = useMemo(() => {
    if (!warRoleChosen || !warCallChosen || !suggestionCategory) return []
    return availablePlayers
      .filter((player) => suggestionRole === 'ALL' || player.role === suggestionRole)
      .filter((player) =>
        strategy === 'free' ? true : roleRemaining(player.role) > 0
      )
      .map((player) => ({
        player,
        score: specificSuggestionScore(player, suggestionCategory),
        baseScore: categoryScore(player, suggestionCategory),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
  }, [
    availablePlayers,
    suggestionRole,
    suggestionCategory,
    warRoleChosen,
    warCallChosen,
    budget,
    purchases,
    strategy,
    startingBudget,
    leagueSize,
    dataUpdates,
  ])



  const opportunityCandidates = useMemo(() => {
    return availablePlayers
      .filter((player) => roleRemaining(player.role) > 0)
      .map((player) => ({
        player,
        score: roleOpportunityScore(player),
        intel: buyNowIntelligence(player, getMarket(player)),
      }))
      .filter((item) => item.intel.action !== 'STOP')
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
  }, [
    availablePlayers,
    purchases,
    rivalSales,
    budget,
    startingBudget,
    leagueSize,
    strategy,
    suggestionMode,
    dataUpdates,
    wishlist,
  ])


  const rivalPredictions = useMemo(
    () =>
      rivalNames
        .slice(0, activeRivalCount)
        .map((_, rivalId) => rivalPrediction(rivalId))
        .sort((a, b) => b.threat - a.threat),
    [
      rivalNames,
      activeRivalCount,
      rivalSales,
      purchases,
      budget,
      startingBudget,
      leagueSize,
      strategy,
    ]
  )

  const averageRivalBudget = rivalPredictions.length > 0
    ? rivalPredictions.reduce((total, rival) => total + rival.remaining, 0) / rivalPredictions.length
    : startingBudget

  const averageRivalMaxOffer = rivalPredictions.length > 0
    ? rivalPredictions.reduce((total, rival) => total + rival.maxOffer, 0) / rivalPredictions.length
    : startingBudget

  const auctionProgressPct = Math.round((purchases.length / 25) * 100)
  const remainingSlotShare = Math.max(1, 25 - purchases.length) / 25
  const remainingBudgetShare = startingBudget > 0 ? budget / startingBudget : 0
  const cashEdge = budget - averageRivalBudget

  const predictiveCallCandidates = useMemo(
    () =>
      availablePlayers
          .filter((player) => roleRemaining(player.role) > 0)
          .map((player) => {
            const market = Math.max(1, getMarket(player))
            const intel = buyNowIntelligence(player, market)
            const move = auctionMoves.find((item) => item.role === player.role)
            const rivalInterest = activeRivals.length > 0
              ? activeRivals.reduce(
                  (total, _, rivalId) => total + rivalPlayerDanger(rivalId, player, market),
                  0
                ) / activeRivals.length
              : 1
            const callScore = clampScore(
              intel.actionScore * .64 +
              (move?.urgency ?? 5) * 10 * .16 +
              rivalInterest * 10 * .12 +
              (isStarred(player) ? 100 : wishlistItemFor(player) ? 72 : 45) * .08
            )
            return { player, intel, callScore, rivalInterest, move }
          })
          .sort((a, b) => b.callScore - a.callScore)
          .slice(0, 5),
    [
      availablePlayers,
      purchases,
      rivalSales,
      budget,
      startingBudget,
      leagueSize,
      strategy,
      suggestionMode,
      dataUpdates,
      wishlist,
      auctionMoves,
      rivalNames,
      activeRivalCount,
    ]
  )

  const predictiveBestCall = predictiveCallCandidates[0] ?? null

  const predictiveGlobalDecoy = useMemo(
    () =>
      availablePlayers
        .filter((player) => !isStarred(player) && roleRemaining(player.role) > 0)
        .map((player) => ({ player, score: calculateDecoyScore(player) }))
        .sort((a, b) => b.score - a.score)[0] ?? null,
    [
      availablePlayers,
      purchases,
      rivalSales,
      budget,
      startingBudget,
      leagueSize,
      strategy,
      dataUpdates,
      wishlist,
    ]
  )

  const dominantRival = rivalPredictions[0] ?? null
  const strongestRivalNeed = dominantRival?.primary ?? null

  let predictiveMode = 'CONTROLLO'
  if (purchases.length >= 20) predictiveMode = 'CHIUSURA'
  else if (remainingBudgetShare >= remainingSlotShare + .18 || cashEdge >= startingBudget * .12) predictiveMode = 'ATTACCO'
  else if (remainingBudgetShare + .10 < remainingSlotShare) predictiveMode = 'VALUE'
  else if (dominantRival && dominantRival.threat >= 8) predictiveMode = 'ANTI-RIVALE'

  let predictiveModeText = 'Mantieni flessibilità: compra solo entro prezzo corretto e osserva i rivali.'
  if (predictiveMode === 'ATTACCO') predictiveModeText = 'Hai potere di cassa: anticipa i target forti prima che i rivali possano riallinearsi.'
  if (predictiveMode === 'VALUE') predictiveModeText = 'La cassa va protetta: cerca titolari sostenibili e sfrutta le occasioni sotto mercato.'
  if (predictiveMode === 'ANTI-RIVALE') predictiveModeText = dominantRival
    ? `${dominantRival.name} è la minaccia principale: evita guerre inutili, ma colpisci i reparti dove ha più bisogno.`
    : predictiveModeText
  if (predictiveMode === 'CHIUSURA') predictiveModeText = 'Fase finale: completa gli slot senza lasciare crediti inutilizzati e proteggi almeno 1 credito per ogni posto residuo.'

  let predictiveCallAction = 'CHIAMA TARGET'
  if (predictiveBestCall) {
    if (predictiveBestCall.intel.action === 'STOP') predictiveCallAction = 'NON CHIAMARE'
    else if (predictiveBestCall.intel.actionScore >= 82) predictiveCallAction = 'CHIAMA E PROVA A CHIUDERE'
    else if (
      predictiveGlobalDecoy &&
      strongestRivalNeed &&
      predictiveGlobalDecoy.player.role === strongestRivalNeed.role &&
      predictiveGlobalDecoy.score >= 72
    ) predictiveCallAction = 'USA ESCA PRIMA'
    else if (predictiveBestCall.intel.actionScore < 66) predictiveCallAction = 'TESTA IL MERCATO'
  }


  const closingPlan = useMemo(
    () =>
      roles.map((role) => {
          const missing = roleRemaining(role)
          const budgetRoom = Math.max(0, adaptiveRoleBudget(role) - spentByRole(role))
          const minReserve = missing
          const attackRoom = Math.max(0, budgetRoom - minReserve)
          const availableRole = availablePlayers
            .filter((player) => player.role === role)
            .map((player) => ({ player, score: chirurgoScore(player).total, max: calculateDynamicMax(player) }))
            .sort((a, b) => b.score - a.score)

          const topAffordable = availableRole.find((item) => item.max <= Math.max(1, budget))
          return {
            role,
            missing,
            budgetRoom,
            minReserve,
            attackRoom,
            topAffordable,
          }
        }),
    [
      availablePlayers,
      purchases,
      budget,
      startingBudget,
      leagueSize,
      strategy,
      dataUpdates,
    ]
  )

  const totalMissingSlots = closingPlan.reduce((total, item) => total + item.missing, 0)
  const minimumClosingReserve = totalMissingSlots
  const closingAttackBudget = Math.max(0, budget - minimumClosingReserve)
  const closingHealth =
    totalMissingSlots === 0 ? 'ROSA COMPLETA' :
    budget < minimumClosingReserve ? 'EMERGENZA' :
    closingAttackBudget >= startingBudget * .12 ? 'FORTE' :
    closingAttackBudget >= totalMissingSlots * 3 ? 'GESTIBILE' : 'STRETTA'


  const remainingMarketNeed = useMemo(
    () =>
      roles.reduce((total, role) => {
        const missing = roleRemaining(role)
        if (missing <= 0) return total
        const roleMarkets = availablePlayers
          .filter((player) => player.role === role)
          .map((player) => Math.max(1, getMarket(player)))
          .sort((a, b) => a - b)
        const expected = roleMarkets.slice(0, missing).reduce((sum, value) => sum + value, 0)
        return total + Math.max(missing, expected)
      }, 0),
    [
      availablePlayers,
      purchases,
      budget,
      startingBudget,
      leagueSize,
      strategy,
      dataUpdates,
    ]
  )

  const projectedUnusedCredits = Math.max(0, budget - remainingMarketNeed)
  const unusedCreditRisk = clampScore(
    totalMissingSlots <= 0
      ? (budget > 0 ? 100 : 0)
      : projectedUnusedCredits / Math.max(1, budget) * 100
  )

  const endgameAttackPerOpenSlot = totalMissingSlots > 0
    ? Math.max(1, Math.floor(closingAttackBudget / totalMissingSlots))
    : closingAttackBudget

  let endgameMode = 'NORMALE'
  if (totalMissingSlots <= 5) endgameMode = 'ENDGAME'
  if (totalMissingSlots <= 3 && projectedUnusedCredits >= totalMissingSlots * 5) endgameMode = 'SPENDI ORA'
  if (budget < minimumClosingReserve) endgameMode = 'EMERGENZA'

  let endgameInstruction = 'Mantieni il piano e continua a rispettare i MAX dinamici.'
  if (endgameMode === 'ENDGAME') {
    endgameInstruction = `Puoi aumentare l'aggressività: hai circa ${endgameAttackPerOpenSlot} crediti di attacco per slot ancora aperto oltre alla riserva minima.`
  }
  if (endgameMode === 'SPENDI ORA') {
    endgameInstruction = `Rischi di lasciare ${projectedUnusedCredits} crediti inutilizzati: alza i MAX sui veri target e chiudi qualità adesso.`
  }
  if (endgameMode === 'EMERGENZA') {
    endgameInstruction = 'Proteggi un credito per ogni slot residuo e interrompi subito le aste non indispensabili.'
  }

  const wishlistPlayers = useMemo(() => {
    return wishlist
      .map((item) => {
        const player = players.find((candidate) => playerKey(candidate) === item.playerKey)
        return player ? { item, player } : null
      })
      .filter((entry): entry is { item: WishlistItem; player: Player } => Boolean(entry))
  }, [wishlist])

  const wishlistAddResults = useMemo(() => {
    const query = wishlistSearch.trim().toLowerCase()

    return availablePlayers
      .filter((player) => player.role === wishlistAddRole)
      .filter((player) => !wishlist.some((item) => item.playerKey === playerKey(player)))
      .filter((player) =>
        !query ||
        player.name.toLowerCase().includes(query) ||
        player.team.toLowerCase().includes(query)
      )
      .sort((a, b) => calculateTargetScore(b) - calculateTargetScore(a))
      .slice(0, 12)
  }, [wishlistSearch, wishlistAddRole, wishlist, availablePlayers, leagueSize, startingBudget, strategy])

  function addToWishlist(player: Player) {
    const sameRoleEntries = wishlistPlayers.filter(
      (entry) => entry.player.role === player.role
    )

    if (sameRoleEntries.length >= wishlistLimits[player.role]) {
      window.alert(`MY TEAM può contenere al massimo ${wishlistLimits[player.role]} ${roleNames[player.role].toLowerCase()}.`)
      return
    }

    const sameRole = sameRoleEntries.map((entry) => entry.item.priority)

    const nextPriority = Math.min(wishlistLimits[player.role], Math.max(0, ...sameRole) + 1)

    setWishlist((current) => [
      ...current,
      { playerKey: playerKey(player), priority: nextPriority },
    ])
    setWishlistSearch('')
    setWishlistAddOpen(false)
  }

  function removeFromWishlist(key: string) {
    setWishlist((current) => current.filter((item) => item.playerKey !== key))
  }

  function updateWishlistPriority(key: string, priority: number) {
    const player = players.find((candidate) => playerKey(candidate) === key)
    const limit = player ? wishlistLimits[player.role] : 20
    setWishlist((current) =>
      current.map((item) =>
        item.playerKey === key
          ? { ...item, priority: Math.max(1, Math.min(limit, priority)) }
          : item
      )
    )
  }

  function updateWishlistComment(key: string, comment: string) {
    setWishlist((current) =>
      current.map((item) => item.playerKey === key ? { ...item, comment } : item)
    )
  }

  function toggleWishlistStar(key: string) {
    setWishlist((current) =>
      current.map((item) => item.playerKey === key ? { ...item, starred: !item.starred } : item)
    )
  }
  function wishlistUsefulDetails(player: Player) {
    const details: string[] = []
    const starter = estimatedStarterPct(player)
    const update = dataUpdateFor(player)

    if (update?.injuryStatus === 'injured') {
      details.push(`⚕ ${update.injury || 'Infortunato'}${update.recoveryTime ? ` · ${update.recoveryTime}` : update.expectedReturn ? ` · rientro ${update.expectedReturn}` : ''}`)
    } else if (update?.injuryStatus === 'doubt') {
      details.push(`⚠ Condizione da monitorare${update.injury ? ` · ${update.injury}` : ''}`)
    } else if (update?.injuryStatus === 'recovering') {
      details.push(`↗ Recupero${update.expectedReturn ? ` · ${update.expectedReturn}` : ''}`)
    } else if (update?.injuryStatus === 'suspended') {
      details.push('⛔ Squalificato')
    }

    if (update?.usefulDetails?.trim()) details.push(update.usefulDetails.trim())

    if (player.penalties) details.push('Rigorista')
    if (player.setPieces) details.push('Piazzati')
    if (player.role === 'D' || player.role === 'P') {
      const modifier = modifierPotential(player)
      if (modifier >= 65) details.push(`Mod ${Math.round(modifier)}/100`)
    }
    if (bugRolePotential(player) >= 100) details.push('Ruolo bug')
    if (starter >= 82) details.push('Alta titolarità')

    const specific = squadSpecificAnalysis(player)
    if (specific.positives.length > 0) {
      details.push(specific.positives[0])
    }

    return details.length > 0 ? details.slice(0, 3).join(' · ') : 'Profilo da monitorare'
  }

  async function refreshApplicationVersion() {
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations()
        await Promise.all(
          registrations.map(async (registration) => {
            try {
              await registration.update()
              await registration.unregister()
            } catch {
              // Se un singolo service worker non risponde, continuiamo comunque.
            }
          })
        )
      }

      if ('caches' in window) {
        const cacheNames = await caches.keys()
        await Promise.all(cacheNames.map((name) => caches.delete(name)))
      }

      await fetch(`${window.location.pathname}?app-refresh=${Date.now()}`, {
        method: 'GET',
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      })
    } catch {
      // Il reload con cache-buster resta il fallback finale.
    }
  }

  async function runDataUpdate(options: { silent?: boolean; reload?: boolean } = {}) {
    const silent = options.silent === true
    if (!navigator.onLine) {
      if (silent) return
      setUpdateStatus('error')
      setUpdateError('Nessuna connessione. Restano attivi gli ultimi dati salvati.')
      return
    }

    if (!silent) {
      setUpdateStatus('updating')
      setUpdateError('')
      setUpdateChangesOpen(false)
    }

    try {
      const endpoints = [UPDATE_ENDPOINT, UPDATE_ENDPOINT_FALLBACK]
      let payload: UpdatePayload | null = null
      let lastError = ''

      for (const endpoint of endpoints) {
        try {
          const response = await fetch(`${endpoint}?t=${Date.now()}`, {
            method: 'GET', cache: 'no-store',
            headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
          })
          if (!response.ok) {
            let detail = ''
            try { detail = ((await response.json()) as { error?: string }).error ?? '' } catch { /* no body */ }
            lastError = `HTTP ${response.status}${detail ? ` · ${detail}` : ''}`
            continue
          }
          const candidate = await response.json() as UpdatePayload
          if (!candidate || typeof candidate.generatedAt !== 'string' || !Array.isArray(candidate.players)) {
            lastError = 'Pacchetto ricevuto non valido'
            continue
          }
          payload = candidate
          break
        } catch (error) {
          lastError = error instanceof Error ? error.message : 'errore di rete'
        }
      }

      if (!payload) throw new Error(`Aggiornamento non disponibile${lastError ? `: ${lastError}` : ''}`)

      const normalized = payload.players
        .filter((item) => item && typeof item.playerKey === 'string' && item.playerKey.includes('|'))
        .map(compactUpdateForStorage)

      if (normalized.length < 100) throw new Error(`Feed incompleto: ricevuti solo ${normalized.length} giocatori.`)

      const map = Object.fromEntries(normalized.map((item) => [item.playerKey, item]))
      const meta: UpdateMeta = {
        version: payload.version,
        generatedAt: payload.generatedAt,
        downloadedAt: new Date().toISOString(),
        sourceLabel: payload.sourceLabel,
        playerCount: normalized.length,
      }

      // Prima rendiamo SUBITO attivi i nuovi dati in memoria: l'asta non deve dipendere dalla quota storage del telefono.
      setDataUpdates(map)
      setUpdateMeta(meta)

      // Persistenza best-effort e compatta. Se Safari/iOS ha la memoria piena, l'update resta valido per la sessione corrente.
      const dataSaved = saveSourceJsonSafely(DATA_UPDATE_KEY, normalized)
      const metaSaved = saveSourceJsonSafely(DATA_UPDATE_META_KEY, meta)
      setUpdateChanges((payload.changes ?? []).slice(0, 100))
      setPhase1ChangeCount(Math.min(100, payload.changes?.length ?? 0))
      setDataManifest((current) => ({
        ...current,
        updatedAt: payload!.generatedAt,
        datasets: {
          ...current.datasets,
          players: { updatedAt: payload!.generatedAt, source: payload!.sourceLabel ?? 'LIVE FEED' },
          fantacalcio: { updatedAt: payload!.generatedAt, source: payload!.sourceLabel ?? 'LIVE FEED' },
          stats: { updatedAt: payload!.generatedAt, source: payload!.sourceLabel ?? 'LIVE FEED' },
          injuries: { updatedAt: payload!.generatedAt, source: payload!.sourceLabel ?? 'LIVE FEED' },
        },
      }))

      if (!silent) {
        setUpdateStatus('success')
        setUpdateError(
          dataSaved && metaSaved
            ? ''
            : 'Dati aggiornati e attivi. La memoria del telefono è piena: il pacchetto potrebbe non restare salvato dopo la chiusura dell’app.'
        )
      }
    } catch (error) {
      if (!silent) {
        setUpdateStatus('error')
        setUpdateError(
          isStorageQuotaError(error)
            ? 'Memoria locale piena. Ho evitato di toccare rosa e asta: usa “Pulisci dati scaricati” e riprova.'
            : error instanceof Error ? error.message : 'Aggiornamento non riuscito.'
        )
      }
    }
  }

  function exportPhase1Backup() {
    const backup = createUserBackup()
    const date = new Date().toISOString().slice(0, 10)
    downloadJson(`fantawarroom-backup-${date}.json`, backup)
  }

  function importPhase1Backup() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const backup = JSON.parse(await file.text()) as UserBackup
        restoreUserBackup(backup)
        window.alert('Backup ripristinato. L’app verrà ricaricata.')
        window.location.reload()
      } catch {
        window.alert('Backup non valido o illeggibile.')
      }
    }
    input.click()
  }

  function clearDownloadedData() {
    const confirmed = window.confirm(
      'Vuoi eliminare solo il pacchetto dati scaricato? Rosa, MY TEAM, asta, rivali e storico non verranno toccati.'
    )
    if (!confirmed) return

    localStorage.removeItem(DATA_UPDATE_KEY)
    localStorage.removeItem(DATA_UPDATE_META_KEY)
    setDataUpdates({})
    setUpdateMeta(null)
    setUpdateChanges([])
    setUpdateStatus('idle')
    setUpdateError('')
  }

  function updateStatusLabel() {
    if (updateStatus === 'updating') return 'AGGIORNAMENTO IN CORSO…'
    if (updateStatus === 'success') return 'APP E DATI AGGIORNATI'
    if (updateStatus === 'error') return 'AGGIORNAMENTO NON RIUSCITO'
    return updateMeta ? 'DATABASE LOCALE PRONTO' : 'DATABASE BASE'
  }

  function formatUpdateDate(value?: string | null) {
    if (!value) return '—'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const dynamicMaxBid = selectedPlayer
    ? calculateGameTheoryMax(selectedPlayer, price)
    : 0
  const decision = selectedPlayer ? getDecision(selectedPlayer, price) : null
  const liveResults = useMemo(() => {
    const search = liveSearch.trim().toLowerCase()
    if (!search) return []
    return availablePlayers
      .filter(
        (player) =>
          player.name.toLowerCase().includes(search) ||
          player.team.toLowerCase().includes(search)
      )
      .sort((a, b) => calculateTargetScore(b) - calculateTargetScore(a))
      .slice(0, 12)
  }, [liveSearch, availablePlayers, leagueSize, budget, purchases, adaptiveBudgets, startingBudget, strategy])

  const livePlayer = availablePlayers.find(
    (player) => player.name === liveSelectedName
  )
  const liveDynamicMax = livePlayer
    ? calculateGameTheoryMax(livePlayer, livePrice)
    : 0
  const liveScore = livePlayer ? calculateTargetScore(livePlayer) : 0
  const liveDecision = livePlayer ? getDecision(livePlayer, livePrice) : null
  const liveMargin = livePlayer ? liveDynamicMax - livePrice : 0
  const livePressure = livePlayer
    ? getAuctionPressure(livePlayer, livePrice)
    : null

  const liveBudgetAfter = livePlayer ? budget - livePrice : budget
  const liveSlotsAfter = livePlayer ? Math.max(0, slotsRemaining - 1) : slotsRemaining
  const liveCreditsPerSlotAfter =
    liveSlotsAfter > 0 ? Math.max(0, liveBudgetAfter) / liveSlotsAfter : 0

  const liveTargetValue = livePlayer ? calculateTargetScore(livePlayer) : 0
  const liveBetValue = livePlayer ? calculateBetScore(livePlayer) : 0
  const liveDecoyValue = livePlayer ? calculateDecoyScore(livePlayer) : 0

  const liveBidThresholds = livePlayer ? bidThresholds(livePlayer) : null

  const liveCallType = livePlayer
    ? liveDecoyValue >= liveTargetValue + 8 && liveDecoyValue >= liveBetValue + 5
      ? { label: 'ESCA', icon: '🪤', score: liveDecoyValue }
      : liveBetValue >= liveTargetValue + 5
      ? { label: 'SCOMMESSA', icon: '🎲', score: liveBetValue }
      : { label: 'TARGET', icon: '🎯', score: liveTargetValue }
    : null

  const liveBudgetImpact =
    livePlayer && livePrice > liveDynamicMax
      ? { label: 'PESANTE', color: '#ff8b8b' }
      : livePlayer && livePrice > getMarket(livePlayer)
      ? { label: 'MEDIO', color: '#f2c66d' }
      : { label: 'SOSTENIBILE', color: '#70d6a1' }

  const liveSimulation = livePlayer
    ? simulatePurchase(livePlayer, livePrice)
    : null

  function simulatePurchase(player: Player, price: number) {
    const afterBudget = budget - price
    const afterPurchases = [...purchases, { player, price }]
    const afterSlots = Math.max(0, 25 - afterPurchases.length)

    const roleCountsAfter = roles.reduce((acc, currentRole) => {
      acc[currentRole] = afterPurchases.filter(
        (purchase) => purchase.player.role === currentRole
      ).length
      return acc
    }, {} as Record<Role, number>)

    const roleSpentAfter = roles.reduce((acc, currentRole) => {
      acc[currentRole] = afterPurchases
        .filter((purchase) => purchase.player.role === currentRole)
        .reduce((total, purchase) => total + purchase.price, 0)
      return acc
    }, {} as Record<Role, number>)

    const roleRemainingAfter = (currentRole: Role) =>
      Math.max(0, slotLimits[currentRole] - roleCountsAfter[currentRole])

    const plannedResidualAfter = roles.reduce((acc, currentRole) => {
      acc[currentRole] = Math.max(
        0,
        plannedRoleBudget(currentRole) - roleSpentAfter[currentRole]
      )
      return acc
    }, {} as Record<Role, number>)

    const minimumReserveAfter = roles.reduce(
      (total, currentRole) => total + roleRemainingAfter(currentRole),
      0
    )

    const discretionaryAfter = Math.max(0, afterBudget - minimumReserveAfter)
    const totalResidualAfter = roles.reduce(
      (total, currentRole) =>
        total +
        (roleRemainingAfter(currentRole) > 0
          ? plannedResidualAfter[currentRole]
          : 0),
      0
    )

    const adaptiveAfter = {} as Record<Role, number>

    if (afterBudget <= 0) {
      roles.forEach((currentRole) => (adaptiveAfter[currentRole] = 0))
    } else if (afterBudget < minimumReserveAfter) {
      roles.forEach((currentRole) => {
        adaptiveAfter[currentRole] =
          minimumReserveAfter > 0
            ? (afterBudget * roleRemainingAfter(currentRole)) / minimumReserveAfter
            : 0
      })
    } else if (totalResidualAfter > discretionaryAfter) {
      roles.forEach((currentRole) => {
        if (roleRemainingAfter(currentRole) <= 0) {
          adaptiveAfter[currentRole] = 0
          return
        }
        const share =
          totalResidualAfter > 0
            ? plannedResidualAfter[currentRole] / totalResidualAfter
            : 0
        adaptiveAfter[currentRole] =
          roleRemainingAfter(currentRole) + discretionaryAfter * share
      })
    } else {
      const surplus = Math.max(0, discretionaryAfter - totalResidualAfter)
      const openWeight = roles.reduce(
        (total, currentRole) =>
          total +
          (roleRemainingAfter(currentRole) > 0
            ? plannedRoleBudget(currentRole)
            : 0),
        0
      )

      roles.forEach((currentRole) => {
        if (roleRemainingAfter(currentRole) <= 0) {
          adaptiveAfter[currentRole] = 0
          return
        }
        const extra =
          openWeight > 0
            ? surplus * (plannedRoleBudget(currentRole) / openWeight)
            : 0
        adaptiveAfter[currentRole] =
          plannedResidualAfter[currentRole] + extra
      })
    }

    const roleAveragesAfter = roles.reduce((acc, currentRole) => {
      const remaining = roleRemainingAfter(currentRole)
      acc[currentRole] =
        remaining > 0 ? adaptiveAfter[currentRole] / remaining : 0
      return acc
    }, {} as Record<Role, number>)

    const availableAfter = availablePlayers.filter(
      (candidate) =>
        !(candidate.name === player.name && candidate.team === player.team)
    )

    const nextTargets = roles.reduce((acc, currentRole) => {
      if (roleRemainingAfter(currentRole) <= 0) {
        acc[currentRole] = null
        return acc
      }

      const candidates = availableAfter
        .filter((candidate) => candidate.role === currentRole)
        .map((candidate) => {
          const market = getMarket(candidate)
          const tier = tierScore(candidate)
          const fit = getFit(candidate) ?? 50
          const average = Math.max(1, roleAveragesAfter[currentRole])
          const affordability =
            market <= average ? 100 :
            market <= average * 1.4 ? 72 :
            market <= average * 2 ? 45 : 20
          const strategyFit = calculateStrategyFit(candidate)

          return {
            player: candidate,
            score:
              fit * 0.28 +
              tier * 0.22 +
              affordability * 0.25 +
              strategyFit * 0.25,
          }
        })
        .sort((a, b) => b.score - a.score)

      acc[currentRole] = candidates[0]?.player ?? null
      return acc
    }, {} as Record<Role, Player | null>)

    const safePrice = Math.max(0, price)
    const remainingBudget = Math.max(0, afterBudget)
    const remainingSlots = afterSlots
    const reserve = Math.max(0, remainingSlots)
    const spendable = Math.max(0, remainingBudget - reserve)
    const score = chirurgoScore(player)
    const affordability = safePrice <= calculateGameTheoryMax(player, safePrice) ? 100 : 45
    const projected = clampScore(
      (purchases.length ? finalReportScore : 72) * .48 +
      score.total * .37 +
      affordability * .15
    )
    const sustainable =
      safePrice <= calculateStructuralMax(player) && remainingBudget >= reserve

    return {
      afterBudget,
      afterSlots,
      adaptiveAfter,
      roleAveragesAfter,
      nextTargets,
      afterCreditsPerSlot: afterSlots > 0 ? afterBudget / afterSlots : 0,
      remainingBudget,
      remainingSlots,
      spendable,
      projected,
      sustainable,
    }
  }

  function changeStartingBudget(newBudget: StartingBudget) {
    if (newBudget === startingBudget) return
    if (purchases.length > 0 || rivalSales.length > 0) {
      const confirmed = window.confirm(
        'Cambiare il budget iniziale azzera l’asta corrente. Continuare?'
      )
      if (!confirmed) return
    }
    setStartingBudget(newBudget)
    setBudget(newBudget)
    setPurchases([])
    setRivalSales([])
    setSelectedName('')
    setPlayerSearch('')
    setPrice(1)
    setLiveSearch('')
    setLiveSelectedName('')
    setLivePrice(1)
    setMessage(`Budget impostato a ${newBudget} crediti.`)
  }

  function changeLeagueSize(newLeagueSize: LeagueSize) {
    setLeagueSize(newLeagueSize)
    setSelectedName('')
    setPlayerSearch('')
    if (selectedRivalId > newLeagueSize - 2) setSelectedRivalId(0)
  }



  function changePlayer(playerName: string) {
    const player = availablePlayers.find((item) => item.name === playerName)
    if (!player) return
    setSelectedName(player.name)
    setPlayerSearch(player.name)
    setPrice(getMarket(player))
  }

  function handlePlayerSearch(value: string) {
    setPlayerSearch(value)
    setSelectedName('')
    setMessage('')
  }

  function resetWarChoiceFlow() {
    setSuggestionRole('ALL')
    setSuggestionCategory(null)
    setWarRoleChosen(false)
    setWarCallChosen(false)
  }

  function resetSearchEvaluate() {
    setSelectedName('')
    setPlayerSearch('')
    setPrice(1)
    setMessage('')
  }

  function toggleComparisonPlayer(player: Player) {
    setComparisonNames((current) => {
      if (current.includes(player.name)) {
        return current.filter((name) => name !== player.name)
      }
      if (current.length >= 3) return current
      return [...current, player.name]
    })
  }

  function resetComparison() {
    setComparisonNames([])
  }

  function resetDecisionDesk() {
    resetSearchEvaluate()
    resetComparison()
    setLiveSearch('')
    setLiveSelectedName('')
    setLivePrice(1)
    setLiveMessage('')
  }


  function roleFocusPlan(role: Role) {
    const missing = roleRemaining(role)
    const room = Math.max(0, adaptiveRoleBudget(role) - spentByRole(role))
    const avgPerSlot = missing > 0 ? Math.floor(room / missing) : room
    const move = auctionMoves.find((item) => item.role === role)
    const candidates = availablePlayers
      .filter((player) => player.role === role)
      .map((player) => ({
        player,
        score: chirurgoScore(player).total,
        max: calculateDynamicMax(player),
      }))
      .sort((a, b) => b.score - a.score)

    const premium = candidates.filter((item) => item.score >= 82 && item.max <= Math.max(1, room)).length
    const strong = candidates.filter((item) => item.score >= 72 && item.max <= Math.max(1, room)).length

    let status = 'GESTIONE'
    if (missing <= 0) status = 'COMPLETO'
    else if (move && move.urgency >= 78) status = 'ATTACCA'
    else if (room <= missing * 2) status = 'PROTEGGI'
    else if (premium > 0 && avgPerSlot >= 10) status = 'CERCA TOP'
    else if (strong >= Math.max(3, missing)) status = 'ASPETTA VALUE'

    let instruction = move?.reason ?? 'Mantieni disciplina sui prezzi e segui i MAX dinamici.'
    if (status === 'COMPLETO') instruction = 'Reparto completo: non spendere altri crediti qui.'
    if (status === 'PROTEGGI') instruction = `Budget stretto: conserva almeno ${missing} crediti per chiudere tutti gli slot.`
    if (status === 'CERCA TOP') instruction = 'Hai margine per un profilo premium: attacca solo i target realmente superiori.'
    if (status === 'ASPETTA VALUE') instruction = 'Ci sono ancora alternative forti: evita di inseguire aste surriscaldate.'

    return { missing, room, avgPerSlot, premium, strong, status, instruction }
  }

  function sameRoleRank(player: Player) {
    const ranked = availablePlayers
      .filter((item) => item.role === player.role)
      .map((item) => ({ item, score: chirurgoScore(item).total }))
      .sort((a, b) => b.score - a.score)
    const position = Math.max(1, ranked.findIndex(({ item }) => playerKey(item) === playerKey(player)) + 1)
    return { position, total: ranked.length, score: chirurgoScore(player).total }
  }

  function directAlternative(player: Player) {
    const update = dataUpdateFor(player)
    if (update?.competition?.trim()) return update.competition.trim()

    const alternatives = availablePlayers
      .filter((item) => item.team === player.team && item.role === player.role && playerKey(item) !== playerKey(player))
      .sort((a, b) => chirurgoScore(b).total - chirurgoScore(a).total)
    return alternatives[0]?.name ? `${alternatives[0].name} (concorrente stimato)` : 'N/D'
  }

  function injuryLine(player: Player) {
    const update = dataUpdateFor(player)
    if (!update?.injury && !update?.injuryStatus) return 'N/D · nessun dato infortunio disponibile nel feed'
    const status = update.injuryStatus === 'injured' ? 'INFORTUNATO' :
      update.injuryStatus === 'recovering' ? 'RECUPERO' :
      update.injuryStatus === 'doubt' ? 'IN DUBBIO' :
      update.injuryStatus === 'suspended' ? 'SQUALIFICATO' : 'DISPONIBILE'
    const timing = update.recoveryTime || (update.expectedReturn ? `rientro ${update.expectedReturn}` : '')
    return [status, update.injury, timing].filter(Boolean).join(' · ')
  }

  function setPieceLine(player: Player) {
    const update = dataUpdateFor(player)
    const penalties = update?.penalties ?? player.penalties ?? false
    const setPieces = update?.setPieces ?? player.setPieces ?? false
    if (penalties && setPieces) return 'Rigorista · calci piazzati'
    if (penalties) return 'Rigorista'
    if (setPieces) return 'Calci piazzati'
    return 'Nessuna gerarchia certa disponibile'
  }

  function conciseProsCons(player: Player) {
    const update = dataUpdateFor(player)
    const score = chirurgoScore(player)
    const pros = update?.pro?.trim() || player.profile?.trim() ||
      `Rating ${score.total}/100 nel ruolo; titolarità stimata ${score.starter}%; ${setPieceLine(player).toLowerCase()}.`
    const cons = update?.contra?.trim() || player.note?.trim() ||
      (score.availability < 70 ? injuryLine(player) : `Valuta il prezzo: oltre il MAX personale il rapporto qualità/prezzo peggiora.`)
    return { pros, cons }
  }

  function livePriceZone(player: Player, currentPrice: number) {
    const intel = buyNowIntelligence(player, currentPrice)
    if (currentPrice > intel.max) return { label: 'ROSSO · STOP', detail: `Non rilanciare oltre ${intel.max}.` }
    if (currentPrice > intel.attackPrice) return { label: 'ARANCIO · SOLO SE SERVE', detail: `Sei oltre la fascia d’attacco (${intel.attackPrice}); massimo assoluto ${intel.max}.` }
    if (currentPrice > intel.fairPrice) return { label: 'GIALLO · DISCIPLINA', detail: `Prezzo sopra il valore ideale (${intel.fairPrice}), ma ancora gestibile.` }
    return { label: 'VERDE · VALUE', detail: `Prezzo entro la fascia ideale; prossimo rilancio ${currentPrice + 1}.` }
  }

  function unifiedAuctionDecision(player: Player, currentPrice: number) {
    const intel = buyNowIntelligence(player, currentPrice)
    const forecast = finalPriceForecast(player, currentPrice)
    const plan = roleFocusPlan(player.role)
    const simulation = simulatePurchaseImpact(player, currentPrice)

    let verdict = intel.action
    if (currentPrice > intel.max) verdict = 'LASCIA'
    else if (plan.status === 'PROTEGGI' && currentPrice > intel.fairPrice) verdict = 'LASCIA'
    else if (intel.actionScore >= 84 && forecast.entry === 'ENTRA ORA') verdict = 'PRENDILO'
    else if (intel.actionScore >= 74 && currentPrice <= intel.attackPrice) verdict = 'ATTACCA'
    else if (forecast.entry === 'NON SCOPRIRTI' || forecast.entry === 'PREPARATI') verdict = 'ASPETTA'
    else if (intel.action === 'RESTA IN GARA') verdict = 'RESTA'
    else if (intel.action === 'STOP') verdict = 'LASCIA'

    const confidence = clampScore(
      intel.actionScore * .46 +
      (100 - intel.risk) * .24 +
      forecast.winChance * .18 +
      Math.min(100, intel.structuralSafety) * .12
    )

    let nextMove = `Non superare ${intel.max}.`
    if (verdict === 'PRENDILO') nextMove = `Entra adesso e prova a chiudere entro ${intel.attackPrice}; STOP assoluto ${intel.max}.`
    else if (verdict === 'ATTACCA') nextMove = `Rilancia con decisione fino a ${intel.attackPrice}; oltre, valuta solo fino a ${intel.max}.`
    else if (verdict === 'ASPETTA') nextMove = `Non scoprire subito il tuo interesse. Finestra d'ingresso: circa ${forecast.entryThreshold}.`
    else if (verdict === 'RESTA') nextMove = `Resta dentro senza superare ${intel.max}; evita micro-rilanci emotivi.`
    else if (verdict === 'LASCIA') nextMove = `Esci dall'asta: proteggi il budget del reparto. STOP ${intel.max}.`

    const reasons = [
      ...intel.reasons.slice(0, 2),
      forecast.strongest ? `rivale caldo: ${forecast.strongest.name}` : '',
      simulation.verdict !== 'SOSTENIBILE' ? simulation.verdict.toLowerCase() : '',
    ].filter(Boolean)

    return {
      verdict,
      confidence,
      nextMove,
      reasons,
      intel,
      forecast,
      plan,
      simulation,
    }
  }

  const warQuickTarget = predictiveBestCall?.player ?? opportunityCandidates[0]?.player ?? null
  const warQuickIntel = warQuickTarget ? buyNowIntelligence(warQuickTarget, getMarket(warQuickTarget)) : null

  function openWarTarget(player: Player) {
    changePlayer(player.name)
    setPrice(Math.max(1, getMarket(player)))
  }

  function registerPurchase() {
    if (!selectedPlayer) return
    if (roleCount(selectedPlayer.role) >= slotLimits[selectedPlayer.role]) {
      setMessage('Il reparto è già completo.')
      return
    }
    const bought = selectedPlayer
    setPurchases((current) => [...current, { player: bought, price }])
    setBudget((current) => current - price)
    setMessage(`✓ ${bought.name} acquistato a ${price}. Strategia ricalcolata.`)
    setSelectedName('')
    setPlayerSearch('')
  }
  function registerWarRivalPurchase() {
    if (!selectedPlayer) return
    const sold = selectedPlayer
    const paid = price
    setRivalSales((current) => [
      ...current,
      { player: sold, price: paid, rivalId: selectedRivalId },
    ])
    setMessage(`✕ ${sold.name} → ${rivalNames[selectedRivalId]} a ${paid}. Analisi rivali aggiornata.`)
    setSelectedName('')
    setPlayerSearch('')
    setPrice(1)
  }

  function goNextAuctionRole() {
    if (suggestionRole === 'ALL') return
    const currentIndex = roles.indexOf(suggestionRole)
    const nextOpen = roles
      .slice(currentIndex + 1)
      .concat(roles.slice(0, currentIndex))
      .find((role) => roleRemaining(role) > 0)

    if (!nextOpen) {
      setSuggestionRole('ALL')
      setWarRoleChosen(false)
      setMessage('✓ Rosa completa.')
      return
    }

    setSuggestionRole(nextOpen)
    setWarRoleChosen(true)
    setSelectedName('')
    setPlayerSearch('')
    setPrice(1)
    setMessage(`Reparto ${roleNames[nextOpen]} attivato.`)
  }

  function selectLivePlayer(player: Player) {
    setLiveSelectedName(player.name)
    setLiveSearch(player.name)
    setLivePrice(getMarket(player))
    setLiveMessage('')
  }

  function liveSoldToMe() {
    if (!livePlayer) return
    if (roleCount(livePlayer.role) >= slotLimits[livePlayer.role]) {
      setLiveMessage(`⚠ Reparto ${livePlayer.role} già completo.`)
      return
    }
    const bought = livePlayer
    const paid = livePrice
    setPurchases((current) => [...current, { player: bought, price: paid }])
    setBudget((current) => current - paid)
    setLiveSearch('')
    setLiveSelectedName('')
    setLivePrice(1)
    setLiveMessage(`✓ ${bought.name} acquistato da te a ${paid}.`)
  }

  function liveSoldToRival() {
    if (!livePlayer) return
    const sold = livePlayer
    const paid = livePrice
    setRivalSales((current) => [
      ...current,
      { player: sold, price: paid, rivalId: selectedRivalId },
    ])
    setLiveSearch('')
    setLiveSelectedName('')
    setLivePrice(1)
    setLiveMessage(`✕ ${sold.name} → ${rivalNames[selectedRivalId]} a ${paid}.`)
  }

  function undoLastRivalSale() {
    if (rivalSales.length === 0) return
    const last = rivalSales[rivalSales.length - 1]
    setRivalSales((current) => current.slice(0, -1))
    setLiveMessage(`${last.player.name} ripristinato tra i disponibili.`)
  }

  function renameRival(rivalId: number, name: string) {
    setRivalNames((current) =>
      current.map((currentName, index) =>
        index === rivalId ? name : currentName
      )
    )
  }

  function auctionIntegrity() {
    const issues: string[] = []

    if (budget < 0) issues.push('Budget residuo negativo')
    if (purchases.length > 25) issues.push('Più di 25 giocatori nella tua rosa')

    roles.forEach((currentRole) => {
      if (roleCount(currentRole) > slotLimits[currentRole]) {
        issues.push(`Troppi giocatori nel ruolo ${currentRole}`)
      }
    })

    const myKeys = purchases.map(
      (purchase) => `${purchase.player.name}|${purchase.player.team}`
    )
    const rivalKeys = rivalSales.map(
      (sale) => `${sale.player.name}|${sale.player.team}`
    )
    const allKeys = [...myKeys, ...rivalKeys]
    const duplicates = allKeys.filter(
      (key, index) => allKeys.indexOf(key) !== index
    )

    if (duplicates.length > 0) issues.push('Un giocatore risulta assegnato più volte')

    return issues
  }

  const integrityIssues = auctionIntegrity()
  const auctionSafe = integrityIssues.length === 0
  function resetAuction() {
    const confirmed = window.confirm(
      'Vuoi davvero iniziare una nuova asta? Rosa, rivali e prezzi verranno azzerati.'
    )
    if (!confirmed) return

    localStorage.removeItem(STORAGE_KEY)
    setSetupComplete(false)
    setBudget(startingBudget)
    setPurchases([])
    setRivalSales([])
    setWishlist([])
    setWishlistSearch('')
    setWishlistAddOpen(false)
    setRivalNames([
      'Rivale 1', 'Rivale 2', 'Rivale 3', 'Rivale 4', 'Rivale 5',
      'Rivale 6', 'Rivale 7', 'Rivale 8', 'Rivale 9',
    ])
    setSelectedName('')
    setPlayerSearch('')
    setLiveSearch('')
    setLiveSelectedName('')
    setPrice(1)
    setLivePrice(1)
    setMessage('Nuova asta pronta.')
    setLiveMessage('')
  }

  function exportBackup() {
    const state: SavedAuction = {
      setupComplete,
      leagueSize,
      startingBudget,
      budget,
      strategy,
      suggestionMode,
      purchases,
      rivalSales,
      rivalNames,
      wishlist,
    }

    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    link.download = `fantacalcio-asta-backup-${stamp}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  function importBackup() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return

      const reader = new FileReader()
      reader.onload = () => {
        try {
          const data = JSON.parse(String(reader.result)) as SavedAuction
          if (![8, 10].includes(data.leagueSize)) throw new Error('Formato lega non valido')
          if (![500, 750, 1000].includes(data.startingBudget)) throw new Error('Budget non valido')

          setSetupComplete(true)
          setLeagueSize(data.leagueSize)
          setStartingBudget(data.startingBudget)
          setBudget(data.budget)
          setStrategy(data.strategy)
          setSuggestionMode(data.suggestionMode ?? 'target')
          setPurchases(data.purchases ?? [])
          setRivalSales(data.rivalSales ?? [])
          setRivalNames(data.rivalNames ?? rivalNames)
          setWishlist(data.wishlist ?? [])
          setMessage('Backup importato correttamente.')
        } catch {
          window.alert('Questo file di backup non è valido.')
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }

  function squadRoleAnalysis(currentRole: Role) {
    const rolePurchases = purchases.filter(
      (purchase) => purchase.player.role === currentRole
    )
    const count = rolePurchases.length
    const required = slotLimits[currentRole]
    const roleSpentValue = rolePurchases.reduce(
      (total, purchase) => total + purchase.price,
      0
    )
    const planned = plannedRoleBudget(currentRole)

    if (count === 0) {
      return {
        role: currentRole,
        count,
        required,
        spent: 0,
        planned,
        quality: 0,
        strategyFit: 0,
        value: 0,
        completion: 0,
        score: 0,
      }
    }

    const quality =
      rolePurchases.reduce(
        (total, purchase) => total + tierScore(purchase.player),
        0
      ) / count

    const strategyFit =
      rolePurchases.reduce(
        (total, purchase) => total + calculateStrategyFit(purchase.player),
        0
      ) / count

    const value =
      rolePurchases.reduce((total, purchase) => {
        const market = Math.max(1, getMarket(purchase.player))
        const ratio = purchase.price / market
        const purchaseValue =
          ratio <= 0.75 ? 100 :
          ratio <= 0.9 ? 92 :
          ratio <= 1 ? 82 :
          ratio <= 1.15 ? 68 :
          ratio <= 1.35 ? 48 : 25
        return total + purchaseValue
      }, 0) / count

    const completion = Math.min(100, (count / required) * 100)

    const score =
      completion * 0.20 +
      quality * 0.29 +
      strategyFit * 0.31 +
      value * 0.20

    return {
      role: currentRole,
      count,
      required,
      spent: roleSpentValue,
      planned,
      quality,
      strategyFit,
      value,
      completion,
      score,
    }
  }

  const squadRoleAnalyses = roles.map((currentRole) =>
    squadRoleAnalysis(currentRole)
  )

  const squadCompletion = Math.min(100, (purchases.length / 25) * 100)

  const squadOverallScore =
    purchases.length > 0
      ? squadRoleAnalyses.reduce(
          (total, analysis) => total + analysis.score,
          0
        ) / roles.length
      : 0

  const squadStrategyFit =
    purchases.length > 0
      ? purchases.reduce(
          (total, purchase) =>
            total + calculateStrategyFit(purchase.player),
          0
        ) / purchases.length
      : 0

  const squadValueScore =
    purchases.length > 0
      ? purchases.reduce((total, purchase) => {
          const market = Math.max(1, getMarket(purchase.player))
          const ratio = purchase.price / market
          const value =
            ratio <= 0.75 ? 100 :
            ratio <= 0.9 ? 92 :
            ratio <= 1 ? 82 :
            ratio <= 1.15 ? 68 :
            ratio <= 1.35 ? 48 : 25
          return total + value
        }, 0) / purchases.length
      : 0

  const bestSquadRole = [...squadRoleAnalyses]
    .filter((analysis) => analysis.count > 0)
    .sort((a, b) => b.score - a.score)[0] ?? null

  const weakestSquadRole = [...squadRoleAnalyses]
    .filter((analysis) => analysis.count > 0)
    .sort((a, b) => a.score - b.score)[0] ?? null

  function squadVerdict() {
    if (purchases.length === 0)
      return 'Registra i primi acquisti per iniziare l’analisi della rosa.'

    if (purchases.length < 10)
      return 'Analisi preliminare: la rosa è ancora troppo incompleta per un giudizio definitivo.'

    if (squadOverallScore >= 85 && squadStrategyFit >= 82)
      return `Rosa di livello molto alto e fortemente coerente con ${currentStrategy.name}.`

    if (squadOverallScore >= 75)
      return `Costruzione solida. La rosa sta seguendo bene la strategia ${currentStrategy.name}.`

    if (squadStrategyFit < 65)
      return `La rosa si sta allontanando dalla strategia ${currentStrategy.name}: conviene correggere i prossimi acquisti.`

    if (squadValueScore < 60)
      return 'La qualità è presente, ma stai pagando diversi giocatori sopra il loro valore stimato.'

    return 'Rosa equilibrata, con alcuni reparti da rinforzare prima della chiusura dell’asta.'
  }

  const purchaseEvaluations = purchases.map((purchase) => {
    const market = Math.max(1, getMarket(purchase.player))
    const ratio = purchase.price / market
    const saving = market - purchase.price
    const targetScore = calculateTargetScore(purchase.player)
    const strategyFit = calculateStrategyFit(purchase.player)

    return {
      ...purchase,
      market,
      ratio,
      saving,
      targetScore,
      strategyFit,
    }
  })

  const bestDeals = [...purchaseEvaluations]
    .sort((a, b) => {
      if (b.saving !== a.saving) return b.saving - a.saving
      return b.targetScore - a.targetScore
    })
    .slice(0, 3)

  const biggestOverpays = [...purchaseEvaluations]
    .filter((item) => item.price > item.market)
    .sort((a, b) => (b.price - b.market) - (a.price - a.market))
    .slice(0, 3)

  const totalMarketValue = purchaseEvaluations.reduce(
    (total, item) => total + item.market,
    0
  )

  const totalPaid = startingBudget - budget
  const totalSaving = totalMarketValue - totalPaid

  const reportCompletionBonus =
    purchases.length >= 25 ? 100 : Math.min(100, (purchases.length / 25) * 100)

  const finalReportScore =
    purchases.length > 0
      ? squadOverallScore * 0.55 +
        squadStrategyFit * 0.20 +
        squadValueScore * 0.15 +
        reportCompletionBonus * 0.10
      : 0

  function finalReportVerdict() {
    if (purchases.length === 0)
      return 'Il report finale si attiverà con gli acquisti.'

    if (purchases.length < 25)
      return `Report provvisorio: mancano ${25 - purchases.length} slot per completare la rosa.`

    if (finalReportScore >= 88)
      return `Asta eccellente: rosa completa, forte e molto coerente con ${currentStrategy.name}.`

    if (finalReportScore >= 80)
      return `Asta molto buona: costruzione solida e strategia ${currentStrategy.name} rispettata.`

    if (finalReportScore >= 70)
      return 'Asta positiva: rosa competitiva, con qualche compromesso nella distribuzione dei crediti.'

    if (squadStrategyFit < 65)
      return `Rosa completa, ma poco coerente con la strategia ${currentStrategy.name}.`

    if (squadValueScore < 60)
      return 'Rosa completata, ma diversi acquisti sono stati pagati sopra il valore stimato.'

    return 'Asta sufficiente: la rosa è completa ma presenta margini di miglioramento.'
  }

  function rivalSquadScore(rivalId: number) {
    const sales = rivalPurchases(rivalId)
    const spentValue = rivalSpent(rivalId)
    const remainingValue = rivalBudget(rivalId)

    if (sales.length === 0) {
      return {
        score: 0,
        quality: 0,
        value: 0,
        completion: 0,
        balance: 0,
        count: 0,
        spent: 0,
        remaining: remainingValue,
      }
    }

    const quality =
      sales.reduce(
        (total, sale) => total + tierScore(sale.player),
        0
      ) / sales.length

    const value =
      sales.reduce((total, sale) => {
        const market = Math.max(1, getMarket(sale.player))
        const ratio = sale.price / market
        const purchaseValue =
          ratio <= 0.75 ? 100 :
          ratio <= 0.9 ? 92 :
          ratio <= 1 ? 82 :
          ratio <= 1.15 ? 68 :
          ratio <= 1.35 ? 48 : 25
        return total + purchaseValue
      }, 0) / sales.length

    const completion = Math.min(100, (sales.length / 25) * 100)

    const roleFill = roles.reduce((total, currentRole) => {
      const filled = Math.min(
        slotLimits[currentRole],
        rivalRoleCount(rivalId, currentRole)
      )
      return total + (filled / slotLimits[currentRole]) * 25
    }, 0)

    const budgetHealth =
      startingBudget > 0
        ? Math.max(0, Math.min(100, (remainingValue / startingBudget) * 180))
        : 0

    const balance = roleFill * 0.65 + budgetHealth * 0.35

    const score =
      quality * 0.34 +
      value * 0.24 +
      completion * 0.22 +
      balance * 0.20

    return {
      score,
      quality,
      value,
      completion,
      balance,
      count: sales.length,
      spent: spentValue,
      remaining: remainingValue,
    }
  }

  const myRankingEntry = {
    id: 'me',
    name: 'LA MIA ROSA',
    isMe: true,
    score: finalReportScore,
    quality: squadOverallScore,
    value: squadValueScore,
    completion: squadCompletion,
    balance: squadStrategyFit,
    count: purchases.length,
    spent: startingBudget - budget,
    remaining: budget,
  }

  const rivalRankingEntries = activeRivals.map((name, rivalId) => {
    const analysis = rivalSquadScore(rivalId)
    return {
      id: `rival-${rivalId}`,
      name,
      isMe: false,
      ...analysis,
    }
  })

  const leagueRanking = [myRankingEntry, ...rivalRankingEntries]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      if (b.quality !== a.quality) return b.quality - a.quality
      return b.remaining - a.remaining
    })

  const myLeaguePosition =
    leagueRanking.findIndex((entry) => entry.isMe) + 1

  const strongestRival = rivalRankingEntries
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.score - a.score)[0] ?? null

  function rankingVerdict() {
    if (purchases.length === 0 && rivalSales.length === 0)
      return 'La classifica si aggiornerà appena registri i primi acquisti.'

    if (myLeaguePosition === 1)
      return 'Al momento la tua costruzione è la migliore della lega secondo i dati registrati.'

    if (myLeaguePosition <= 3)
      return `Sei in zona alta: posizione stimata ${myLeaguePosition} su ${leagueSize}.`

    return `Posizione stimata ${myLeaguePosition} su ${leagueSize}: il Regista d’Asta può aiutarti a recuperare terreno.`
  }

  type SmartAlert = {
    id: string
    level: 'info' | 'warning' | 'danger' | 'opportunity'
    title: string
    text: string
    priority: number
  }

  function buildSmartAlerts(): SmartAlert[] {
    const alerts: SmartAlert[] = []
    const progress = purchases.length / 25
    const budgetShare = startingBudget > 0 ? budget / startingBudget : 0

    roles.forEach((currentRole) => {
      const count = roleCount(currentRole)
      const missing = Math.max(0, slotLimits[currentRole] - count)
      const spentValue = spentByRole(currentRole)
      const planned = plannedRoleBudget(currentRole)
      const adaptive = adaptiveRoleBudget(currentRole)

      if (missing <= 0) return

      if (spentValue > planned * 1.18) {
        alerts.push({
          id: `overspend-${currentRole}`,
          level: 'danger',
          title: `Spesa alta nel reparto ${currentRole}`,
          text: `Hai già speso ${spentValue} contro ${planned} pianificati. I prossimi ${missing} slot vanno gestiti con più disciplina.`,
          priority: 92,
        })
      }

      if (adaptive > planned * 1.18 && missing > 0) {
        alerts.push({
          id: `surplus-${currentRole}`,
          level: 'opportunity',
          title: `Hai margine da investire in ${currentRole}`,
          text: `Il budget adattivo del reparto è salito a ${Math.round(adaptive)} crediti. Puoi permetterti di attaccare un profilo più forte.`,
          priority: 76,
        })
      }

      if (progress >= 0.55 && count / slotLimits[currentRole] < 0.45) {
        alerts.push({
          id: `late-role-${currentRole}`,
          level: 'warning',
          title: `Reparto ${currentRole} in ritardo`,
          text: `Hai coperto solo ${count}/${slotLimits[currentRole]} slot mentre l’asta è già avanzata. Aumenta la priorità del reparto.`,
          priority: 84,
        })
      }
    })

    if (progress >= 0.45 && budgetShare >= 0.62) {
      alerts.push({
        id: 'budget-frozen',
        level: 'opportunity',
        title: 'Hai molto budget ancora fermo',
        text: `Hai ancora ${budget} crediti dopo ${purchases.length} acquisti. Puoi aumentare l’aggressività sui prossimi target di qualità.`,
        priority: 88,
      })
    }

    if (progress >= 0.55 && budgetShare <= 0.28 && purchases.length < 20) {
      alerts.push({
        id: 'budget-pressure',
        level: 'danger',
        title: 'Budget sotto pressione',
        text: `Ti restano ${budget} crediti con ${25 - purchases.length} slot ancora da coprire. Privilegia value e occasioni.`,
        priority: 95,
      })
    }

    if (nextAuctionMove && nextAuctionMove.urgency >= 8) {
      alerts.push({
        id: `next-move-${nextAuctionMove.role}`,
        level: 'opportunity',
        title: `È il momento di muoversi in ${nextAuctionMove.role}`,
        text: nextAuctionMove.bestPlayer
          ? `${nextAuctionMove.bestPlayer.name} è il target suggerito dal Regista d’Asta con priorità ${nextAuctionMove.urgency.toFixed(1)}/10.`
          : `Il reparto ${nextAuctionMove.role} ha priorità ${nextAuctionMove.urgency.toFixed(1)}/10.`,
        priority: 90,
      })
    }

    if (
      strongestRival &&
      strongestRival.score > finalReportScore + 8 &&
      strongestRival.count >= 5
    ) {
      alerts.push({
        id: `rival-${strongestRival.id}`,
        level: 'warning',
        title: `${strongestRival.name} sta costruendo bene`,
        text: `È il rivale più forte registrato: voto stimato ${scoreOutOf10(strongestRival.score)}/10 e budget residuo ${strongestRival.remaining}.`,
        priority: 82,
      })
    }

    activeRivals.forEach((name, rivalId) => {
      const intel = rivalIntelligence(rivalId)
      if (intel.sample >= 3 && intel.threatScore >= 8) {
        alerts.push({
          id: `danger-rival-${rivalId}`,
          level: 'danger',
          title: `${name} è molto pericoloso in asta`,
          text: `Pericolosità ${intel.threatScore.toFixed(1)}/10, profilo ${intel.profile}. Evita rilanci emotivi contro questo rivale.`,
          priority: 86,
        })
      }
    })

    if (purchases.length > 0 && squadStrategyFit < 62) {
      alerts.push({
        id: 'strategy-drift',
        level: 'warning',
        title: `Ti stai allontanando da ${currentStrategy.name}`,
        text: `Il fit medio della rosa con la strategia è ${scoreOutOf10(squadStrategyFit)}/10. I prossimi acquisti dovrebbero correggere la direzione.`,
        priority: 89,
      })
    }

    if (purchases.length >= 8 && squadValueScore >= 82) {
      alerts.push({
        id: 'value-good',
        level: 'info',
        title: 'Stai comprando bene',
        text: `Il Value medio degli acquisti è ${scoreOutOf10(squadValueScore)}/10. Non serve forzare: mantieni la disciplina.`,
        priority: 58,
      })
    }

    return alerts
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 6)
  }

  const smartAlerts = buildSmartAlerts()

  function alertAppearance(level: SmartAlert['level']) {
    if (level === 'danger') {
      return {
        icon: '🚨',
        color: '#ff8b8b',
        border: '#753f48',
        background: '#2b171c',
      }
    }

    if (level === 'warning') {
      return {
        icon: '⚠️',
        color: '#f2c66d',
        border: '#6b5830',
        background: '#282315',
      }
    }

    if (level === 'opportunity') {
      return {
        icon: '🎯',
        color: '#70d6a1',
        border: '#315a49',
        background: '#10251d',
      }
    }

    return {
      icon: '💡',
      color: '#79b8ff',
      border: '#334f72',
      background: '#111f31',
    }
  }

  function bidThresholds(player: Player) {
    const market = getMarket(player)
    const max = calculateDynamicMax(player)
    const strategyFit = calculateStrategyFit(player)
    const targetScore = calculateTargetScore(player)

    let attackFactor = 0.82
    let disciplineFactor = 0.95

    if (strategy === 'aggressive') {
      attackFactor = player.role === 'A' || player.role === 'C' ? 0.90 : 0.84
      disciplineFactor = player.role === 'A' || player.role === 'C' ? 0.98 : 0.94
    }

    if (strategy === 'value') {
      attackFactor = 0.76
      disciplineFactor = 0.90
    }

    if (strategy === 'patient') {
      const progress = purchases.length / 25
      attackFactor = progress < 0.45 ? 0.72 : 0.84
      disciplineFactor = progress < 0.45 ? 0.88 : 0.95
    }

    if (strategy === 'stars') {
      const premium = tierScore(player) >= 82
      attackFactor = premium ? 0.92 : 0.72
      disciplineFactor = premium ? 0.99 : 0.88
    }

    if (strategyFit >= 85 || targetScore >= 85) {
      attackFactor = Math.min(0.95, attackFactor + 0.04)
      disciplineFactor = Math.min(0.99, disciplineFactor + 0.02)
    }

    const attack = Math.max(1, Math.min(max, Math.round(max * attackFactor)))
    const discipline = Math.max(attack, Math.min(max, Math.round(max * disciplineFactor)))
    const stop = Math.max(discipline, max)

    const marketReference =
      market <= attack
        ? 'sotto la soglia di attacco'
        : market <= discipline
        ? 'in zona disciplina'
        : market <= stop
        ? 'vicino al limite'
        : 'oltre il limite strategico'

    return {
      attack,
      discipline,
      stop,
      marketReference,
    }
  }

  const auctionHistory = [
    ...purchases.map((purchase, index) => ({
      kind: 'mine' as const,
      player: purchase.player,
      price: purchase.price,
      originalIndex: index,
      rivalId: null as number | null,
    })),
    ...rivalSales.map((sale, index) => ({
      kind: 'rival' as const,
      player: sale.player,
      price: sale.price,
      originalIndex: index,
      rivalId: sale.rivalId,
    })),
  ]

  function undoMyPurchase(index: number) {
    const purchase = purchases[index]
    if (!purchase) return

    setPurchases((current) =>
      current.filter((_, purchaseIndex) => purchaseIndex !== index)
    )
    setBudget((current) => current + purchase.price)
    setMessage(`Annullato acquisto: ${purchase.player.name}`)
  }

  function undoRivalPurchase(index: number) {
    const sale = rivalSales[index]
    if (!sale) return

    setRivalSales((current) =>
      current.filter((_, saleIndex) => saleIndex !== index)
    )
    setMessage(`Annullata assegnazione: ${sale.player.name}`)
  }


  function pressureColor(level: 'BASSA' | 'MEDIA' | 'ALTA') {
    if (level === 'ALTA') return '#ff8b8b'
    if (level === 'MEDIA') return '#f2c66d'
    return '#70d6a1'
  }

  const navStyle = (active: boolean) => ({
    minHeight: '48px',
    padding: '7px 4px',
    borderRadius: '14px',
    border: active ? '1px solid rgba(124,156,255,.30)' : '1px solid transparent',
    background: active
      ? 'linear-gradient(180deg,rgba(124,156,255,.16),rgba(124,156,255,.07))'
      : 'transparent',
    color: active ? '#f5f8ff' : '#7f8998',
    fontWeight: 900,
    fontSize: '8px',
    cursor: 'pointer',
    boxShadow: active ? '0 8px 22px rgba(42,66,140,.18), inset 0 1px 0 rgba(255,255,255,.04)' : 'none',
  })

  const smallChoiceStyle = (active: boolean) => ({
    minHeight: '41px',
    padding: '8px 11px',
    borderRadius: '12px',
    border: active
      ? '1px solid rgba(124,156,255,.36)'
      : '1px solid rgba(255,255,255,.08)',
    background: active
      ? 'rgba(124,156,255,.13)'
      : 'rgba(255,255,255,.035)',
    color: active ? '#eef2ff' : '#a5afbd',
    fontWeight: 900,
    fontSize: '9px',
    cursor: 'pointer',
    boxShadow: active ? '0 7px 20px rgba(42,66,140,.14)' : 'none',
  })

  if (!setupComplete) {
    return (
      <div className="app setup-shell">
        <style>{APP_THEME_CSS}</style>

        <div className="setup-hero">
          <span className="setup-badge">● AUCTION CONTROL</span>
          <h1>Prepara la tua asta.</h1>
          <p>
            Imposta partecipanti e crediti. La strategia si gestisce direttamente
            dalla WAR ROOM e può essere cambiata anche durante l’asta.
          </p>
        </div>

        <header className="topbar">
          <div>
            <p className="eyebrow">CONFIGURAZIONE</p>
            <h1>ASTA 2026/27</h1>
          </div>
          <div className="budget-box">
            <span>CREDITI</span>
            <strong>{startingBudget}</strong>
          </div>
        </header>

        <section className="section">
          <div className="section-title">PARTECIPANTI</div>
          <div className="main-card">
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2,1fr)',
              gap: '8px',
            }}>
              <button
                type="button"
                style={smallChoiceStyle(leagueSize === 8)}
                onClick={() => changeLeagueSize(8)}
              >
                LEGA 8
              </button>
              <button
                type="button"
                style={smallChoiceStyle(leagueSize === 10)}
                onClick={() => changeLeagueSize(10)}
              >
                LEGA 10
              </button>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="section-title">CREDITI INIZIALI</div>
          <div className="main-card">
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3,1fr)',
              gap: '8px',
            }}>
              {([500, 750, 1000] as StartingBudget[]).map((value) => (
                <button
                  key={`setup-budget-${value}`}
                  type="button"
                  style={smallChoiceStyle(startingBudget === value)}
                  onClick={() => changeStartingBudget(value)}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        </section>

        <button
          type="button"
          className="primary-button"
          style={{ width: '100%', minHeight: '52px', marginTop: '4px' }}
          onClick={() => {
            setSetupComplete(true)
            setView('war')
          }}
        >
          INIZIA ASTA →
        </button>

        <p className="tip" style={{ textAlign: 'center', marginTop: '10px' }}>
          Strategia, suggerimenti e valutazioni si gestiscono dalla WAR ROOM.
        </p>
      </div>
    )
  }

  void [refreshApplicationVersion, alertsOpen, setAlertsOpen, setCommandCallRole, setCommandDecoyRole, message, bluffWindow, simulatePurchaseImpact, nextCallCandidate, bestDecoyCandidate, commandCallWhy, commandDecoyWhy, formatLiveStat, evaluationComment, specificSuggestionExplanation, suggestionCandidates, averageRivalMaxOffer, auctionProgressPct, predictiveCallAction, closingHealth, unusedCreditRisk, dynamicMaxBid, decision, resetWarChoiceFlow, resetDecisionDesk, warQuickIntel, registerPurchase, smartAlerts, alertAppearance]

  return (
    <div className="app">
      <style>{APP_THEME_CSS}</style>

      <div className="back-row">
        <button
          type="button"
          className="back-button"
          onClick={() => {
            if (view === 'war') {
              setSetupComplete(false)
            } else {
              setView('war')
            }
          }}
        >
          ← INDIETRO
        </button>
      </div>

      <div className="app-nav" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <button type="button" style={navStyle(view === 'war')} onClick={() => setView('war')}>
          <span>⌂</span><span className="nav-caption">WAR</span>
        </button>
        <button type="button" style={navStyle(view === 'live')} onClick={() => setView('live')}>
          <span>●</span><span className="nav-caption">ASTA</span>
        </button>
        <button type="button" style={navStyle(view === 'myteam')} onClick={() => setView('myteam')}>
          <span>★</span><span className="nav-caption">MY TEAM</span>
        </button>
        <button
          type="button"
          style={navStyle(view === 'more' || view === 'analysis' || view === 'compare' || view === 'pairings' || view === 'history' || view === 'settings' || view === 'rivals' || view === 'squad')}
          onClick={() => setView('more')}
        >
          <span>•••</span><span className="nav-caption">ALTRO</span>
        </button>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          margin: '-5px 2px 8px',
        }}
      >
        <span
          className="setup-badge"
          style={{
            borderColor: isOnline ? 'rgba(71,214,157,.22)' : 'rgba(242,189,92,.22)',
            background: isOnline ? 'rgba(71,214,157,.08)' : 'rgba(242,189,92,.08)',
            color: isOnline ? '#6ce6b3' : '#f5ca78',
          }}
        >
          {isOnline ? '● ONLINE' : '● OFFLINE · DATI LOCALI'}
        </span>
      </div>

      {view === 'war' && (
        <>
          {!warRoleChosen || suggestionRole === 'ALL' ? (
            <section className="section" style={{ padding: '14px 12px' }}>
              <div className="section-title">⚔️ WAR ROOM</div>
              <p className="tip" style={{ margin: '0 0 10px', lineHeight: 1.6 }}>
                Seleziona il reparto in asta. Da qui in poi vedrai solo giocatori, suggerimenti e decisioni relativi a quel reparto.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '8px' }}>
                {roles.map((role) => (
                  <button
                    type="button"
                    key={`war-focus-${role}`}
                    className="role-button"
                    onClick={() => {
                      setSuggestionRole(role)
                      setWarRoleChosen(true)
                      setSelectedName('')
                      setPlayerSearch('')
                      setPrice(1)
                    }}
                    style={{ minHeight: '76px' }}
                  >
                    <strong style={{ display: 'block', fontSize: '22px' }}>{role}</strong>
                    <span style={{ display: 'block', marginTop: '3px' }}>{roleNames[role]}</span>
                    <small style={{ display: 'block', marginTop: '4px' }}>
                      {roleRemaining(role)} slot · budget {Math.max(0, adaptiveRoleBudget(role) - spentByRole(role))}
                    </small>
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <>
              <section className="section" style={{ padding: '10px 12px', position: 'sticky', top: '64px', zIndex: 45 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'center' }}>
                  <div>
                    <small className="small-label">REPARTO IN ASTA</small>
                    <strong style={{ display: 'block', fontSize: '18px', marginTop: '2px' }}>
                      {suggestionRole} · {roleNames[suggestionRole]}
                    </strong>
                  </div>
                  <button
                    type="button"
                    className="back-button"
                    onClick={() => {
                      setSuggestionRole('ALL')
                      setWarRoleChosen(false)
                      setSelectedName('')
                      setPlayerSearch('')
                      setPrice(1)
                    }}
                  >
                    CAMBIA
                  </button>
                </div>

                {(() => {
                  const plan = roleFocusPlan(suggestionRole)
                  return (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '5px', marginTop: '8px' }}>
                        <div className="stat highlight-stat"><span>BUDGET</span><strong>{budget}</strong></div>
                        <div className="stat"><span>SLOT {suggestionRole}</span><strong>{plan.missing}</strong></div>
                        <div className="stat"><span>BUDGET REP.</span><strong>{plan.room}</strong></div>
                        <div className="stat"><span>STATO</span><strong style={{ fontSize: '9px' }}>{plan.status}</strong></div>
                      </div>
                      <p className="tip" style={{ margin: '7px 0 0', lineHeight: 1.5 }}>
                        {plan.instruction}
                      </p>
                      {plan.missing <= 0 && (
                        <button
                          type="button"
                          className="primary-button"
                          style={{ width: '100%', marginTop: '7px' }}
                          onClick={goNextAuctionRole}
                        >
                          REPARTO COMPLETO · VAI AL SUCCESSIVO
                        </button>
                      )}
                    </>
                  )
                })()}
              </section>

              {(() => {
                const roleCalls = predictiveCallCandidates.filter((item) => item.player.role === suggestionRole)
                const roleOpportunities = opportunityCandidates.filter((item) => item.player.role === suggestionRole)
                const best = roleCalls[0] ?? roleOpportunities[0] ?? null
                if (!best) return null

                const player = best.player
                const intel = buyNowIntelligence(player, getMarket(player))
                const forecast = finalPriceForecast(player, getMarket(player))

                return (
                  <section className="section" style={{ padding: '11px 12px' }}>
                    <div className="section-title">🎙️ TARGET N.1 · {suggestionRole}</div>
                    <div className="main-card" style={{ border: '1px solid rgba(66,214,164,.28)' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '9px', alignItems: 'center' }}>
                        <PlayerPhoto player={player} size={48} />
                        <div style={{ minWidth: 0 }}>
                          <strong style={{ display: 'block', fontSize: '15px' }}>{isStarred(player) ? '★ ' : ''}{player.name}</strong>
                          <small>{player.team} · mercato {getMarket(player)}</small>
                          <small style={{ display: 'block', marginTop: '3px' }}>{intel.action} · priorità {intel.priority.toLowerCase()}</small>
                        </div>
                        <div className="recommendation-score"><span>STOP</span><strong>{intel.max}</strong></div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '5px', marginTop: '7px' }}>
                        <div className="stat"><span>PREZZO OK</span><strong>{intel.fairPrice}</strong></div>
                        <div className="stat"><span>ATTACCO</span><strong>{intel.attackPrice}</strong></div>
                        <div className="stat"><span>STIMA</span><strong>{forecast.predictedFinal}</strong></div>
                        <div className="stat"><span>ENTRA</span><strong>{forecast.entryThreshold}</strong></div>
                      </div>

                      <button type="button" className="primary-button" style={{ width: '100%', marginTop: '8px' }} onClick={() => openWarTarget(player)}>
                        APRI TARGET
                      </button>
                    </div>

                    {(roleCalls.length > 1 || roleOpportunities.length > 1) && (
                      <div style={{ display: 'grid', gap: '5px', marginTop: '7px' }}>
                        {(roleCalls.length > 1 ? roleCalls.slice(1, 4) : roleOpportunities.slice(1, 4)).map((item, index) => (
                          <button
                            type="button"
                            key={`role-alt-${playerKey(item.player)}`}
                            className="back-button"
                            style={{ width: '100%', display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}
                            onClick={() => openWarTarget(item.player)}
                          >
                            <span>{index + 2}ª scelta · {item.player.name}</span>
                            <span>MAX {buyNowIntelligence(item.player, getMarket(item.player)).max}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </section>
                )
              })()}

              <section className="section" style={{ padding: '11px 12px' }}>
                <div className="section-title">🔎 CERCA {suggestionRole}</div>
                <input
                  type="text"
                  placeholder={`Cerca ${roleNames[suggestionRole].toLowerCase()}...`}
                  value={playerSearch}
                  onChange={(event) => handlePlayerSearch(event.target.value)}
                />

                {playerSearch && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '5px' }}>
                    <button type="button" className="back-button" onClick={() => { setPlayerSearch(''); setDebouncedPlayerSearch(''); setSelectedName('') }}>× PULISCI</button>
                  </div>
                )}

                {playerSearch && !selectedPlayer && (
                  <div style={{ display: 'grid', gap: '5px', marginTop: '7px' }}>
                    {searchedPlayers
                      .filter((player) => player.role === suggestionRole)
                      .slice(0, 6)
                      .map((player) => (
                        <button
                          type="button"
                          key={`war-role-search-${playerKey(player)}`}
                          onClick={() => openWarTarget(player)}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr auto',
                            gap: '8px',
                            padding: '9px',
                            borderRadius: '11px',
                            border: '1px solid rgba(64,92,160,.15)',
                            background: 'rgba(255,255,255,.035)',
                            color: '#f4f7fb',
                            textAlign: 'left',
                          }}
                        >
                          <span>
                            <strong>{isStarred(player) ? '★ ' : ''}{player.name}</strong>
                            <small style={{ display: 'block' }}>{player.team}</small>
                          </span>
                          <strong>{getMarket(player)}</strong>
                        </button>
                      ))}
                  </div>
                )}

                {selectedPlayer && selectedPlayer.role === suggestionRole && (() => {
                  const update = dataUpdateFor(selectedPlayer)
                  const score = chirurgoScore(selectedPlayer)
                  const rank = sameRoleRank(selectedPlayer)
                  const decision = unifiedAuctionDecision(selectedPlayer, price)
                  const analysis = conciseProsCons(selectedPlayer)
                  return (
                    <div className="main-card" style={{ marginTop: '8px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '10px', alignItems: 'center' }}>
                        <PlayerPhoto player={selectedPlayer} size={58} />
                        <div>
                          <strong style={{ display: 'block', fontSize: '17px' }}>{selectedPlayer.name}</strong>
                          <small>{selectedPlayer.team} · {selectedPlayer.role}</small>
                        </div>
                        <div className="recommendation-score"><span>RATING</span><strong>{score.total}</strong></div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '6px', marginTop: '9px' }}>
                        <div className="stat highlight-stat"><span>TITOLARITÀ ST.</span><strong>{score.starter}%</strong></div>
                        <div className="stat"><span>RANK RUOLO</span><strong>{rank.position}° / {rank.total}</strong></div>
                      </div>

                      <div className="main-card" style={{ marginTop: '7px' }}>
                        <small className="small-label">ALTERNATIVA / CONCORRENZA</small>
                        <strong style={{ display: 'block', marginTop: '4px' }}>{directAlternative(selectedPlayer)}</strong>
                      </div>

                      <div className="main-card" style={{ marginTop: '7px', borderColor: update?.injuryStatus === 'injured' ? 'rgba(255,115,135,.38)' : 'rgba(71,214,157,.20)' }}>
                        <small className="small-label">INFORTUNI / DISPONIBILITÀ</small>
                        <strong style={{ display: 'block', marginTop: '4px' }}>{injuryLine(selectedPlayer)}</strong>
                      </div>

                      <div className="main-card" style={{ marginTop: '7px' }}>
                        <small className="small-label">RIGORI E PIAZZATI</small>
                        <strong style={{ display: 'block', marginTop: '4px' }}>{setPieceLine(selectedPlayer)}</strong>
                      </div>

                      <label>PREZZO ATTUALE ASTA</label>
                      <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 44px', gap: '6px' }}>
                        <button type="button" className="back-button" onClick={() => setPrice((value) => Math.max(1, value - 1))}>−</button>
                        <input type="number" min="1" value={price} onChange={(event) => setPrice(Math.max(1, Number(event.target.value) || 1))} />
                        <button type="button" className="back-button" onClick={() => setPrice((value) => value + 1)}>+</button>
                      </div>

                      {(() => {
                        const zone = livePriceZone(selectedPlayer, price)
                        return (
                          <div className="main-card" style={{ marginTop: '8px', borderColor: zone.label.startsWith('ROSSO') ? 'rgba(255,115,135,.38)' : zone.label.startsWith('VERDE') ? 'rgba(71,214,157,.30)' : 'rgba(242,189,92,.30)' }}>
                            <small className="small-label">SEMAFORO PREZZO LIVE</small>
                            <strong style={{ display: 'block', marginTop: '4px' }}>{zone.label}</strong>
                            <p className="tip" style={{ margin: '5px 0 0' }}>{zone.detail}</p>
                          </div>
                        )
                      })()}

                      <div className="main-card" style={{ marginTop: '8px' }}>
                        <small className="small-label">🩺 DECISIONE ASTA</small>
                        <strong style={{ display: 'block', fontSize: '22px', marginTop: '4px' }}>{decision.verdict}</strong>
                        <p className="tip" style={{ margin: '6px 0 0', lineHeight: 1.5 }}>{decision.nextMove}</p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '5px', marginTop: '7px' }}>
                          <div className="stat"><span>PREZZO OK</span><strong>{decision.intel.fairPrice}</strong></div>
                          <div className="stat"><span>ENTRA</span><strong>{decision.forecast.entryThreshold}</strong></div>
                          <div className="stat"><span>RILANCIA</span><strong>{decision.intel.attackPrice}</strong></div>
                          <div className="stat highlight-stat"><span>STOP</span><strong>{decision.intel.max}</strong></div>
                        </div>
                      </div>

                      <div className="main-card" style={{ marginTop: '7px' }}>
                        <small className="small-label">ANALISI PRO / CONTRO</small>
                        <p className="tip" style={{ margin: '6px 0 0', lineHeight: 1.55 }}><strong>PRO:</strong> {analysis.pros}</p>
                        <p className="tip" style={{ margin: '6px 0 0', lineHeight: 1.55 }}><strong>CONTRO:</strong> {analysis.cons}</p>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '8px' }}>
                        <button type="button" className="primary-button" onClick={registerPurchase}>✓ MIO A {price}</button>
                        <select value={selectedRivalId} onChange={(event) => setSelectedRivalId(Number(event.target.value))}>
                          {rivalNames.slice(0, leagueSize - 1).map((name, index) => <option key={`war-rival-${index}`} value={index}>{name}</option>)}
                        </select>
                      </div>
                      <button type="button" className="back-button" style={{ width: '100%', marginTop: '6px' }} onClick={registerWarRivalPurchase}>
                        ✕ AGGIUDICATO A
 {rivalNames[selectedRivalId]} · {price}
                      </button>
                      {message && <div className="message">{message}</div>}
                    </div>
                  )
                })()}
              </section>

              <section className="section" style={{ padding: '11px 12px' }}>
                <div className="section-title">🚨 ALERT {suggestionRole}</div>
                <p className="tip" style={{ margin: 0, lineHeight: 1.6 }}>
                  {auctionMoves.find((move) => move.role === suggestionRole)?.reason ?? endgameInstruction}
                </p>
                {dominantRival?.primary?.role === suggestionRole && (
                  <p className="tip" style={{ margin: '5px 0 0', lineHeight: 1.6 }}>
                    Attenzione a <strong>{dominantRival.name}</strong>: ha bisogno proprio di {suggestionRole} e può alzare i prezzi.
                  </p>
                )}
                {(purchases.length > 0 || rivalSales.length > 0) && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '8px' }}>
                    {purchases.length > 0 && <button type="button" className="back-button" onClick={() => undoMyPurchase(purchases.length - 1)}>↶ ANNULLA MIO</button>}
                    {rivalSales.length > 0 && <button type="button" className="back-button" onClick={undoLastRivalSale}>↶ ANNULLA RIVALE</button>}
                  </div>
                )}
              </section>
            </>
          )}
        </>
      )}

      {view === 'pairings' && (
        <>
          <header className="topbar">
            <div>
              <p className="eyebrow">CALENDARIO SERIE A 2026/27 · 38 GIORNATE</p>
              <h1>⚽ ABBINAMENTI</h1>
            </div>
          </header>

          <section className="section">
            <div className="main-card" style={{ padding: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button type="button" style={smallChoiceStyle(pairingMode === 'goalkeepers')} onClick={() => setPairingMode('goalkeepers')}>🧤 PORTIERI</button>
                <button type="button" style={smallChoiceStyle(pairingMode === 'attackers')} onClick={() => setPairingMode('attackers')}>⚽ ATTACCANTI</button>
              </div>
              <p className="tip" style={{ marginBottom: 0 }}>
                {pairingMode === 'goalkeepers'
                  ? 'Scegli 2 o 3 squadre: per ogni giornata il motore seleziona il portiere con il calendario più favorevole.'
                  : 'Scegli 2 o 3 squadre: per ogni giornata il motore seleziona l’attacco con il matchup più favorevole.'}
              </p>
            </div>

            <div className="main-card">
              <div className="section-title">LE TUE SQUADRE</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '7px' }}>
                {[0, 1, 2].map((index) => (
                  <select
                    key={`pairing-select-${index}`}
                    value={pairingTeams[index] ?? ''}
                    onChange={(event) => updatePairingTeam(index, event.target.value)}
                    style={{ width: '100%', minWidth: 0, fontWeight: 900 }}
                  >
                    {index === 2 && <option value="">— 2 SQUADRE —</option>}
                    {SERIE_A_TEAMS_2026_27.map((team) => <option key={`${index}-${team}`} value={team}>{team}</option>)}
                  </select>
                ))}
              </div>
            </div>

            <div className="main-card" style={{ borderColor: activePairing.index >= 70 ? 'rgba(71,214,157,.45)' : activePairing.index >= 55 ? 'rgba(242,189,92,.4)' : 'rgba(255,107,107,.4)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '14px', alignItems: 'center' }}>
                <div style={{ width: '92px', height: '92px', borderRadius: '50%', display: 'grid', placeItems: 'center', border: '8px solid #66e6a9', background: '#0b1728' }}>
                  <strong style={{ fontSize: '25px' }}>{activePairing.index}%</strong>
                </div>
                <div>
                  <span className="eyebrow">INDICE ABBINAMENTO</span>
                  <strong style={{ display: 'block', marginTop: '4px', fontSize: '18px' }}>{activePairing.teams.join(' + ') || 'Scegli le squadre'}</strong>
                  <small style={{ color: 'var(--muted)' }}>Motore proprietario · forza squadre aggiornata dai dati disponibili</small>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '6px', marginTop: '12px' }}>
                <div className="stat"><span>FACILI</span><strong>{activePairing.easy}</strong></div>
                <div className="stat"><span>MEDIE</span><strong>{activePairing.medium}</strong></div>
                <div className="stat"><span>DIFFICILI</span><strong>{activePairing.hard}</strong></div>
                <div className="stat"><span>CASA</span><strong>{activePairing.home}</strong></div>
                <div className="stat"><span>TRASF.</span><strong>{activePairing.away}</strong></div>
              </div>
            </div>

            <div className="main-card">
              <div className="section-title">GIORNATE 1–38</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(92px,1fr))', gap: '6px' }}>
                {activePairing.rounds.map((item) => (
                  <div key={`pairing-round-${item.round}`} style={{ border: '1px solid #304863', borderRadius: '10px', padding: '8px', background: item.level === 'FACILE' ? 'rgba(71,214,157,.08)' : item.level === 'MEDIA' ? 'rgba(242,189,92,.07)' : 'rgba(255,107,107,.07)' }}>
                    <small style={{ color: 'var(--muted)', fontWeight: 900 }}>G{item.round}</small>
                    <strong style={{ display: 'block', marginTop: '3px', fontSize: '11px' }}>{item.team}</strong>
                    <small style={{ display: 'block', marginTop: '2px' }}>{item.home ? 'vs' : '@'} {item.opponent}</small>
                    <small style={{ display: 'block', marginTop: '5px', fontWeight: 900, color: item.level === 'FACILE' ? '#6ce6b3' : item.level === 'MEDIA' ? '#f5ca78' : '#ff958d' }}>{item.level}</small>
                  </div>
                ))}
              </div>
            </div>

            <div className="main-card">
              <div className="section-title">🏆 TOP 8 TRIS AUTOMATICI</div>
              <p className="tip">Calcolati su tutte le combinazioni delle 20 squadre. Non sono copiati da altri servizi.</p>
              <div style={{ display: 'grid', gap: '7px' }}>
                {topPairings.map((item, index) => (
                  <button
                    type="button"
                    className="back-button"
                    key={`top-pairing-${item.teams.join('-')}`}
                    onClick={() => setPairingTeams(item.teams)}
                    style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '8px', alignItems: 'center', textAlign: 'left' }}
                  >
                    <strong>#{index + 1}</strong>
                    <span>{item.teams.join(' · ')}</span>
                    <strong>{item.index}%</strong>
                  </button>
                ))}
              </div>
            </div>

            <div className="main-card">
              <small style={{ color: 'var(--muted)' }}>
                Metodo: calendario ufficiale Serie A 2026/27 + forza relativa delle squadre ricavata dai giocatori e dai dati live disponibili nell’app. Se un dato manca, il motore usa solo i dati presenti e non inventa statistiche individuali.
              </small>
            </div>
          </section>
        </>
      )}

      {view === 'analysis' && (
        <>
          <section className="section">
            <div className="section-title">🧠 ANALISI AVVERSARI</div>
            {suggestionRole !== 'ALL' && (
              <div className="main-card" style={{ marginBottom: '8px' }}>
                <small className="small-label">FOCUS ASTA ATTUALE</small>
                <strong style={{ display: 'block', marginTop: '4px' }}>{suggestionRole} · {roleNames[suggestionRole]}</strong>
                <small style={{ display: 'block', marginTop: '4px' }}>
                  Rivali con bisogno nel reparto: {rivalPredictions.filter((rival) => rival.primary?.role === suggestionRole || rival.secondary?.role === suggestionRole).length}
                </small>
              </div>
            )}
            {rivalPredictions.length === 0 ? (
              <p className="tip">Registra gli acquisti dei rivali per attivare l'analisi.</p>
            ) : (
              <div style={{ display: 'grid', gap: '7px' }}>
                {rivalPredictions.map((rival) => (
                  <div className="main-card" key={`analysis-rival-${rival.rivalId}`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                      <div>
                        <strong style={{ display: 'block' }}>{rival.name}</strong>
                        <small>{rival.profile} · {rival.behavior}</small>
                      </div>
                      <div className="recommendation-score"><span>MINACCIA</span><strong>{scoreOutOf10(rival.threat)}</strong></div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '5px', marginTop: '7px' }}>
                      <div className="stat"><span>BUDGET</span><strong>{rival.remaining}</strong></div>
                      <div className="stat"><span>MAX</span><strong>{rival.maxOffer}</strong></div>
                      <div className="stat"><span>RUOLO</span><strong>{rival.primary?.role ?? '—'}</strong></div>
                      <div className="stat"><span>AGGR.</span><strong>{scoreOutOf10(rival.aggression * 10)}</strong></div>
                    </div>
                    <p className="tip" style={{ margin: '7px 0 0', lineHeight: 1.6 }}>
                      Memoria: {rivalMemory(rival.rivalId).tendency} · scostamento mercato {rivalMemory(rival.rivalId).avgOverMarket >= 0 ? '+' : ''}{rivalMemory(rival.rivalId).avgOverMarket.toFixed(0)}%.
                    </p>
                    <p className="tip" style={{ margin: '5px 0 0', lineHeight: 1.6 }}><strong>Contromossa:</strong> {rival.counter}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="section">
            <div className="section-title">📊 STRATEGIA & CHIUSURA</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '5px' }}>
              <div className="stat"><span>MODALITÀ</span><strong style={{ fontSize: '9px' }}>{predictiveMode}</strong></div>
              <div className="stat"><span>ENDGAME</span><strong style={{ fontSize: '9px' }}>{endgameMode}</strong></div>
              <div className="stat"><span>CREDITI RISCHIO</span><strong>{projectedUnusedCredits}</strong></div>
              <div className="stat"><span>ATTACCO/SLOT</span><strong>{endgameAttackPerOpenSlot}</strong></div>
            </div>
            <p className="tip" style={{ lineHeight: 1.6 }}>{predictiveModeText}</p>
            <p className="tip" style={{ lineHeight: 1.6 }}>{endgameInstruction}</p>

            <div style={{ display: 'grid', gap: '6px' }}>
              {closingPlan.map((item) => (
                <div className="main-card" key={`analysis-closing-${item.role}`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                    <strong>{item.role}</strong><strong>{item.missing} slot</strong>
                  </div>
                  <small>Budget residuo {item.budgetRoom} · attacco {item.attackRoom}</small>
                  {item.topAffordable && item.missing > 0 && (
                    <small style={{ display: 'block', marginTop: '3px' }}>
                      Miglior profilo sostenibile: {item.topAffordable.player.name} · MAX {item.topAffordable.max}
                    </small>
                  )}
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {view === 'compare' && (
        <section className="section">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
            <div className="section-title" style={{ marginBottom: 0 }}>⚖️ CONFRONTO GIOCATORI</div>
            {comparisonNames.length > 0 && <button type="button" className="back-button" onClick={resetComparison}>↺ RESET</button>}
          </div>
          <p className="tip">Confronta fino a 3 giocatori. Puoi aggiungerli direttamente da qui.</p>

          <input
            type="text"
            placeholder={suggestionRole === 'ALL' ? 'Cerca giocatore da confrontare...' : `Cerca ${roleNames[suggestionRole].toLowerCase()} da confrontare...`}
            value={playerSearch}
            onChange={(event) => handlePlayerSearch(event.target.value)}
          />

          {playerSearch && (
            <div style={{ display: 'grid', gap: '5px', marginTop: '7px' }}>
              {searchedPlayers
                .filter((player) => suggestionRole === 'ALL' || player.role === suggestionRole)
                .filter((player) => !comparisonNames.includes(player.name))
                .slice(0, 6)
                .map((player) => (
                  <button
                    type="button"
                    key={`compare-search-${playerKey(player)}`}
                    className="back-button"
                    style={{ width: '100%', display: 'flex', justifyContent: 'space-between', gap: '8px' }}
                    onClick={() => toggleComparisonPlayer(player)}
                  >
                    <span>+ {player.name} · {player.team}</span>
                    <span>{player.role} · {getMarket(player)}</span>
                  </button>
                ))}
            </div>
          )}

          {comparisonPlayers.length === 0 && <p className="tip">Nessun giocatore selezionato.</p>}

          {comparisonPlayers.length > 0 && (
            <div style={{ display: 'grid', gap: '7px' }}>
              {[...comparisonPlayers]
                .sort((a, b) => buyNowIntelligence(b, getMarket(b)).actionScore - buyNowIntelligence(a, getMarket(a)).actionScore)
                .map((player, index) => {
                  const intel = chirurgoScore(player)
                  const buy = buyNowIntelligence(player, getMarket(player))
                  const forecast = finalPriceForecast(player, getMarket(player))
                  return (
                    <div className="main-card" key={`compare-page-${playerKey(player)}`} style={{ border: index === 0 ? '1px solid rgba(66,214,164,.32)' : undefined }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '9px', alignItems: 'center' }}>
                        <PlayerPhoto player={player} size={48} />
                        <div>
                          <strong style={{ display: 'block' }}>{index === 0 ? '🏆 ' : ''}{player.name}</strong>
                          <small>{player.team} · {player.role}</small>
                        </div>
                        <strong>{scoreOutOf10(buy.actionScore)}</strong>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '5px', marginTop: '7px' }}>
                        <div className="stat"><span>AZIONE</span><strong style={{ fontSize: '9px' }}>{buy.action}</strong></div>
                        <div className="stat"><span>STOP</span><strong>{buy.max}</strong></div>
                        <div className="stat"><span>STIMA</span><strong>{forecast.predictedFinal}</strong></div>
                        <div className="stat"><span>RISCHIO</span><strong>{scoreOutOf10(buy.risk)}</strong></div>
                        <div className="stat"><span>FORMA</span><strong>{scoreOutOf10(intel.liveForm)}</strong></div>
                        <div className="stat"><span>DISP.</span><strong>{scoreOutOf10(intel.availability)}</strong></div>
                        <div className="stat"><span>VALUE</span><strong>{scoreOutOf10(intel.value)}</strong></div>
                        <div className="stat"><span>TIT.</span><strong>{estimatedStarterPct(player)}%</strong></div>
                      </div>
                      <button type="button" className="back-button" style={{ width: '100%', marginTop: '7px' }} onClick={() => toggleComparisonPlayer(player)}>RIMUOVI</button>
                    </div>
                  )
                })}
            </div>
          )}
        </section>
      )}

      {view === 'live' && (
        <>
          <header className="topbar">
            <div><p className="eyebrow">GAME THEORY</p><h1>ASTA LIVE</h1></div>
            <div className="budget-box"><span>RESIDUO</span><strong>{budget}</strong></div>
          </header>

          <section className="stats">
            <div className="stat"><span>BASE</span><strong>{startingBudget}</strong></div>
            <div className="stat highlight-stat"><span>BUDGET</span><strong>{budget}</strong></div>
            <div className="stat"><span>ROSA</span><strong>{purchases.length}/25</strong></div>
            <div className="stat"><span>RIVALI</span><strong>{activeRivalCount}</strong></div>
          </section>

          <section className="section">
            <div className="section-title">GIOCATORE CHIAMATO</div>
            <div className="target-card">
              <input type="text" placeholder="Cerca giocatore..." value={liveSearch} onChange={(event) => { setLiveSearch(event.target.value); setLiveSelectedName('') }} />
              {liveSearch && !livePlayer && (
                <div style={{ display: 'grid', gap: '6px', marginTop: '10px' }}>
                  {liveResults.map((player) => (
                    <button key={`${player.name}-${player.team}`} type="button" onClick={() => selectLivePlayer(player)}
                      style={{ display: 'grid', gridTemplateColumns: '35px 1fr auto', gap: '9px', padding: '11px', border: '1px solid #202a3e', borderRadius: '10px', background: '#0e1523', color: '#fff', textAlign: 'left' }}>
                      <strong>{player.role}</strong>
                      <div><strong>{player.name}</strong><small style={{ display: 'block', color: '#78859b' }}>{player.team}</small></div>
                      <strong>{scoreOutOf10(calculateTargetScore(player))}/10</strong>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          {livePlayer && (
            <>
              {liveBidThresholds && (
            <section className="section">
              <div className="section-title"><span>💰</span>SOGLIE DI RILANCIO</div>

              <div className="main-card">
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3,1fr)',
                  gap: '7px',
                }}>
                  <div style={{
                    padding: '10px 7px',
                    border: '1px solid #315a49',
                    borderRadius: '9px',
                    background: '#10251d',
                    textAlign: 'center',
                  }}>
                    <span style={{
                      display: 'block',
                      color: '#70d6a1',
                      fontSize: '7px',
                      fontWeight: 900,
                    }}>
                      ATTACCA FINO A
                    </span>
                    <strong style={{ fontSize: '20px' }}>
                      {liveBidThresholds.attack}
                    </strong>
                  </div>

                  <div style={{
                    padding: '10px 7px',
                    border: '1px solid #6b5830',
                    borderRadius: '9px',
                    background: '#282315',
                    textAlign: 'center',
                  }}>
                    <span style={{
                      display: 'block',
                      color: '#f2c66d',
                      fontSize: '7px',
                      fontWeight: 900,
                    }}>
                      DISCIPLINA FINO A
                    </span>
                    <strong style={{ fontSize: '20px' }}>
                      {liveBidThresholds.discipline}
                    </strong>
                  </div>

                  <div style={{
                    padding: '10px 7px',
                    border: '1px solid #753f48',
                    borderRadius: '9px',
                    background: '#2b171c',
                    textAlign: 'center',
                  }}>
                    <span style={{
                      display: 'block',
                      color: '#ff9aa8',
                      fontSize: '7px',
                      fontWeight: 900,
                    }}>
                      STOP STRATEGICO
                    </span>
                    <strong style={{ fontSize: '20px' }}>
                      {liveBidThresholds.stop}
                    </strong>
                  </div>
                </div>

                <p className="tip" style={{ marginTop: '10px' }}>
                  Mercato {getMarket(livePlayer)} · {liveBidThresholds.marketReference}.
                  Le soglie si adattano a strategia, fit, fase dell’asta e budget disponibile.
                </p>
              </div>
            </section>
          )}

          <section className="section">
              <div className="section-title">GAME THEORY LIVE</div>
              <div className="main-card">
                <div className="player-heading">
                  <div style={{ display: 'flex', gap: '11px', alignItems: 'center' }}>
                    <PlayerPhoto player={livePlayer} size={88} card />
                    <div>
                      <p className="small-label">{roleNames[livePlayer.role]} · {livePlayer.tier}</p>
                      <h2>{livePlayer.name}</h2>
                      <p className="description">{livePlayer.team}</p>
                    </div>
                  </div>
                  <div className="recommendation-score"><span>VALUTAZIONE</span><strong>{scoreOutOf10(liveScore)}/10</strong></div>
                </div>

                <div className="dynamic-info-grid">
                  <div className="dynamic-main"><span>MAX LIVE</span><strong>{liveDynamicMax}</strong></div>
                  <div><span>MERCATO</span><strong>{getMarket(livePlayer)}</strong></div>
                  <div><span>FIT STRATEGIA</span><strong>{scoreOutOf10(calculateStrategyFit(livePlayer))}/10</strong></div>
                  <div><span>MARGINE</span><strong>{liveMargin}</strong></div>
                </div>

                <div style={{ marginTop: '8px', padding: '10px', border: '1px solid #273149', borderRadius: '10px', background: '#0b111e' }}>
                  <span style={{ color: '#70d6a1', fontSize: '8px', fontWeight: 900 }}>
                    PERCHÉ PER {currentStrategy.name}
                  </span>
                  <p style={{ margin: '5px 0 0', color: '#a8b1c2', fontSize: '11px', lineHeight: 1.55 }}>
                    {strategyReason(livePlayer)}
                  </p>
                </div>

                <div style={{ marginTop: '12px', padding: '14px', border: '1px solid #33405c', borderRadius: '12px', background: '#0b111e' }}>
                  <span style={{ color: '#70d6a1', fontSize: '9px', fontWeight: 900 }}>DASHBOARD DECISIONALE</span>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '8px', marginTop: '10px' }}>
                    <div style={{ padding: '10px', border: '1px solid #273149', borderRadius: '10px' }}>
                      <span style={{ color: '#78859b', fontSize: '8px', fontWeight: 900 }}>TIPO</span>
                      <strong style={{ display: 'block', marginTop: '4px' }}>
                        {liveCallType?.icon} {liveCallType?.label}
                      </strong>
                    </div>
                    <div style={{ padding: '10px', border: '1px solid #273149', borderRadius: '10px' }}>
                      <span style={{ color: '#78859b', fontSize: '8px', fontWeight: 900 }}>COMPATIBILITÀ</span>
                      <strong style={{ display: 'block', marginTop: '4px' }}>{scoreOutOf10(liveTargetValue)}/10</strong>
                    </div>
                    <div style={{ padding: '10px', border: '1px solid #273149', borderRadius: '10px' }}>
                      <span style={{ color: '#78859b', fontSize: '8px', fontWeight: 900 }}>IMPATTO BUDGET</span>
                      <strong style={{ display: 'block', marginTop: '4px', color: liveBudgetImpact.color }}>{liveBudgetImpact.label}</strong>
                    </div>
                    <div style={{ padding: '10px', border: '1px solid #273149', borderRadius: '10px' }}>
                      <span style={{ color: '#78859b', fontSize: '8px', fontWeight: 900 }}>BUDGET DOPO</span>
                      <strong style={{ display: 'block', marginTop: '4px' }}>{liveBudgetAfter}</strong>
                    </div>
                  </div>

                  <div style={{ marginTop: '8px', padding: '10px', border: '1px solid #273149', borderRadius: '10px' }}>
                    <span style={{ color: '#78859b', fontSize: '8px', fontWeight: 900 }}>SE LO COMPRI ORA</span>
                    <p style={{ margin: '5px 0 0', color: '#a8b1c2', fontSize: '11px', lineHeight: 1.6 }}>
                      Restano <strong>{liveSlotsAfter}</strong> slot ·
                      <strong> {liveCreditsPerSlotAfter.toFixed(1)}</strong> cr/slot ·
                      reparto {livePlayer.role}: <strong>{Math.max(0, roleRemaining(livePlayer.role) - 1)}</strong> slot dopo l’acquisto.
                    </p>
                  </div>

                  <div style={{ marginTop: '8px', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '6px' }}>
                    <div style={{ textAlign: 'center', padding: '8px 4px', border: '1px solid #273149', borderRadius: '9px' }}>
                      <span style={{ display: 'block', color: '#78859b', fontSize: '7px', fontWeight: 900 }}>TARGET</span>
                      <strong>{scoreOutOf10(liveTargetValue)}</strong>
                    </div>
                    <div style={{ textAlign: 'center', padding: '8px 4px', border: '1px solid #273149', borderRadius: '9px' }}>
                      <span style={{ display: 'block', color: '#78859b', fontSize: '7px', fontWeight: 900 }}>SCOMMESSA</span>
                      <strong>{scoreOutOf10(liveBetValue)}</strong>
                    </div>
                    <div style={{ textAlign: 'center', padding: '8px 4px', border: '1px solid #273149', borderRadius: '9px' }}>
                      <span style={{ display: 'block', color: '#78859b', fontSize: '7px', fontWeight: 900 }}>ESCA</span>
                      <strong>{scoreOutOf10(liveDecoyValue)}</strong>
                    </div>
                  </div>
                </div>

                {liveSimulation && (
                  <div style={{ marginTop: '12px', padding: '14px', border: '1px solid #33405c', borderRadius: '12px', background: '#0d1422' }}>
                    <span style={{ color: '#79b8ff', fontSize: '9px', fontWeight: 900 }}>
                      🔮 SE LO COMPRO A {livePrice}
                    </span>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '7px', marginTop: '10px' }}>
                      <div style={{ padding: '9px', border: '1px solid #273149', borderRadius: '9px' }}>
                        <span style={{ color: '#78859b', fontSize: '7px', fontWeight: 900 }}>BUDGET DOPO</span>
                        <strong style={{ display: 'block', marginTop: '4px' }}>{liveSimulation.afterBudget}</strong>
                      </div>
                      <div style={{ padding: '9px', border: '1px solid #273149', borderRadius: '9px' }}>
                        <span style={{ color: '#78859b', fontSize: '7px', fontWeight: 900 }}>SLOT DOPO</span>
                        <strong style={{ display: 'block', marginTop: '4px' }}>{liveSimulation.afterSlots}</strong>
                      </div>
                      <div style={{ padding: '9px', border: '1px solid #273149', borderRadius: '9px' }}>
                        <span style={{ color: '#78859b', fontSize: '7px', fontWeight: 900 }}>CR/SLOT DOPO</span>
                        <strong style={{ display: 'block', marginTop: '4px' }}>{liveSimulation.afterCreditsPerSlot.toFixed(1)}</strong>
                      </div>
                    </div>

                    <div style={{ marginTop: '10px' }}>
                      <span style={{ color: '#78859b', fontSize: '8px', fontWeight: 900 }}>
                        BUDGET ADATTIVO DOPO L’ACQUISTO
                      </span>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '6px', marginTop: '6px' }}>
                        {roles.map((currentRole) => (
                          <div key={`sim-budget-${currentRole}`} style={{ textAlign: 'center', padding: '8px 3px', border: '1px solid #273149', borderRadius: '8px' }}>
                            <span style={{ display: 'block', color: '#78859b', fontSize: '7px', fontWeight: 900 }}>{currentRole}</span>
                            <strong>{Math.round(liveSimulation.adaptiveAfter[currentRole])}</strong>
                            <small style={{ display: 'block', color: '#78859b', fontSize: '7px' }}>
                              {liveSimulation.roleAveragesAfter[currentRole].toFixed(1)}/slot
                            </small>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div style={{ marginTop: '10px' }}>
                      <span style={{ color: '#78859b', fontSize: '8px', fontWeight: 900 }}>
                        PROSSIMI TARGET STIMATI
                      </span>
                      <div style={{ marginTop: '5px' }}>
                        {roles.map((currentRole) => {
                          const target = liveSimulation.nextTargets[currentRole]
                          return (
                            <div key={`sim-target-${currentRole}`} style={{ display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: '7px', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid #1d2638' }}>
                              <strong style={{ color: '#79b8ff' }}>{currentRole}</strong>
                              <span style={{ fontSize: '10px', color: target ? '#dce3ef' : '#657086' }}>
                                {target ? `${target.name} · ${target.team}` : 'Reparto completato'}
                              </span>
                              <small style={{ color: '#8e9ab0', fontSize: '8px' }}>
                                {target ? `MKT ${getMarket(target)}` : ''}
                              </small>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    <p style={{ margin: '9px 0 0', color: '#8e9ab0', fontSize: '9px', lineHeight: 1.5 }}>
                      Simulazione preventiva: non registra l’acquisto e non modifica i dati dell’asta.
                    </p>
                  </div>
                )}

                {livePressure && (
                  <div style={{ marginTop: '12px', padding: '14px', border: '1px solid #273149', borderRadius: '12px', background: '#0b111e' }}>
                    <span style={{ color: '#78859b', fontSize: '9px', fontWeight: 900 }}>PRESSIONE ASTA</span>
                    <strong style={{ display: 'block', marginTop: '4px', fontSize: '20px', color: pressureColor(livePressure.level) }}>{livePressure.level}</strong>
                    <p style={{ color: '#a8b1c2', fontSize: '11px', lineHeight: 1.6 }}>
                      Rivali interessati: <strong>{livePressure.rivals}</strong><br />
                      Pericolosità media: <strong>{livePressure.avgDanger.toFixed(1)}/10</strong><br />
                      Più pericoloso: <strong>{livePressure.strongest?.name ?? 'Nessuno'}</strong><br />
                      Profilo: <strong>{livePressure.strongest?.profile ?? '—'}</strong><br />
                      Pericolosità: <strong>{livePressure.strongest ? livePressure.strongest.danger.toFixed(1) + '/10' : '—'}</strong><br />
                      MAX teorico: <strong>{livePressure.strongest?.max ?? '—'}</strong>
                    </p>
                  </div>
                )}

                <label>Prezzo corrente</label>
                <div className="price-row">
                  <input type="number" min="0" value={livePrice} onChange={(event) => setLivePrice(Math.max(0, Number(event.target.value) || 0))} />
                  <button type="button" onClick={() => setLivePrice((current) => Math.max(0, current - 1))}>−1</button>
                  <button type="button" onClick={() => setLivePrice((current) => current + 1)}>+1</button>
                </div>

                {liveDecision && (
                  <div className={`decision-box ${liveDecision.className}`} style={{ padding: '15px', marginTop: '12px', borderRadius: '11px', textAlign: 'center' }}>
                    <span>DECISIONE</span><strong style={{ display: 'block', marginTop: '5px', fontSize: '21px' }}>{liveDecision.label}</strong>
                  </div>
                )}
                <p className="tip">{liveDecision?.message}</p>
                <button type="button" className="primary-button" onClick={liveSoldToMe}>VENDUTO A ME</button>

                <div style={{ marginTop: '12px' }}>
                  <label>Se lo prende:</label>
                  <select value={selectedRivalId} onChange={(event) => setSelectedRivalId(Number(event.target.value))}>
                    {activeRivals.map((name, index) => (
                      <option key={index} value={index}>{name} · {rivalBudget(index)} cr</option>
                    ))}
                  </select>
                  <button type="button" onClick={liveSoldToRival}
                    style={{ width: '100%', minHeight: '48px', marginTop: '8px', border: '1px solid #753f48', borderRadius: '11px', background: '#3a1d24', color: '#ff9aa8', fontWeight: 900 }}>
                    VENDUTO A RIVALE
                  </button>
                </div>
              </div>
            </section>
            </>
          )}

          {liveMessage && <div className="message">{liveMessage}</div>}
          {rivalSales.length > 0 && <button type="button" className="undo-button" onClick={undoLastRivalSale}>↶ ANNULLA ULTIMA VENDITA A RIVALE</button>}
        </>
      )}

      {view === 'myteam' && (
        <>
          <header className="topbar">
            <div>
              <p className="eyebrow">OBIETTIVI PERSONALI</p>
              <h1>MY TEAM</h1>
              <p className="tip" style={{ margin: '6px 0 0' }}>
                Costruisci la tua lista dei desideri. Le priorità entrano automaticamente
                nel motore dei suggerimenti.
              </p>
            </div>
          </header>

          <section className="section">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: '10px',
                alignItems: 'center',
              }}
            >
              <div>
                <div className="section-title">LISTA DEI DESIDERI</div>
                <p className="tip" style={{ margin: '5px 0 0' }}>
                  {wishlist.length}/130 totali · P 20 · D 40 · C 40 · A 30 · Priorità 1 = obiettivo principale.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '7px' }}>
                  {roles.map((role) => (
                    <span className="setup-badge" key={`wishlist-count-${role}`}>
                      {role} {wishlistPlayers.filter((entry) => entry.player.role === role).length}/{wishlistLimits[role]}
                    </span>
                  ))}
                </div>
              </div>

              <button
                type="button"
                className="primary-button"
                style={{ width: '48px', minHeight: '48px', padding: 0, fontSize: '22px' }}
                disabled={wishlistPlayers.filter((entry) => entry.player.role === wishlistAddRole).length >= wishlistLimits[wishlistAddRole]}
                onClick={() => setWishlistAddOpen((value) => !value)}
              >
                {wishlistAddOpen ? '−' : '+'}
              </button>
            </div>

            {wishlistAddOpen && wishlistPlayers.filter((entry) => entry.player.role === wishlistAddRole).length < wishlistLimits[wishlistAddRole] && (
              <div
                className="main-card"
                style={{
                  marginTop: '12px',
                  borderColor: 'rgba(244,119,168,.20)',
                  background: 'rgba(244,119,168,.055)',
                }}
              >
                <div className="section-title">AGGIUNGI GIOCATORE</div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4,1fr)',
                    gap: '6px',
                    marginTop: '9px',
                  }}
                >
                  {roles.map((role) => (
                    <button
                      type="button"
                      key={`wishlist-role-${role}`}
                      style={smallChoiceStyle(wishlistAddRole === role)}
                      onClick={() => {
                        setWishlistAddRole(role)
                        setWishlistSearch('')
                      }}
                    >
                      {role}
                    </button>
                  ))}
                </div>

                <input
                  value={wishlistSearch}
                  onChange={(event) => setWishlistSearch(event.target.value)}
                  placeholder={`Cerca ${roleNames[wishlistAddRole].toLowerCase()} per nome o squadra`}
                  style={{ marginTop: '9px' }}
                />

                <div style={{ display: 'grid', gap: '6px', marginTop: '8px' }}>
                  {wishlistAddResults.map((player) => (
                    <button
                      type="button"
                      key={`wishlist-add-${playerKey(player)}`}
                      className="recommendation-item"
                      onClick={() => addToWishlist(player)}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'auto 1fr auto',
                        gap: '8px',
                        alignItems: 'center',
                        width: '100%',
                        textAlign: 'left',
                        color: '#fff',
                        cursor: 'pointer',
                      }}
                    >
                      <PlayerPhoto player={player} size={36} />
                      <div>
                        <strong style={{ display: 'block' }}>{player.name}</strong>
                        <small style={{ color: '#94a5bc' }}>
                          {player.team} · Tit. {estimatedStarterPct(player)}%
                        </small>
                      </div>
                      <strong style={{ color: '#ff95c8' }}>＋</strong>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="section" style={{ padding: '10px' }}>
            <div className="section-title">FILTRA MY TEAM</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '5px', marginTop: '8px' }}>
              {(['ALL', ...roles] as const).map((role) => (
                <button
                  type="button"
                  key={`myteam-filter-${role}`}
                  style={smallChoiceStyle(wishlistFilterRole === role)}
                  onClick={() => setWishlistFilterRole(role)}
                >
                  {role === 'ALL' ? 'TUTTI' : role}
                </button>
              ))}
            </div>
            <input
              value={wishlistFilterSearch}
              onChange={(event) => setWishlistFilterSearch(event.target.value)}
              placeholder="Cerca tra i giocatori inseriti..."
              style={{ marginTop: '7px' }}
            />
          </section>

          {roles.filter((role) => wishlistFilterRole === 'ALL' || wishlistFilterRole === role).map((role) => {
            const filterQuery = wishlistFilterSearch.trim().toLowerCase()
            const entries = wishlistPlayers
              .filter((entry) => entry.player.role === role)
              .filter((entry) => !filterQuery || entry.player.name.toLowerCase().includes(filterQuery) || entry.player.team.toLowerCase().includes(filterQuery))
              .sort((a, b) => a.item.priority - b.item.priority)

            return (
              <section className="section" key={`wishlist-section-${role}`}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '10px',
                    alignItems: 'center',
                  }}
                >
                  <div className="section-title">{roleNames[role]}</div>
                  <span className="setup-badge">{entries.length} NOMI</span>
                </div>

                {entries.length === 0 ? (
                  <p className="tip" style={{ marginBottom: 0 }}>
                    Nessun giocatore inserito in questo ruolo.
                  </p>
                ) : (
                  <div style={{ display: 'grid', gap: '9px', marginTop: '10px' }}>
                    {entries.map(({ item, player }) => {
                      const boughtByMe = purchases.some(
                        (purchase) => playerKey(purchase.player) === playerKey(player)
                      )
                      const soldToRival = rivalSales.some(
                        (sale) => playerKey(sale.player) === playerKey(player)
                      )

                      return (
                        <div
                          className="main-card"
                          key={`wishlist-${item.playerKey}`}
                          style={{
                            padding: '10px',
                            opacity: boughtByMe || soldToRival ? .72 : 1,
                            borderColor: boughtByMe
                              ? 'rgba(71,214,157,.24)'
                              : soldToRival
                              ? 'rgba(255,123,114,.22)'
                              : 'rgba(244,119,168,.16)',
                          }}
                        >
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'auto 1fr auto',
                              gap: '9px',
                              alignItems: 'center',
                            }}
                          >
                            <PlayerPhoto player={player} size={48} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', alignItems: 'center' }}>
                                <span className="purchase-role">{player.role}</span>
                                <strong>{player.name}</strong>
                              </div>
                              <small style={{ color: '#94a5bc' }}>
                                {player.team} · Titolarità {estimatedStarterPct(player)}%
                              </small>
                              {boughtByMe && (
                                <small style={{ display: 'block', color: '#6ce6b3', marginTop: '3px', fontWeight: 900 }}>
                                  ✓ ACQUISTATO
                                </small>
                              )}
                              {soldToRival && (
                                <small style={{ display: 'block', color: '#ff958d', marginTop: '3px', fontWeight: 900 }}>
                                  ✕ PRESO DA UN RIVALE
                                </small>
                              )}
                            </div>

                            <div style={{ display: 'flex', gap: '5px' }}>
                              <button type="button" onClick={() => toggleWishlistStar(item.playerKey)} aria-label={`Stella ${player.name}`} style={{ width: '39px', minWidth: '39px', height: '39px', padding: 0, margin: 0, borderRadius: '12px', border: item.starred ? '2px solid #ffb703' : '1px solid rgba(64,92,160,.18)', background: item.starred ? '#fff1ad' : 'rgba(255,255,255,.75)', color: item.starred ? '#e58b00' : '#8390aa', fontSize: '20px' }}>{item.starred ? '★' : '☆'}</button>
                              <button type="button" className="undo-button" style={{ width: '37px', minWidth: '37px', height: '37px', padding: 0, fontSize: '18px', margin: 0 }} onClick={() => removeFromWishlist(item.playerKey)} aria-label={`Rimuovi ${player.name}`}>−</button>
                            </div>
                          </div>

                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '82px 1fr',
                              gap: '8px',
                              marginTop: '9px',
                              alignItems: 'end',
                            }}
                          >
                            <div>
                              <label style={{ marginTop: 0 }}>PRIORITÀ</label>
                              <select
                                value={item.priority}
                                onChange={(event) =>
                                  updateWishlistPriority(item.playerKey, Number(event.target.value))
                                }
                              >
                                {Array.from({ length: wishlistLimits[player.role] }, (_, index) => index + 1).map((priority) => (
                                  <option key={`priority-${priority}`} value={priority}>
                                    {priority}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="stat highlight-stat" style={{ minHeight: '45px' }}>
                              <span>PREZZO SUGGERITO MAX</span>
                              <strong>{calculateDynamicMax(player)}</strong>
                            </div>
                          </div>

                          <div style={{ marginTop: '7px' }}>
                            <textarea
                              value={item.comment ?? ''}
                              onChange={(event) => updateWishlistComment(item.playerKey, event.target.value)}
                              placeholder="Commento MY TEAM: es. voglio prenderlo, max 25, rilanciare subito..."
                              rows={2}
                              style={{ width: '100%', minHeight: '52px', resize: 'vertical' }}
                            />
                          </div>

                          <div
                            style={{
                              marginTop: '6px',
                              padding: '7px 9px',
                              borderRadius: '10px',
                              border: '1px solid rgba(113,135,255,.15)',
                              background: 'rgba(113,135,255,.055)',
                            }}
                          >
                            <small style={{ color: '#bfc9ff', fontWeight: 950 }}>INFO RAPIDE</small>
                            <p className="tip" style={{ margin: '3px 0 0' }}>
                              {wishlistUsefulDetails(player)}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            )
          })}

          <section className="section">
            <div className="section-title">COME INFLUENZA I SUGGERIMENTI</div>
            <p className="tip" style={{ marginBottom: 0, lineHeight: 1.65 }}>
              La ☆ trasforma un giocatore in ★ OBIETTIVO PRIORITARIO. La stella condiziona chiamate, suggerimenti, MAX sostenibile e strategia d'asta: l'app prova a conservare budget e timing per prenderlo. Un giocatore con ★ non viene mai proposto come esca. La priorità numerica continua a ordinare gli altri nomi della MY TEAM.
            </p>
          </section>
        </>
      )}

      {view === 'squad' && (
        <>
          <header className="topbar">
            <div>
              <p className="eyebrow">ANALISI STRATEGICA</p>
              <h1>LA MIA ROSA</h1>
            </div>
            <div className="budget-box">
              <span>VOTO</span>
              <strong>{purchases.length > 0 ? scoreOutOf10(squadOverallScore) : '—'}</strong>
            </div>
          </header>

          <section className="stats">
            <div className="stat">
              <span>COMPLETA</span>
              <strong>{Math.round(squadCompletion)}%</strong>
            </div>
            <div className="stat">
              <span>FIT STRATEGIA</span>
              <strong>{purchases.length > 0 ? scoreOutOf10(squadStrategyFit) : '—'}</strong>
            </div>
            <div className="stat">
              <span>VALUE</span>
              <strong>{purchases.length > 0 ? scoreOutOf10(squadValueScore) : '—'}</strong>
            </div>
            <div className="stat highlight-stat">
              <span>RESIDUO</span>
              <strong>{budget}</strong>
            </div>
          </section>

          <section className="section">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: '9px',
                alignItems: 'center',
              }}
            >
              <div>
                <span className="eyebrow">ANALISI COMPLETA</span>
                <strong style={{ display: 'block', marginTop: '3px' }}>
                  Report dell’asta
                </strong>
                <p className="tip" style={{ margin: '4px 0 0' }}>
                  Aprilo solo quando vuoi una lettura completa della rosa e dei prezzi.
                </p>
              </div>

              <button
                type="button"
                style={smallChoiceStyle(squadReportOpen)}
                onClick={() => setSquadReportOpen((value) => !value)}
              >
                {squadReportOpen ? '✕ CHIUDI' : '↗ APRI REPORT'}
              </button>
            </div>
          </section>

          {squadReportOpen && (
            <>
              <section className="stats">
                <div className="stat"><span>ROSA</span><strong>{purchases.length}/25</strong></div>
                <div className="stat"><span>SPESO</span><strong>{totalPaid}</strong></div>
                <div className="stat"><span>RESIDUO</span><strong>{budget}</strong></div>
                <div className="stat highlight-stat">
                  <span>VS MERCATO</span>
                  <strong>{totalSaving >= 0 ? '+' : ''}{totalSaving}</strong>
                </div>
              </section>

          <section className="section">
            <div className="section-title">VERDETTO</div>
            <div className="main-card" style={{ border: '1px solid #315a49' }}>
              <span className="eyebrow">{currentStrategy.name}</span>
              <h2 style={{ margin: '5px 0', fontSize: '28px' }}>
                {purchases.length > 0 ? `${scoreOutOf10(finalReportScore)}/10` : '—'}
              </h2>
              <p style={{ color: '#a8b1c2', fontSize: '10px', lineHeight: 1.6 }}>
                🏁 {finalReportVerdict()}
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '7px', marginTop: '12px' }}>
                <div style={{ padding: '8px', border: '1px solid #273149', borderRadius: '8px' }}>
                  <span style={{ display: 'block', color: '#78859b', fontSize: '7px' }}>QUALITÀ ROSA</span>
                  <strong>{purchases.length > 0 ? scoreOutOf10(squadOverallScore) : '—'}</strong>
                </div>
                <div style={{ padding: '8px', border: '1px solid #273149', borderRadius: '8px' }}>
                  <span style={{ display: 'block', color: '#78859b', fontSize: '7px' }}>STRATEGIA</span>
                  <strong>{purchases.length > 0 ? scoreOutOf10(squadStrategyFit) : '—'}</strong>
                </div>
                <div style={{ padding: '8px', border: '1px solid #273149', borderRadius: '8px' }}>
                  <span style={{ display: 'block', color: '#78859b', fontSize: '7px' }}>VALUE</span>
                  <strong>{purchases.length > 0 ? scoreOutOf10(squadValueScore) : '—'}</strong>
                </div>
              </div>
            </div>
          </section>

          <section className="section">
            <div className="section-title">BUDGET: PIANO VS REALE</div>
            <div style={{ display: 'grid', gap: '8px' }}>
              {squadRoleAnalyses.map((analysis) => {
                const difference = analysis.planned - analysis.spent
                return (
                  <div key={`report-budget-${analysis.role}`} className="main-card">
                    <div style={{ display: 'grid', gridTemplateColumns: '42px 1fr auto', gap: '10px', alignItems: 'center' }}>
                      <strong style={{ fontSize: '20px', color: '#79b8ff' }}>{analysis.role}</strong>
                      <div>
                        <span style={{ display: 'block', color: '#78859b', fontSize: '7px' }}>PIANO / REALE</span>
                        <strong>{analysis.planned} / {analysis.spent}</strong>
                      </div>
                      <strong style={{ color: difference >= 0 ? '#70d6a1' : '#ff9aa8' }}>
                        {difference >= 0 ? '+' : ''}{difference}
                      </strong>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="section">
            <div className="section-title">MIGLIORI AFFARI</div>
            {bestDeals.length === 0 ? (
              <div className="main-card"><p className="tip">Nessun acquisto da analizzare.</p></div>
            ) : (
              <div style={{ display: 'grid', gap: '8px' }}>
                {bestDeals.map((item, index) => (
                  <div key={`deal-${item.player.name}-${index}`} className="main-card">
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px' }}>
                      <div>
                        <span className="eyebrow">#{index + 1} AFFARE · {item.player.role}</span>
                        <strong style={{ display: 'block' }}>{item.player.name}</strong>
                        <small style={{ color: '#78859b' }}>{item.player.team}</small>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <strong style={{ color: item.saving >= 0 ? '#70d6a1' : '#f2c66d' }}>
                          {item.saving >= 0 ? '+' : ''}{item.saving}
                        </strong>
                        <small style={{ display: 'block', color: '#78859b' }}>
                          pagato {item.price} · mercato {item.market}
                        </small>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="section">
            <div className="section-title">OVERPAY</div>
            {biggestOverpays.length === 0 ? (
              <div className="main-card">
                <p className="tip">✓ Nessun acquisto sopra il valore di mercato stimato.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '8px' }}>
                {biggestOverpays.map((item, index) => (
                  <div key={`overpay-${item.player.name}-${index}`} className="main-card">
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px' }}>
                      <div>
                        <span className="eyebrow">#{index + 1} OVERPAY · {item.player.role}</span>
                        <strong style={{ display: 'block' }}>{item.player.name}</strong>
                        <small style={{ color: '#78859b' }}>{item.player.team}</small>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <strong style={{ color: '#ff9aa8' }}>+{item.price - item.market}</strong>
                        <small style={{ display: 'block', color: '#78859b' }}>
                          pagato {item.price} · mercato {item.market}
                        </small>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="section">
            <div className="section-title">REPARTI</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '7px' }}>
              {squadRoleAnalyses.map((analysis) => (
                <div key={`report-role-${analysis.role}`} className="main-card" style={{ textAlign: 'center', padding: '10px 5px' }}>
                  <span style={{ display: 'block', color: '#79b8ff', fontWeight: 900, fontSize: '16px' }}>{analysis.role}</span>
                  <strong style={{ display: 'block', fontSize: '18px', marginTop: '4px' }}>
                    {analysis.count > 0 ? scoreOutOf10(analysis.score) : '—'}
                  </strong>
                  <small style={{ color: '#78859b' }}>{analysis.count}/{analysis.required}</small>
                </div>
              ))}
            </div>
          </section>

          <section className="section">
            <div className="section-title">RIEPILOGO</div>
            <div className="main-card">
              <p className="tip">
                Valore di mercato stimato della rosa: <strong>{totalMarketValue}</strong><br />
                Crediti realmente spesi: <strong>{totalPaid}</strong><br />
                Differenza complessiva: <strong style={{ color: totalSaving >= 0 ? '#70d6a1' : '#ff9aa8' }}>
                  {totalSaving >= 0 ? '+' : ''}{totalSaving}
                </strong><br />
                Strategia utilizzata: <strong>{currentStrategy.name}</strong>
              </p>
            </div>
          </section>

          <button
            type="button"
            style={{ ...smallChoiceStyle(false), width: '100%', marginBottom: '14px' }}
            onClick={() => setSquadReportOpen(false)}
          >
            ✕ CHIUDI REPORT
          </button>
        </>
      )}

          <section className="section">
            <div className="section-title">GIUDIZIO ROSA</div>
            <div className="main-card" style={{ border: '1px solid #315a49' }}>
              <span className="eyebrow">{currentStrategy.name}</span>
              <h2 style={{ margin: '5px 0' }}>
                {purchases.length > 0
                  ? `${scoreOutOf10(squadOverallScore)}/10`
                  : 'ANALISI IN ATTESA'}
              </h2>
              <p style={{ color: '#a8b1c2', fontSize: '10px', lineHeight: 1.6 }}>
                🧠 {squadVerdict()}
              </p>

              {bestSquadRole && weakestSquadRole && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '8px',
                  marginTop: '10px',
                }}>
                  <div style={{ padding: '10px', border: '1px solid #24543e', borderRadius: '10px', background: '#10251d' }}>
                    <span style={{ display: 'block', color: '#70d6a1', fontSize: '7px', fontWeight: 900 }}>
                      PUNTO FORTE
                    </span>
                    <strong>{bestSquadRole.role} · {scoreOutOf10(bestSquadRole.score)}/10</strong>
                  </div>
                  <div style={{ padding: '10px', border: '1px solid #753f48', borderRadius: '10px', background: '#2b171c' }}>
                    <span style={{ display: 'block', color: '#ff9aa8', fontSize: '7px', fontWeight: 900 }}>
                      DA MIGLIORARE
                    </span>
                    <strong>{weakestSquadRole.role} · {scoreOutOf10(weakestSquadRole.score)}/10</strong>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="section">
            <div className="section-title">ANALISI REPARTI</div>
            <div style={{ display: 'grid', gap: '9px' }}>
              {squadRoleAnalyses.map((analysis) => (
                <div key={`squad-${analysis.role}`} className="main-card">
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '44px 1fr auto',
                    gap: '10px',
                    alignItems: 'center',
                  }}>
                    <div style={{
                      width: '42px',
                      height: '42px',
                      display: 'grid',
                      placeItems: 'center',
                      borderRadius: '10px',
                      border: '1px solid #33405c',
                      color: '#79b8ff',
                      fontWeight: 900,
                      fontSize: '18px',
                    }}>
                      {analysis.role}
                    </div>

                    <div>
                      <strong style={{ display: 'block' }}>
                        {analysis.count}/{analysis.required} giocatori
                      </strong>
                      <small style={{ color: '#78859b' }}>
                        Speso {analysis.spent} · Piano {analysis.planned}
                      </small>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <span style={{ display: 'block', color: '#78859b', fontSize: '7px', fontWeight: 900 }}>
                        VOTO
                      </span>
                      <strong style={{
                        fontSize: '18px',
                        color:
                          analysis.score >= 80
                            ? '#70d6a1'
                            : analysis.score >= 65
                            ? '#f2c66d'
                            : '#ff9aa8',
                      }}>
                        {analysis.count > 0 ? scoreOutOf10(analysis.score) : '—'}
                      </strong>
                    </div>
                  </div>

                  {analysis.count > 0 && (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3,1fr)',
                      gap: '6px',
                      marginTop: '10px',
                    }}>
                      <div style={{ padding: '7px', border: '1px solid #273149', borderRadius: '8px' }}>
                        <span style={{ display: 'block', color: '#78859b', fontSize: '7px' }}>QUALITÀ</span>
                        <strong>{scoreOutOf10(analysis.quality)}</strong>
                      </div>
                      <div style={{ padding: '7px', border: '1px solid #273149', borderRadius: '8px' }}>
                        <span style={{ display: 'block', color: '#78859b', fontSize: '7px' }}>STRATEGIA</span>
                        <strong>{scoreOutOf10(analysis.strategyFit)}</strong>
                      </div>
                      <div style={{ padding: '7px', border: '1px solid #273149', borderRadius: '8px' }}>
                        <span style={{ display: 'block', color: '#78859b', fontSize: '7px' }}>VALUE</span>
                        <strong>{scoreOutOf10(analysis.value)}</strong>
                      </div>
                    </div>
                  )}

                  <div style={{
                    height: '5px',
                    background: '#1a2233',
                    borderRadius: '999px',
                    overflow: 'hidden',
                    marginTop: '10px',
                  }}>
                    <div style={{
                      width: `${analysis.completion}%`,
                      height: '100%',
                      background: '#70d6a1',
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="section">
            <div className="section-title">ROSA ACQUISTATA</div>

            {purchases.length === 0 ? (
              <div className="main-card">
                <p className="tip">Nessun giocatore acquistato.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '8px' }}>
                {roles.map((currentRole) => {
                  const rolePlayers = purchases.filter(
                    (purchase) => purchase.player.role === currentRole
                  )

                  if (rolePlayers.length === 0) return null

                  return (
                    <div key={`squad-list-${currentRole}`} className="main-card">
                      <span className="eyebrow">RUOLO {currentRole}</span>
                      <div style={{ marginTop: '7px' }}>
                        {rolePlayers.map((purchase, index) => (
                          <div
                            key={`${purchase.player.name}-${index}`}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '1fr auto',
                              gap: '8px',
                              padding: '7px 0',
                              borderBottom:
                                index < rolePlayers.length - 1
                                  ? '1px solid #1d2638'
                                  : 'none',
                            }}
                          >
                            <span>
                              <strong style={{ display: 'block', fontSize: '10px' }}>
                                {purchase.player.name}
                              </strong>
                              <small style={{ color: '#78859b' }}>
                                {purchase.player.team}
                              </small>
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <strong>{purchase.price}</strong>
                              <button
                                type="button"
                                onClick={() => undoMyPurchase(purchases.indexOf(purchase))}
                                style={{
                                  minHeight: '44px',
                                  padding: '8px 10px',
                                  borderRadius: '9px',
                                  border: '1px solid rgba(255,107,107,.45)',
                                  background: 'rgba(255,107,107,.10)',
                                  color: '#ff9a9a',
                                  fontSize: '9px',
                                  fontWeight: 800,
                                  cursor: 'pointer',
                                }}
                                aria-label={`Rimuovi acquisto ${purchase.player.name}`}
                              >
                                RIMUOVI
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </>
      )}

      {view === 'more' && (
        <>
          <header className="topbar">
            <div>
              <p className="eyebrow">CHIRURGHI DEL FANTACALCIO</p>
              <h1>ALTRO</h1>
            </div>
          </header>

          <section className="section">
            <div className="section-title">STRATEGIA ASTA</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '10px' }}>
              <button type="button" className="back-button" onClick={() => setView('pairings')}>⚽ ABBINAMENTI</button>
              <button type="button" className="back-button" onClick={() => setView('analysis')}>ANALISI RIVALI</button>
              <button type="button" className="back-button" onClick={() => setView('compare')}>CONFRONTO</button>
              <button type="button" className="back-button" onClick={() => setView('rivals')}>RIVALI DETTAGLIO</button>
              <button type="button" className="back-button" onClick={() => setView('history')}>STORICO ASTA</button>
              <button type="button" className="back-button" onClick={() => setView('squad')}>ROSA COMPLETA</button>
              <button type="button" className="back-button" onClick={() => setView('settings')}>IMPOSTAZIONI</button>
            </div>

            <div className="main-card">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'center' }}>
                <div>
                  <small style={{ color: 'var(--muted)', fontWeight: 900 }}>STRATEGIA ATTIVA</small>
                  <strong style={{ display: 'block', marginTop: '3px', color: 'var(--blue)' }}>{currentStrategy.name}</strong>
                </div>
                <span className="setup-badge">MODIFICABILE</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '7px', marginTop: '10px' }}>
                {(Object.keys(strategies) as Strategy[]).map((item) => (
                  <button key={`more-strategy-${item}`} type="button" style={smallChoiceStyle(strategy === item)} onClick={() => setStrategy(item)}>
                    {strategies[item].name}
                  </button>
                ))}
              </div>
              <p className="tip" style={{ marginBottom: 0 }}>{currentStrategy.description} Suggerimenti, priorità ★ e MAX vengono ricalcolati subito.</p>
            </div>
          </section>

          <section className="section">
            <div className="section-title">AGGIORNAMENTO DATI</div>

            <div
              className="main-card"
              style={{
                borderColor: isOnline ? 'rgba(71,214,157,.18)' : 'rgba(242,189,92,.18)',
                background: isOnline ? 'rgba(71,214,157,.055)' : 'rgba(242,189,92,.055)',
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: '10px',
                  alignItems: 'start',
                }}
              >
                <div>
                  <small style={{ color: '#8fa2bb', fontWeight: 900 }}>STATO</small>
                  <strong
                    style={{
                      display: 'block',
                      marginTop: '3px',
                      color:
                        updateStatus === 'error'
                          ? '#ff958d'
                          : isOnline
                          ? '#6ce6b3'
                          : '#f5ca78',
                    }}
                  >
                    {updateStatusLabel()}
                  </strong>
                  <p className="tip" style={{ margin: '5px 0 0' }}>
                    {isOnline
                      ? 'Connessione disponibile. Puoi scaricare il pacchetto dati più recente.'
                      : 'Sei offline. L’asta continua normalmente con tutti i dati già memorizzati sul dispositivo.'}
                  </p>
                </div>

                <span
                  className="setup-badge"
                  style={{
                    color: isOnline ? '#6ce6b3' : '#f5ca78',
                    borderColor: isOnline ? 'rgba(71,214,157,.18)' : 'rgba(242,189,92,.18)',
                  }}
                >
                  {isOnline ? 'ONLINE' : 'OFFLINE'}
                </span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2,1fr)',
                  gap: '7px',
                  marginTop: '11px',
                }}
              >
                <div className="stat">
                  <span>ULTIMO DOWNLOAD</span>
                  <strong style={{ fontSize: '9px' }}>
                    {updateMeta ? formatUpdateDate(updateMeta.downloadedAt) : 'MAI'}
                  </strong>
                </div>
                <div className="stat">
                  <span>VERSIONE DATI</span>
                  <strong style={{ fontSize: '9px' }}>
                    {updateMeta?.version ?? 'BASE APP'}
                  </strong>
                </div>
              </div>

              {updateMeta && (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '5px',
                    marginTop: '8px',
                  }}
                >
                  <span className="setup-badge">{updateMeta.playerCount} RECORD AGGIORNATI</span>
                  <span className="setup-badge">
                    FEED {formatUpdateDate(updateMeta.generatedAt)}
                  </span>
                  {updateMeta.sourceLabel && (
                    <span className="setup-badge">{updateMeta.sourceLabel}</span>
                  )}
                </div>
              )}

              <button
                type="button"
                className="primary-button"
                style={{ width: '100%', marginTop: '12px' }}
                disabled={!isOnline || updateStatus === 'updating'}
                onClick={() => runDataUpdate()}
              >
                {updateStatus === 'updating' ? '↻ AGGIORNAMENTO…' : '↻ AGGIORNA ORA'}
              </button>

              {updateStatus === 'error' && (
                <div
                  style={{
                    marginTop: '8px',
                    padding: '9px',
                    borderRadius: '11px',
                    border: '1px solid rgba(255,123,114,.18)',
                    background: 'rgba(255,123,114,.07)',
                  }}
                >
                  <strong style={{ color: '#ff958d', fontSize: '9px' }}>ERRORE</strong>
                  <p className="tip" style={{ margin: '4px 0 0' }}>{updateError}</p>
                </div>
              )}

              {updateStatus === 'success' && (
                <div
                  style={{
                    marginTop: '8px',
                    padding: '9px',
                    borderRadius: '11px',
                    border: '1px solid rgba(71,214,157,.18)',
                    background: 'rgba(71,214,157,.07)',
                  }}
                >
                  <strong style={{ color: '#6ce6b3', fontSize: '9px' }}>
                    ✓ AGGIORNAMENTO COMPLETATO
                  </strong>
                  <p className="tip" style={{ margin: '4px 0 0' }}>
                    Dati aggiornati e controllo della versione dell’app completato. L’app si ricarica automaticamente con la versione più recente disponibile.
                  </p>
                </div>
              )}
            </div>

            <div className="main-card" style={{ marginTop: '9px' }}>
              <strong>GESTIONE DATI — FASE 1</strong>
              <p className="tip" style={{ margin: '5px 0 10px' }}>
                Dati sorgente e dati personali sono separati. Prima di ogni aggiornamento viene creato un backup locale.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '7px' }}>
                {[
                  ['LISTONE', 'players'],
                  ['FANTACALCIO', 'fantacalcio'],
                  ['STATISTICHE', 'stats'],
                  ['INFORTUNI', 'injuries'],
                  ['FORMAZIONI', 'lineups'],
                  ['MERCATO', 'market'],
                ].map(([label, dataset]) => {
                  const key = dataset as DatasetName
                  const entry = dataManifest.datasets[key]
                  const freshness = freshnessFor(key, entry.updatedAt)
                  const color = freshness === 'STALE' ? '#ff958d' : freshness === 'N/D' ? '#f5ca78' : '#6ce6b3'
                  return (
                    <div className="stat" key={dataset}>
                      <span>{label}</span>
                      <strong style={{ fontSize: '9px', color }}>{freshness}</strong>
                    </div>
                  )
                })}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '9px' }}>
                <span className="setup-badge">SCHEMA {dataManifest.schemaVersion}</span>
                <span className="setup-badge">MODEL {dataManifest.modelVersion}</span>
                <span className="setup-badge">CAMBI {phase1ChangeCount}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px', marginTop: '10px' }}>
                <button type="button" className="secondary-button" onClick={exportPhase1Backup}>ESPORTA BACKUP</button>
                <button type="button" className="secondary-button" onClick={importPhase1Backup}>RIPRISTINA BACKUP</button>
              </div>
            </div>

            <div className="main-card" style={{ marginTop: '9px' }}>
              <strong>COSA PUÒ AGGIORNARE</strong>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '5px',
                  marginTop: '8px',
                }}
              >
                {[
                  'ROSE',
                  'TRASFERIMENTI',
                  'RUOLI',
                  'PREZZI',
                  'TITOLARITÀ',
                  'RIGORISTI',
                  'PIAZZATI',
                  'STATISTICHE',
                  'INFORTUNI',
                  'TEMPI RECUPERO',
                ].map((item) => (
                  <span className="setup-badge" key={`update-cap-${item}`}>{item}</span>
                ))}
              </div>
              <p className="tip" style={{ margin: '9px 0 0' }}>
                L’aggiornamento modifica soltanto il database calcistico. MY TEAM, acquisti,
                prezzi pagati, rivali, strategia, storico e impostazioni personali restano intatti.
              </p>
            </div>

            {updateChanges.length > 0 && (
              <div className="main-card" style={{ marginTop: '9px' }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: '8px',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <strong>{updateChanges.length} MODIFICHE NEL PACCHETTO</strong>
                    <p className="tip" style={{ margin: '4px 0 0' }}>
                      Guarda cosa è cambiato rispetto al database precedente.
                    </p>
                  </div>
                  <button
                    type="button"
                    style={smallChoiceStyle(updateChangesOpen)}
                    onClick={() => setUpdateChangesOpen((value) => !value)}
                  >
                    {updateChangesOpen ? 'CHIUDI' : 'VEDI'}
                  </button>
                </div>

                {updateChangesOpen && (
                  <div style={{ display: 'grid', gap: '6px', marginTop: '9px' }}>
                    {updateChanges.slice(0, 100).map((change, index) => (
                      <div
                        key={`update-change-${index}-${change.player}`}
                        style={{
                          padding: '8px 9px',
                          borderRadius: '10px',
                          border: '1px solid rgba(139,169,209,.10)',
                          background: 'rgba(19,32,52,.58)',
                        }}
                      >
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <span className="setup-badge">{change.type.toUpperCase()}</span>
                          <strong style={{ fontSize: '9px' }}>{change.player}</strong>
                        </div>
                        <p className="tip" style={{ margin: '5px 0 0' }}>{change.detail}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {updateMeta && (
              <button
                type="button"
                className="undo-button"
                style={{ width: '100%', marginTop: '9px' }}
                onClick={clearDownloadedData}
              >
                ELIMINA SOLO DATI SCARICATI
              </button>
            )}
          </section>

          <section className="section">
            <div className="section-title">MODALITÀ OFFLINE</div>

            <div className="main-card">
              <strong>✓ ASTA DISPONIBILE SENZA INTERNET</strong>
              <p className="tip" style={{ margin: '6px 0 0', lineHeight: 1.65 }}>
                Budget, acquisti, ASTA LIVE, MY TEAM, rosa, rivali, storico, strategie e
                l’ultimo pacchetto dati scaricato rimangono memorizzati localmente.
                La connessione serve soltanto quando vuoi scaricare nuovi aggiornamenti.
              </p>
            </div>
          </section>

          <section className="section">
            <div className="section-title">STRUMENTI</div>

            <div style={{ display: 'grid', gap: '8px' }}>
              <button
                type="button"
                className="main-card"
                style={{ color: '#fff', textAlign: 'left', cursor: 'pointer' }}
                onClick={() => setView('history')}
              >
                <strong>◷ STORICO ASTA</strong>
                <p className="tip" style={{ marginBottom: 0 }}>
                  Tutti gli acquisti tuoi e dei rivali, con possibilità di annullare le operazioni.
                </p>
              </button>

              <button
                type="button"
                className="main-card"
                style={{ color: '#fff', textAlign: 'left', cursor: 'pointer' }}
                onClick={() => setView('settings')}
              >
                <strong>⚙ IMPOSTAZIONI & BACKUP</strong>
                <p className="tip" style={{ marginBottom: 0 }}>
                  Configurazione, strategia, esportazione, importazione e reset.
                </p>
              </button>
            </div>
          </section>
        </>
      )}

      {view === 'history' && (
        <>
          <header className="topbar">
            <div>
              <p className="eyebrow">CONTROLLO ASTA</p>
              <h1>CRONOLOGIA</h1>
            </div>
            <div className="budget-box">
              <span>OPERAZIONI</span>
              <strong>{auctionHistory.length}</strong>
            </div>
          </header>

          <section className="stats">
            <div className="stat"><span>MIEI</span><strong>{purchases.length}</strong></div>
            <div className="stat"><span>RIVALI</span><strong>{rivalSales.length}</strong></div>
            <div className="stat highlight-stat"><span>SPESO</span><strong>{startingBudget - budget}</strong></div>
            <div className="stat"><span>RESIDUO</span><strong>{budget}</strong></div>
          </section>

          <section className="section">
            <div className="section-title">LE MIE OPERAZIONI</div>

            {purchases.length === 0 ? (
              <div className="main-card">
                <p className="tip">Nessun acquisto registrato.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '8px' }}>
                {purchases.map((purchase, index) => (
                  <div key={`history-mine-${purchase.player.name}-${index}`} className="main-card">
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'center' }}>
                      <div>
                        <span className="eyebrow">MIO ACQUISTO · {purchase.player.role}</span>
                        <strong style={{ display: 'block', marginTop: '3px' }}>{purchase.player.name}</strong>
                        <small style={{ color: '#78859b' }}>{purchase.player.team}</small>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ display: 'block', color: '#78859b', fontSize: '7px', fontWeight: 900 }}>PREZZO</span>
                        <strong style={{ fontSize: '18px', color: '#70d6a1' }}>{purchase.price}</strong>
                      </div>
                    </div>

                    <button
                      type="button"
                      style={{ ...smallChoiceStyle(false), width: '100%', marginTop: '10px', border: '1px solid #753f48', color: '#ff9aa8' }}
                      onClick={() => undoMyPurchase(index)}
                    >
                      ↩ ANNULLA ACQUISTO
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="section">
            <div className="section-title">OPERAZIONI RIVALI</div>

            {rivalSales.length === 0 ? (
              <div className="main-card">
                <p className="tip">Nessun acquisto rivale registrato.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '8px' }}>
                {rivalSales.map((sale, index) => (
                  <div key={`history-rival-${sale.player.name}-${index}`} className="main-card">
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'center' }}>
                      <div>
                        <span className="eyebrow">
                          {activeRivals[sale.rivalId] ?? `RIVALE ${sale.rivalId + 1}`} · {sale.player.role}
                        </span>
                        <strong style={{ display: 'block', marginTop: '3px' }}>{sale.player.name}</strong>
                        <small style={{ color: '#78859b' }}>{sale.player.team}</small>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ display: 'block', color: '#78859b', fontSize: '7px', fontWeight: 900 }}>PREZZO</span>
                        <strong style={{ fontSize: '18px', color: '#79b8ff' }}>{sale.price}</strong>
                      </div>
                    </div>

                    <button
                      type="button"
                      style={{ ...smallChoiceStyle(false), width: '100%', marginTop: '10px' }}
                      onClick={() => undoRivalPurchase(index)}
                    >
                      ↩ ANNULLA ASSEGNAZIONE
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="section">
            <div className="section-title">SICUREZZA</div>
            <div className="main-card">
              <strong>Correzione immediata</strong>
              <p className="tip">
                Puoi annullare qualsiasi acquisto inserito per errore. Budget, giocatori disponibili,
                strategia adattiva, Regista d’Asta e analisi rivali vengono ricalcolati automaticamente.
              </p>
            </div>
          </section>
        </>
      )}

      {view === 'settings' && (
        <>
          <header className="topbar">
            <div>
              <p className="eyebrow">SICUREZZA ASTA</p>
              <h1>SALVATAGGIO</h1>
            </div>
            <div className="budget-box">
              <span>STATO</span>
              <strong>{saveStatus === 'error' ? 'ERRORE' : auctionSafe ? 'OK' : 'CHECK'}</strong>
            </div>
          </header>

          <section className="section">
            <div className="section-title">STRATEGIA ASTA</div>
            <div className="main-card">
              <p className="tip" style={{ marginTop: 0 }}>
                Puoi cambiare strategia anche durante l’asta. Tutti i suggerimenti e i MAX vengono ricalcolati automaticamente.
              </p>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2,1fr)',
                gap: '7px',
              }}>
                {(Object.keys(strategies) as Strategy[]).map((item) => (
                  <button
                    key={`settings-strategy-${item}`}
                    type="button"
                    style={smallChoiceStyle(strategy === item)}
                    onClick={() => setStrategy(item)}
                  >
                    {strategies[item].name}
                  </button>
                ))}
              </div>

              <p className="tip">{currentStrategy.description}</p>

              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
                marginTop: '10px',
              }}>
                <div style={{ padding: '9px', border: '1px solid #273149', borderRadius: '9px' }}>
                  <span style={{ display: 'block', color: '#78859b', fontSize: '7px' }}>
                    PARTECIPANTI
                  </span>
                  <strong>{leagueSize}</strong>
                </div>
                <div style={{ padding: '9px', border: '1px solid #273149', borderRadius: '9px' }}>
                  <span style={{ display: 'block', color: '#78859b', fontSize: '7px' }}>
                    CREDITI INIZIALI
                  </span>
                  <strong>{startingBudget}</strong>
                </div>
              </div>
            </div>
          </section>

          <section className="section">
            <div className="section-title">STATO DATI</div>
            <div className="main-card">
              <div style={{
                padding: '14px',
                border: `1px solid ${saveStatus === 'error' || !auctionSafe ? '#753f48' : '#24543e'}`,
                borderRadius: '12px',
                background: saveStatus === 'error' || !auctionSafe ? '#2b171c' : '#10251d',
              }}>
                <strong style={{
                  display: 'block',
                  color: saveStatus === 'error' || !auctionSafe ? '#ff9aa8' : '#70d6a1',
                  fontSize: '13px',
                }}>
                  {saveStatus === 'error'
                    ? '⚠ ERRORE SALVATAGGIO'
                    : !auctionSafe
                    ? '⚠ CONTROLLO ASTA'
                    : saveStatus === 'saving'
                    ? '● SALVATAGGIO...'
                    : '✓ DATI SALVATI'}
                </strong>

                <p style={{ margin: '6px 0 0', color: '#8e9ab0', fontSize: '10px', lineHeight: 1.5 }}>
                  {saveStatus === 'error'
                    ? 'Esporta subito un backup prima di continuare.'
                    : !auctionSafe
                    ? integrityIssues.join(' · ')
                    : lastSavedAt
                    ? `Ultimo salvataggio: ${lastSavedAt.toLocaleTimeString('it-IT', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}`
                    : 'Salvataggio locale automatico attivo.'}
                </p>
              </div>
            </div>
          </section>

          <section className="section">
            <div className="section-title">BACKUP</div>
            <div className="main-card">
              <p className="tip">
                Il salvataggio automatico continua anche quando non sei in questa schermata.
              </p>

              <div style={{ display: 'grid', gap: '9px', marginTop: '12px' }}>
                <button
                  type="button"
                  style={smallChoiceStyle(false)}
                  onClick={exportBackup}
                >
                  💾 ESPORTA BACKUP
                </button>

                <button
                  type="button"
                  style={smallChoiceStyle(false)}
                  onClick={importBackup}
                >
                  📥 IMPORTA BACKUP
                </button>

                <button
                  type="button"
                  style={{
                    ...smallChoiceStyle(false),
                    border: '1px solid #753f48',
                    color: '#ff9aa8',
                  }}
                  onClick={resetAuction}
                >
                  🗑 RESET ASTA
                </button>
              </div>
            </div>
          </section>

          <section className="section">
            <div className="section-title">CONTROLLO INTEGRITÀ</div>
            <div className="main-card">
              <strong style={{ color: auctionSafe ? '#70d6a1' : '#ff9aa8' }}>
                {auctionSafe ? '✓ Tutto regolare' : '⚠ Verifica necessaria'}
              </strong>
              <p className="tip">
                {auctionSafe
                  ? 'Nessun problema rilevato nei dati dell’asta.'
                  : integrityIssues.join(' · ')}
              </p>
            </div>
          </section>

        </>
      )}

      {view === 'rivals' && (
        <>
          <header className="topbar">
            <div>
              <p className="eyebrow">GAME THEORY · CONFRONTO LIVE</p>
              <h1>LEGA & RIVALI</h1>
            </div>
            <div className="budget-box">
              <span>POSIZIONE</span>
              <strong>{myLeaguePosition}/{leagueSize}</strong>
            </div>
          </header>

          <section className="stats">
            <div className="stat">
              <span>MIO VOTO</span>
              <strong>{purchases.length > 0 ? scoreOutOf10(finalReportScore) : '—'}</strong>
            </div>
            <div className="stat">
              <span>GIOCATORI</span>
              <strong>{purchases.length}/25</strong>
            </div>
            <div className="stat">
              <span>BUDGET</span>
              <strong>{budget}</strong>
            </div>
            <div className="stat highlight-stat">
              <span>LEGA</span>
              <strong>{leagueSize}</strong>
            </div>
          </section>

          <section className="section">
            <div className="section-title">SITUAZIONE LEGA</div>
            <div className="main-card" style={{ border: '1px solid #315a49' }}>
              <span className="eyebrow">CLASSIFICA STIMATA</span>
              <h2 style={{ margin: '5px 0' }}>#{myLeaguePosition}</h2>
              <p style={{ color: '#a8b1c2', fontSize: '10px', lineHeight: 1.6 }}>
                🧠 {rankingVerdict()}
              </p>
              <p className="tip">
                Il confronto usa solo gli acquisti che hai registrato nell’app:
                qualità, prezzo pagato, completamento dei ruoli e budget residuo.
              </p>
            </div>
          </section>

          <section className="section">
            <div className="section-title">CLASSIFICA ROSE</div>
            <div style={{ display: 'grid', gap: '8px' }}>
              {leagueRanking.map((entry, index) => (
                <div
                  key={entry.id}
                  className="main-card"
                  style={{
                    border: entry.isMe ? '1px solid #315a49' : undefined,
                    background: entry.isMe ? '#10251d' : undefined,
                  }}
                >
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '34px 1fr auto',
                    gap: '9px',
                    alignItems: 'center',
                  }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      display: 'grid',
                      placeItems: 'center',
                      borderRadius: '9px',
                      border: '1px solid #33405c',
                      fontWeight: 900,
                      color: index === 0 ? '#f2c66d' : '#79b8ff',
                    }}>
                      {index + 1}
                    </div>

                    <div>
                      <strong style={{ display: 'block' }}>{entry.name}</strong>
                      <small style={{ color: '#78859b' }}>
                        {entry.count}/25 · budget {entry.remaining}
                      </small>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <span style={{ display: 'block', color: '#78859b', fontSize: '7px', fontWeight: 900 }}>
                        VOTO
                      </span>
                      <strong style={{
                        fontSize: '18px',
                        color:
                          entry.score >= 80
                            ? '#70d6a1'
                            : entry.score >= 65
                            ? '#f2c66d'
                            : '#ff9aa8',
                      }}>
                        {entry.count > 0 ? scoreOutOf10(entry.score) : '—'}
                      </strong>
                    </div>
                  </div>

                  {entry.count > 0 && (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4,1fr)',
                      gap: '5px',
                      marginTop: '9px',
                    }}>
                      <div style={{ padding: '6px', border: '1px solid #273149', borderRadius: '7px' }}>
                        <span style={{ display: 'block', color: '#78859b', fontSize: '6px' }}>QUALITÀ</span>
                        <strong>{scoreOutOf10(entry.quality)}</strong>
                      </div>
                      <div style={{ padding: '6px', border: '1px solid #273149', borderRadius: '7px' }}>
                        <span style={{ display: 'block', color: '#78859b', fontSize: '6px' }}>VALUE</span>
                        <strong>{scoreOutOf10(entry.value)}</strong>
                      </div>
                      <div style={{ padding: '6px', border: '1px solid #273149', borderRadius: '7px' }}>
                        <span style={{ display: 'block', color: '#78859b', fontSize: '6px' }}>COMPL.</span>
                        <strong>{Math.round(entry.completion)}%</strong>
                      </div>
                      <div style={{ padding: '6px', border: '1px solid #273149', borderRadius: '7px' }}>
                        <span style={{ display: 'block', color: '#78859b', fontSize: '6px' }}>
                          {entry.isMe ? 'STRATEGIA' : 'EQUILIBRIO'}
                        </span>
                        <strong>{scoreOutOf10(entry.balance)}</strong>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {strongestRival && (
            <section className="section">
              <div className="section-title">RIVALE DA BATTERE</div>
              <div className="main-card" style={{ border: '1px solid #753f48' }}>
                <span className="eyebrow">⚠ PIÙ FORTE AL MOMENTO</span>
                <h2 style={{ margin: '5px 0' }}>{strongestRival.name}</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '7px' }}>
                  <div>
                    <span style={{ display: 'block', color: '#78859b', fontSize: '7px' }}>VOTO</span>
                    <strong>{scoreOutOf10(strongestRival.score)}</strong>
                  </div>
                  <div>
                    <span style={{ display: 'block', color: '#78859b', fontSize: '7px' }}>BUDGET</span>
                    <strong>{strongestRival.remaining}</strong>
                  </div>
                  <div>
                    <span style={{ display: 'block', color: '#78859b', fontSize: '7px' }}>ROSA</span>
                    <strong>{strongestRival.count}/25</strong>
                  </div>
                </div>
              </div>
            </section>
          )}

          <section className="section">
            <div className="section-title">LETTURA CORRETTA</div>
            <div className="main-card">
              <p className="tip">
                Questa è una stima dinamica, non una previsione del campionato.
                Più acquisti dei rivali registri, più il confronto diventa rappresentativo.
              </p>
            </div>
          </section>


          <section className="section">
            <div className="section-title">CONTROLLO AVVERSARI</div>
            <div style={{ display: 'grid', gap: '10px' }}>
              {activeRivals.map((name, rivalId) => {
                const threat = rivalThreat(rivalId)
                const intel = rivalIntelligence(rivalId)
                return (
                  <div key={rivalId} className="main-card">
                    <input type="text" value={name} onChange={(event) => renameRival(rivalId, event.target.value)} style={{ fontWeight: 900, fontSize: '15px' }} />
                    <div className="dynamic-info-grid">
                      <div className="dynamic-main"><span>BUDGET</span><strong>{rivalBudget(rivalId)}</strong></div>
                      <div><span>SPESO</span><strong>{rivalSpent(rivalId)}</strong></div>
                      <div><span>GIOCATORI</span><strong>{rivalPurchases(rivalId).length}</strong></div>
                      <div><span>MAX TEORICO</span><strong>{rivalMaxOffer(rivalId)}</strong></div>
                    </div>

                    <div style={{ marginTop: '8px', padding: '10px', border: '1px solid #273149', borderRadius: '10px', background: '#0b111e' }}>
                      <span style={{ color: '#68758d', fontSize: '8px', fontWeight: 900 }}>MINACCIA ASTA</span>
                      <strong style={{ display: 'block', color: threat.color, marginTop: '3px' }}>{threat.label}</strong>
                    </div>

                    <div style={{ marginTop: '8px', padding: '12px', border: '1px solid #273149', borderRadius: '10px', background: '#0b111e' }}>
                      <span style={{ color: '#68758d', fontSize: '8px', fontWeight: 900 }}>INTELLIGENZA RIVALE</span>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '8px' }}>
                        <div><small style={{ color: '#78859b' }}>PROFILO</small><strong style={{ display: 'block' }}>{intel.profile}</strong></div>
                        <div><small style={{ color: '#78859b' }}>PERICOLOSITÀ</small><strong style={{ display: 'block' }}>{intel.threatScore.toFixed(1)}/10</strong></div>
                        <div><small style={{ color: '#78859b' }}>AGGRESSIVITÀ</small><strong style={{ display: 'block' }}>{intel.aggression.toFixed(1)}/10</strong></div>
                        <div><small style={{ color: '#78859b' }}>VS MERCATO</small><strong style={{ display: 'block' }}>{intel.sample > 0 ? Math.round(intel.avgMarketRatio * 100) + '%' : '—'}</strong></div>
                      </div>
                      <p style={{ color: '#78859b', fontSize: '10px', lineHeight: 1.5, marginBottom: 0 }}>
                        Analisi basata su {intel.sample} acquisti registrati. Diventa più affidabile durante l’asta.
                      </p>
                    </div>

                    <div className="roster-summary">
                      {roles.map((currentRole) => (
                        <div key={currentRole}><span>{currentRole}</span><strong>{rivalRoleCount(rivalId, currentRole)}/{slotLimits[currentRole]}</strong></div>
                      ))}
                    </div>

                    <div className="purchases">
                      {rivalPurchases(rivalId).map((sale, index) => (
                        <div className="purchase-row" key={`${sale.player.name}-${index}`}>
                          <span className="purchase-role">{sale.player.role}</span>
                          <PlayerPhoto player={sale.player} size={34} />
                          <div className="purchase-player"><strong>{sale.player.name}</strong><small>{sale.player.team}</small></div>
                          <div className="purchase-price"><small>PREZZO</small><strong>{sale.price}</strong></div>
                          <button
                            type="button"
                            onClick={() => undoRivalPurchase(rivalSales.indexOf(sale))}
                            style={{
                              minHeight: '44px',
                              padding: '8px 10px',
                              borderRadius: '9px',
                              border: '1px solid rgba(255,107,107,.45)',
                              background: 'rgba(255,107,107,.10)',
                              color: '#ff9a9a',
                              fontSize: '9px',
                              fontWeight: 800,
                              cursor: 'pointer',
                            }}
                            aria-label={`Rimuovi assegnazione ${sale.player.name}`}
                          >
                            RIMUOVI
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

export default App