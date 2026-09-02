import type { DataChange, DatasetName, FreshnessState, SourcePlayerData, UpdateManifest } from '../data/schema'
import { compareDatasets } from './changeDetector'
import { DataManager, type LegacyPlayerUpdate } from './dataManager'

export const DEFAULT_MANIFEST: UpdateManifest = {
  season: '2026-27', schemaVersion: '2.0', modelVersion: '2.0.0', updatedAt: new Date(0).toISOString(),
  datasets: {
    players: { updatedAt: null, source: null }, fantacalcio: { updatedAt: null, source: null },
    stats: { updatedAt: null, source: null }, advancedStats: { updatedAt: null, source: null },
    injuries: { updatedAt: null, source: null }, lineups: { updatedAt: null, source: null },
    fixtures: { updatedAt: null, source: null }, editorial: { updatedAt: null, source: null },
    market: { updatedAt: null, source: null },
  },
}

export type LegacyUpdatePayload = {
  version: string; generatedAt: string; sourceLabel?: string; players: LegacyPlayerUpdate[]
  changes?: Array<{ type: string; player: string; detail: string }>; manifest?: UpdateManifest
}

const MANIFEST_KEY = 'fantawarroom_v2_manifest'
const CHANGES_KEY = 'fantawarroom_v2_changes'
const staleHours: Record<DatasetName, number> = {
  players: 48, fantacalcio: 48, stats: 48, advancedStats: 48, injuries: 12,
  lineups: 12, fixtures: 168, editorial: 24, market: 24,
}

function quotaError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error ?? '').toLowerCase()
  return (
    (typeof DOMException !== 'undefined' && error instanceof DOMException && (
      error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED' || error.code === 22 || error.code === 1014
    )) || message.includes('quota') || (message.includes('storage') && message.includes('exceed'))
  )
}

function safeCacheWrite(key: string, value: unknown) {
  const text = JSON.stringify(value)
  try { localStorage.setItem(key, text); return true } catch (error) {
    if (!quotaError(error)) return false
    try {
      for (const disposable of ['fantawarroom_v2_sourceData','fantawarroom_v2_changelog',CHANGES_KEY]) {
        if (disposable !== key) localStorage.removeItem(disposable)
      }
      localStorage.setItem(key, text)
      return true
    } catch { return false }
  }
}

export function freshnessFor(dataset: DatasetName, updatedAt: string | null, now = Date.now()): FreshnessState {
  if (!updatedAt) return 'N/D'
  const t = new Date(updatedAt).getTime(); if (!Number.isFinite(t)) return 'N/D'
  const hours = Math.max(0, (now - t) / 3_600_000)
  if (hours > staleHours[dataset]) return 'STALE'; if (hours < 1) return 'LIVE'; if (hours < 24) return 'OGGI'; if (hours < 48) return '1g'; return '3g'
}

export function loadManifest(): UpdateManifest {
  try { const raw = localStorage.getItem(MANIFEST_KEY); return raw ? { ...DEFAULT_MANIFEST, ...JSON.parse(raw) } : DEFAULT_MANIFEST } catch { return DEFAULT_MANIFEST }
}

export class UpdateManager {
  private dataManager: DataManager
  constructor(dataManager: DataManager) { this.dataManager = dataManager }

  async loadManifestFromUrl(url = '/data/update_manifest.json') {
    try {
      const response = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store', headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' } })
      if (!response.ok) throw new Error(`Manifest HTTP ${response.status}`)
      const manifest = await response.json() as UpdateManifest
      if (manifest.schemaVersion !== '2.0' || manifest.season !== '2026-27') throw new Error('Manifest incompatibile')
      try { this.dataManager.setManifest(manifest) } catch { /* non bloccare app per una cache */ }
      safeCacheWrite(MANIFEST_KEY, manifest)
      return manifest
    } catch { return loadManifest() }
  }

  applyLegacyPayload(payload: LegacyUpdatePayload) {
    if (!payload || !Array.isArray(payload.players) || typeof payload.generatedAt !== 'string') throw new Error('Pacchetto dati non valido.')

    // NIENTE backup automatico dell'intero dataset: su Safari/iPhone può saturare localStorage.
    // I dati utente restano separati e non vengono toccati.
    let previous: SourcePlayerData[] = []
    try { previous = structuredClone(this.dataManager.getSourcePlayers()) } catch { previous = [] }

    const next = this.dataManager.mergeLegacyUpdates(payload.players, payload.sourceLabel, payload.generatedAt)
    const changes = compareDatasets(previous, next).slice(0, 100)
    safeCacheWrite(CHANGES_KEY, changes)

    const manifest = payload.manifest ?? loadManifest()
    manifest.updatedAt = payload.generatedAt
    for (const dataset of ['players', 'fantacalcio', 'stats', 'injuries'] as DatasetName[]) {
      manifest.datasets[dataset] = { updatedAt: payload.generatedAt, source: payload.sourceLabel ?? 'UPDATE_FEED' }
    }
    try { this.dataManager.setManifest(manifest) } catch { /* cache non essenziale */ }
    safeCacheWrite(MANIFEST_KEY, manifest)
    return { next, changes, manifest }
  }

  getLastChanges(): DataChange[] {
    try { const raw = localStorage.getItem(CHANGES_KEY); return raw ? JSON.parse(raw) as DataChange[] : [] } catch { return [] }
  }
}