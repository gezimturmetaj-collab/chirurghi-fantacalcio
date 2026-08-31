import type { DataChange, DataChangeSeverity, SourcePlayerData } from '../data/schema'

function pctDelta(oldValue: number, newValue: number) {
  if (oldValue === 0) return newValue === 0 ? 0 : 100
  return Math.abs((newValue - oldValue) / oldValue) * 100
}

function severityFor(field: string, oldValue: unknown, newValue: unknown): DataChangeSeverity {
  if (field === 'identity.team' || field === 'fantasy.classicRole') return field === 'fantasy.classicRole' ? 'CRITICAL' : 'HIGH'
  if (field === 'availability.injuryStatus' && newValue === 'OUT') return 'CRITICAL'
  if (field === 'availability.starterProbability' && typeof oldValue === 'number' && typeof newValue === 'number') {
    return Math.abs(newValue - oldValue) >= 20 ? 'HIGH' : 'MEDIUM'
  }
  if ((field === 'fantasy.fvmClassic1000' || field === 'fantasy.qaClassic') && typeof oldValue === 'number' && typeof newValue === 'number') {
    const delta = pctDelta(oldValue, newValue)
    if (delta > 15) return 'HIGH'
    if (delta >= 5) return 'MEDIUM'
  }
  return 'LOW'
}

export function compareDatasets(oldData: SourcePlayerData[], newData: SourcePlayerData[]): DataChange[] {
  const oldMap = new Map(oldData.map((p) => [p.identity.id, p]))
  const now = new Date().toISOString()
  const changes: DataChange[] = []

  for (const next of newData) {
    const prev = oldMap.get(next.identity.id)
    if (!prev) {
      changes.push({
        playerId: next.identity.id,
        playerName: next.identity.displayName,
        severity: 'CRITICAL',
        field: 'player',
        oldValue: null,
        newValue: 'NEW_PLAYER',
        detectedAt: now,
      })
      continue
    }

    const checks: Array<[string, unknown, unknown]> = [
      ['identity.team', prev.identity.team, next.identity.team],
      ['fantasy.classicRole', prev.fantasy.classicRole, next.fantasy.classicRole],
      ['fantasy.qaClassic', prev.fantasy.qaClassic, next.fantasy.qaClassic],
      ['fantasy.fvmClassic1000', prev.fantasy.fvmClassic1000, next.fantasy.fvmClassic1000],
      ['availability.starterProbability', prev.availability.starterProbability, next.availability.starterProbability],
      ['availability.injuryStatus', prev.availability.injuryStatus, next.availability.injuryStatus],
      ['market.transferRisk', prev.market.transferRisk, next.market.transferRisk],
    ]

    for (const [field, oldValue, newValue] of checks) {
      if (JSON.stringify(oldValue ?? null) === JSON.stringify(newValue ?? null)) continue
      changes.push({
        playerId: next.identity.id,
        playerName: next.identity.displayName,
        severity: severityFor(field, oldValue, newValue),
        field,
        oldValue: oldValue ?? null,
        newValue: newValue ?? null,
        detectedAt: now,
      })
    }
  }

  return changes.sort((a, b) => {
    const rank = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }
    return rank[b.severity] - rank[a.severity]
  })
}