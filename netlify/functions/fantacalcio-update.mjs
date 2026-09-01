const QUOTATIONS_URL = 'https://www.fantacalcio.it/quotazioni-fantacalcio'
const STATS_URL = 'https://www.fantacalcio.it/statistiche-serie-a/2026-27/italia'
const INJURIES_URL = 'https://www.fantacalcio.it/indisponibili-serie-a'

const TEAM_CODES = {
  ATA: 'Atalanta',
  BOL: 'Bologna',
  CAG: 'Cagliari',
  COM: 'Como',
  FIO: 'Fiorentina',
  FRO: 'Frosinone',
  GEN: 'Genoa',
  INT: 'Inter',
  JUV: 'Juventus',
  LAZ: 'Lazio',
  LEC: 'Lecce',
  MIL: 'Milan',
  MON: 'Monza',
  NAP: 'Napoli',
  PAR: 'Parma',
  ROM: 'Roma',
  SAS: 'Sassuolo',
  TOR: 'Torino',
  UDI: 'Udinese',
  VEN: 'Venezia'
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&agrave;/gi, 'Ã ')
    .replace(/&egrave;/gi, 'Ã¨')
    .replace(/&eacute;/gi, 'Ã©')
    .replace(/&igrave;/gi, 'Ã¬')
    .replace(/&ograve;/gi, 'Ã²')
    .replace(/&ugrave;/gi, 'Ã¹')
}

function clean(value) {
  return decodeHtml(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeName(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9.' -]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function toNumber(value) {
  const text = String(value ?? '').trim().replace(',', '.')
  if (!text || text === '-' || text.toLowerCase() === 'n.d.') return null
  const n = Number(text)
  return Number.isFinite(n) ? n : null
}

async function fetchHtml(url) {
  let lastError = null

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 12000)

      const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`, {
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'it-IT,it;q=0.9,en;q=0.6',
          'cache-control': 'no-cache',
          pragma: 'no-cache'
        },
        redirect: 'follow',
        signal: controller.signal
      })
      clearTimeout(timer)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const html = await response.text()
      if (html.length < 1000) throw new Error('risposta HTML troppo corta')
      return html
    } catch (error) {
      lastError = error
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 350 * attempt))
    }
  }

  throw new Error(`Fonte non disponibile: ${url} (${lastError instanceof Error ? lastError.message : 'errore di rete'})`)
}

function getCells(tr) {
  return Array.from(tr.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi))
    .map((m) => clean(m[1]))
}

function parseQuotationRows(html) {
  const rows = []
  const trMatches = html.match(/<tr\b[\s\S]*?<\/tr>/gi) || []

  for (const tr of trMatches) {
    const cells = getCells(tr)
    if (cells.length < 5) continue

    const teamIndex = cells.findIndex((cell) => TEAM_CODES[cell.toUpperCase()])
    if (teamIndex < 1) continue

    const teamCode = cells[teamIndex].toUpperCase()
    const name = cells.slice(0, teamIndex).reverse().find((cell) =>
      cell && !/^\d+(?:[.,]\d+)?$/.test(cell)
    )
    if (!name) continue

    const numeric = cells.slice(teamIndex + 1).map(toNumber).filter((v) => v !== null)
    if (numeric.length < 2) continue

    // Fantacalcio espone QI, QA, FVM; in caso di doppia visualizzazione
    // i primi tre valori numerici sono sufficienti.
    rows.push({
      name,
      team: TEAM_CODES[teamCode],
      quotation: numeric[1] ?? numeric[0] ?? null,
      fvm: numeric[2] ?? null
    })
  }

  const unique = new Map()
  rows.forEach((row) => unique.set(`${normalizeName(row.name)}|${row.team}`, row))
  return Array.from(unique.values())
}

function parseStatRows(html) {
  const rows = []
  const trMatches = html.match(/<tr\b[\s\S]*?<\/tr>/gi) || []

  for (const tr of trMatches) {
    const cells = getCells(tr)
    if (cells.length < 9) continue

    const teamIndex = cells.findIndex((cell) => TEAM_CODES[cell.toUpperCase()])
    if (teamIndex < 1) continue

    const teamCode = cells[teamIndex].toUpperCase()
    const name = cells.slice(0, teamIndex).reverse().find((cell) =>
      cell && !/^\d+(?:[.,]\d+)?$/.test(cell)
    )
    if (!name) continue

    // Dopo la squadra: PV, MV, FM, Gol, GS, Rig, RP, Ass, Amm, Esp
    const data = cells.slice(teamIndex + 1)
    if (data.length < 8) continue

    const rigText = data[5] || ''
    const rigParts = rigText.split('/').map((x) => toNumber(x.trim()))

    rows.push({
      name,
      team: TEAM_CODES[teamCode],
      appearances: toNumber(data[0]),
      averageRating: toNumber(data[1]),
      fantasyAverage: toNumber(data[2]),
      goals: toNumber(data[3]),
      goalsConceded: toNumber(data[4]),
      penaltiesScored: rigParts[0] ?? null,
      penaltiesTaken: rigParts[1] ?? null,
      penaltiesSaved: toNumber(data[6]),
      assists: toNumber(data[7]),
      yellowCards: toNumber(data[8]),
      redCards: toNumber(data[9])
    })
  }

  const unique = new Map()
  rows.forEach((row) => unique.set(`${normalizeName(row.name)}|${row.team}`, row))
  return Array.from(unique.values())
}

function textWithLines(html) {
  return decodeHtml(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|li|div|section|article|h1|h2|h3|h4|h5|tr)>/gi, '\n')
      .replace(/<[^>]*>/g, ' ')
  )
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
}

function isSectionHeader(line) {
  return /^(Infortunati|Squalificati|Diffidati|Nessuno|Indisponibili Serie A)$/i.test(line)
}

function looksLikePlayerName(line) {
  if (!line || line.length < 2 || line.length > 48) return false
  if (isSectionHeader(line)) return false
  if (/^(atalanta|bologna|cagliari|como|fiorentina|frosinone|genoa|inter|juventus|lazio|lecce|milan|monza|napoli|parma|roma|sassuolo|torino|udinese|venezia)$/i.test(line)) return false
  if (/[.!?:;]/.test(line)) return false
  return /^[A-ZÃ€-Ãœ][A-Za-zÃ€-Ã¿' .-]+$/.test(line)
}

function parseUnavailable(html) {
  const lines = textWithLines(html)
  const result = []
  let section = null

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]

    if (/^Infortunati$/i.test(line)) {
      section = 'injured'
      continue
    }
    if (/^Squalificati$/i.test(line)) {
      section = 'suspended'
      continue
    }
    if (/^Diffidati$/i.test(line)) {
      section = null
      continue
    }
    if (!section || /^Nessuno$/i.test(line)) continue
    if (!looksLikePlayerName(line)) continue

    const detailParts = []
    for (let j = i + 1; j < Math.min(lines.length, i + 6); j += 1) {
      if (isSectionHeader(lines[j]) || looksLikePlayerName(lines[j])) break
      detailParts.push(lines[j])
      if (detailParts.join(' ').length >= 380) break
    }

    const detail = detailParts.join(' ').trim() || null
    result.push({
      name: line,
      status: section,
      detail
    })
  }

  const unique = new Map()
  result.forEach((item) => unique.set(normalizeName(item.name), item))
  return Array.from(unique.values())
}

function recoveryTime(detail) {
  if (!detail) return null
  const patterns = [
    /recuperabile[^,.]{0,100}/i,
    /rientro[^,.]{0,100}/i,
    /tornare[^,.]{0,100}/i,
    /torna[^,.]{0,100}/i,
    /da inizio[^,.]{0,80}/i,
    /dalla seconda metÃ [^,.]{0,80}/i,
    /tempi di recupero[^,.]{0,100}/i
  ]
  for (const pattern of patterns) {
    const match = detail.match(pattern)
    if (match) return clean(match[0])
  }
  return null
}

function findByNameAndTeam(rows, name, team) {
  const target = normalizeName(name)
  return (
    rows.find((row) => normalizeName(row.name) === target && (!row.team || row.team === team)) ||
    rows.find((row) => normalizeName(row.name) === target) ||
    null
  )
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, OPTIONS',
        'access-control-allow-headers': 'Content-Type, Accept, Cache-Control'
      }
    })
  }

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    })
  }

  try {
    const settled = await Promise.allSettled([
      fetchHtml(QUOTATIONS_URL),
      fetchHtml(STATS_URL),
      fetchHtml(INJURIES_URL)
    ])

    if (settled[0].status !== 'fulfilled') {
      throw settled[0].reason
    }

    const quotationHtml = settled[0].value
    const statsHtml = settled[1].status === 'fulfilled' ? settled[1].value : ''
    const injuriesHtml = settled[2].status === 'fulfilled' ? settled[2].value : ''

    const quotations = parseQuotationRows(quotationHtml)
    const stats = statsHtml ? parseStatRows(statsHtml) : []
    const unavailable = injuriesHtml ? parseUnavailable(injuriesHtml) : []

    if (quotations.length < 100) {
      throw new Error(
        `Parsing quotazioni incompleto: trovati solo ${quotations.length} giocatori. Nessun dato locale Ã¨ stato sovrascritto.`
      )
    }

    const generatedAt = new Date().toISOString()

    const players = quotations.map((row) => {
      const stat = findByNameAndTeam(stats, row.name, row.team)
      const unavail = findByNameAndTeam(unavailable, row.name, row.team)

      return {
        playerKey: `${row.name}|${row.team}`,
        name: row.name,
        team: row.team,
        quotation: row.quotation,
        fvm: row.fvm,

        appearances: stat?.appearances ?? null,
        averageRating: stat?.averageRating ?? null,
        fantasyAverage: stat?.fantasyAverage ?? null,
        goals: stat?.goals ?? null,
        assists: stat?.assists ?? null,
        goalsConceded: stat?.goalsConceded ?? null,
        penaltiesScored: stat?.penaltiesScored ?? null,
        penaltiesTaken: stat?.penaltiesTaken ?? null,
        penaltiesSaved: stat?.penaltiesSaved ?? null,
        yellowCards: stat?.yellowCards ?? null,
        redCards: stat?.redCards ?? null,

        injury: unavail?.detail ?? null,
        injuryStatus: unavail?.status ?? null,
        recoveryTime: unavail ? recoveryTime(unavail.detail) : null,
        expectedReturn: unavail ? recoveryTime(unavail.detail) : null,

        sourceUpdatedAt: generatedAt,
        lastUpdated: generatedAt
      }
    })

    const matchedStats = players.filter((p) => p.appearances !== null).length
    const matchedUnavailable = players.filter((p) => p.injuryStatus !== null).length

    const payload = {
      version: `live-${generatedAt}`,
      generatedAt,
      sourceLabel: 'Fantacalcio.it Â· Quotazioni + Statistiche 2026/27 + Indisponibili',
      players,
      changes: [],
      diagnostics: {
        quotationPlayers: quotations.length,
        statsRows: stats.length,
        matchedStats,
        unavailableRows: unavailable.length,
        matchedUnavailable,
        statsSourceOk: settled[1].status === 'fulfilled',
        injuriesSourceOk: settled[2].status === 'fulfilled'
      }
    }

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store, max-age=0',
        'access-control-allow-origin': '*'
      }
    })
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Aggiornamento non disponibile.'
      }),
      {
        status: 503,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store, max-age=0',
          'access-control-allow-origin': '*'
        }
      }
    )
  }
}