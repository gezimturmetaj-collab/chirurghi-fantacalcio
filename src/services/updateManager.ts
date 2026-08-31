import type { DataChange, DatasetName, FreshnessState, SourcePlayerData, UpdateManifest } from '../data/schema'
import { compareDatasets } from './changeDetector'
import { DataManager, type LegacyPlayerUpdate } from './dataManager'
import { createUserBackup, STORAGE_KEYS_V2 } from './storageManager'

export const DEFAULT_MANIFEST: UpdateManifest = {
  season: '2026-27',
  schemaVersion: '2.0',
  modelVersion: '2.0.0',
  updatedAt: new Date(0).toISOString(),
  datasets: {
    players: { updatedAt: null, source: null },
    fantacalcio: { updatedAt: null, source: null },
    stats: { updatedAt: null, source: null },
    advancedStats: { updatedAt: null, source: null },
    injuries: { updatedAt: null, source: null },
    lineups: { updatedAt: null, source: null },
    fixtures: { updatedAt: null, source: null },
    editorial: { updatedAt: null, source: null },
    market: { updatedAt: null, source: null },
  },
}

export type LegacyUpdatePayload = {
  version: string
  generatedAt: string
  sourceLabel?: string
  players: LegacyPlayerUpdate[]
  changes?: Array<{ type: string; player: string; detail: string }>
  manifest?: UpdateManifest
}

const staleHours: Record<DatasetName, number> = {
  players: 48,
  fantacalcio: 48,
  stats: 48,
  advancedStats: 48,
  injuries: 12,
  lineups: 12,
  fixtures: 24 * 7,
  editorial: 24,
  market: 24,
}

export function freshnessFor(dataset: DatasetName, updatedAt: string | null, now = Date.now()): FreshnessState {
  if (!updatedAt) return 'N/D'
  const t = new Date(updatedAt).getTime()
  if (!Number.isFinite(t)) return 'N/D'
  const hours = Math.max(0, (now - t) / 3_600_000)
  if (hours > staleHours[dataset]) return 'STALE'
  if (hours < 1) return 'LIVE'
  if (hours < 24) return 'OGGI'
  if (hours < 48) return '1g'
  return '3g'
}

export function loadManifest(): UpdateManifest {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS_V2.manifest)
    return raw ? { ...DEFAULT_MANIFEST, ...JSON.parse(raw) } : DEFAULT_MANIFEST
  } catch { return DEFAULT_MANIFEST }
}

export class UpdateManager {
  constructor(private dataManager: DataManager) {}

  async loadManifestFromUrl(url = '/data/update_manifest.json') {
    try {
      const response = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' })
      if (!response.ok) throw new Error(`Manifest HTTP ${response.status}`)
      const manifest = await response.json() as UpdateManifest
      if (manifest.schemaVersion !== '2.0' || manifest.season !== '2026-27') throw new Error('Manifest incompatibile')
      this.dataManager.setManifest(manifest)
      return manifest
    } catch {
      return loadManifest()
    }
  }

  applyLegacyPayload(payload: LegacyUpdatePayload) {
    if (!payload || !Array.isArray(payload.players) || typeof payload.generatedAt !== 'string') throw new Error('Pacchetto dati non valido.')
    createUserBackup()
    const previous: SourcePlayerData[] = structuredClone(this.dataManager.getSourcePlayers())
    const next = this.dataManager.mergeLegacyUpdates(payload.players, payload.sourceLabel, payload.generatedAt)
    const changes = compareDatasets(previous, next)
    localStorage.setItem(STORAGE_KEYS_V2.changes, JSON.stringify(changes))

    const manifest = payload.manifest ?? loadManifest()
    manifest.updatedAt = payload.generatedAt
    manifest.datasets.players = { updatedAt: payload.generatedAt, source: payload.sourceLabel ?? 'UPDATE_FEED' }
    manifest.datasets.fantacalcio = { updatedAt: payload.generatedAt, source: payload.sourceLabel ?? 'UPDATE_FEED' }
    this.dataManager.setManifest(manifest)
    return { next, changes, manifest }
  }

  getLastChanges(): DataChange[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS_V2.changes)
      return raw ? JSON.parse(raw) as DataChange[] : []
    } catch { return [] }
  }
}