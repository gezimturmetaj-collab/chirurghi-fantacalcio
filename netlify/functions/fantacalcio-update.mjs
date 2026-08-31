const QUOTATIONS_URL = 'https://www.fantacalcio.it/quotazioni-fantacalcio'
const INJURIES_URL = 'https://www.fantacalcio.it/indisponibili-serie-a'
const STATS_URL = 'https://www.fantacalcio.it/statistiche-serie-a/2026-27/italia'

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
  VEN: 'Venezia',
}

function clean(value = '') {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeName(value = '') {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘`]/g, "'")
    .toLowerCase()
    .replace(/[^a-z0-9.' -]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseNumber(value) {
  const number = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(number) ? number : null
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (compatible; ChirurghiFantacalcio/1.0; +Netlify)',
      accept: 'text/html,application/xhtml+xml',
      'accept-language': 'it-IT,it;q=0.9,en;q=0.6',
    },
  })

  if (!response.ok) {
    throw new Error(`Fonte non disponibile: ${response.status} ${url}`)
  }

  return response.text()
}

function parseQuotationRows(html) {
  const rows = []

  // Fantacalcio renders the quotations in table rows. We extract text first,
  // then identify a team code followed by QI, QA and FVM values.
  const trMatches = html.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? []

  for (const tr of trMatches) {
    const cells = [...tr.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((match) => clean(match[1]))
      .filter(Boolean)

    if (cells.length < 5) continue

    const teamIndex = cells.findIndex((cell) => TEAM_CODES[cell.toUpperCase()])
    if (teamIndex < 1) continue

    const teamCode = cells[teamIndex].toUpperCase()
    const numericAfter = cells
      .slice(teamIndex + 1)
      .map(parseNumber)
      .filter((value) => value !== null)

    if (numericAfter.length < 3) continue

    // The nearest textual cell before the team is the displayed player name.
    let name = ''
    for (let i = teamIndex - 1; i >= 0; i -= 1) {
      if (cells[i] && !/^\d+(?:[.,]\d+)?$/.test(cells[i])) {
        name = cells[i]
        break
      }
    }

    if (!name) continue

    const quotation = numericAfter[1] ?? numericAfter[0]
    const fvm = numericAfter[2] ?? null

    rows.push({
      name,
      team: TEAM_CODES[teamCode],
      quotation,
      fvm,
    })
  }

  // De-duplicate same name/team if page contains Classic + Mantra representations.
  const unique = new Map()
  for (const row of rows) {
    unique.set(`${normalizeName(row.name)}|${row.team}`, row)
  }

  return [...unique.values()]
}

function parseStatsRows(html) {
  const rows = []
  const trMatches = html.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? []
  for (const tr of trMatches) {
    const cells = [...tr.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((match) => clean(match[1]))
      .filter(Boolean)
    if (cells.length < 8) continue
    const teamIndex = cells.findIndex((cell) => TEAM_CODES[cell.toUpperCase()])
    if (teamIndex < 1) continue
    let name = ''
    for (let i = teamIndex - 1; i >= 0; i -= 1) {
      if (cells[i] && !/^\d+(?:[.,]\d+)?$/.test(cells[i])) { name = cells[i]; break }
    }
    if (!name) continue
    const after = cells.slice(teamIndex + 1)
    const appearances = parseNumber(after[0])
    const averageRating = parseNumber(after[1])
    const fantasyAverage = parseNumber(after[2])
    const goals = parseNumber(after[3])
    const assists = parseNumber(after[7])
    rows.push({ name, team: TEAM_CODES[cells[teamIndex].toUpperCase()], appearances, averageRating, fantasyAverage, goals, assists })
  }
  const unique = new Map()
  for (const row of rows) unique.set(`${normalizeName(row.name)}|${row.team}`, row)
  return [...unique.values()]
}

function decodeEntities(value = '') {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&agrave;/gi, 'à')
    .replace(/&egrave;/gi, 'è')
    .replace(/&igrave;/gi, 'ì')
    .replace(/&ograve;/gi, 'ò')
    .replace(/&ugrave;/gi, 'ù')
}

function visibleLines(html) {
  return decodeEntities(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|div|li|h1|h2|h3|h4|section|article|tr|td)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function injuryHintsFromPage(html, quotationRows) {
  const lines = visibleLines(html)
  const byNormalized = new Map()

  for (const row of quotationRows) {
    const key = normalizeName(row.name)
    if (!key) continue
    byNormalized.set(key, row)
  }

  const hints = []
  const seen = new Set()

  for (let i = 0; i < lines.length; i += 1) {
    const candidate = normalizeName(lines[i])
    const row = byNormalized.get(candidate)
    if (!row) continue

    let detail = ''
    for (let j = i + 1; j < Math.min(lines.length, i + 7); j += 1) {
      const line = lines[j]
      if (byNormalized.has(normalizeName(line))) break
      if (/^(atalanta|bologna|cagliari|como|fiorentina|frosinone|genoa|inter|juventus|lazio|lecce|milan|monza|napoli|parma|roma|sassuolo|torino|udinese|venezia)$/i.test(line)) break
      if (/^(infortunati serie a|prossimo turno|home|news)$/i.test(line)) continue
      detail = detail ? `${detail} ${line}` : line
      if (detail.length >= 90) break
    }

    detail = clean(detail).slice(0, 420)
    if (detail.length < 8) continue

    const uniqueKey = `${candidate}|${row.team}`
    if (seen.has(uniqueKey)) continue
    seen.add(uniqueKey)

    hints.push({ name: row.name, team: row.team, detail })
  }

  return hints
}

function recoveryFromDetail(detail = '') {
  const lower = detail.toLowerCase()

  const phrases = [
    /rientro[^,.]{0,80}/i,
    /recuper[^,.]{0,80}/i,
    /torna[^,.]{0,80}/i,
    /tornare[^,.]{0,80}/i,
    /da inizio [a-zà-ù]+/i,
    /da metà [a-zà-ù]+/i,
    /da fine [a-zà-ù]+/i,
  ]

  for (const pattern of phrases) {
    const match = detail.match(pattern)
    if (match) return clean(match[0])
  }

  if (lower.includes('indefinit')) return 'Rientro indefinito'
  return null
}

function matchInjury(name, team, injuryHints) {
  const target = normalizeName(name)
  if (!target) return null

  return (
    injuryHints.find(
      (item) => normalizeName(item.name) === target && (!item.team || item.team === team)
    ) ??
    injuryHints.find((item) => {
      const candidate = normalizeName(item.name)
      return candidate.length >= 4 &&
        (target.includes(candidate) || candidate.includes(target)) &&
        (!item.team || item.team === team)
    }) ??
    null
  )
}

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'Content-Type, Accept, Cache-Control',
}

export default async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'content-type': 'application/json; charset=utf-8' },
    })
  }

  try {
    const [quotationsResult, injuriesResult, statsResult] = await Promise.allSettled([
      fetchHtml(QUOTATIONS_URL),
      fetchHtml(INJURIES_URL),
      fetchHtml(STATS_URL),
    ])

    if (quotationsResult.status !== 'fulfilled') {
      throw new Error('Fonte quotazioni non disponibile.')
    }

    const quotations = parseQuotationRows(quotationsResult.value)
    const injuries =
      injuriesResult.status === 'fulfilled'
        ? injuryHintsFromPage(injuriesResult.value, quotations)
        : []
    const statsRows =
      statsResult.status === 'fulfilled'
        ? parseStatsRows(statsResult.value)
        : []
    const statsByKey = new Map(statsRows.map((row) => [`${normalizeName(row.name)}|${row.team}`, row]))

    if (quotations.length < 100) {
      throw new Error(
        `Parsing quotazioni incompleto: trovati solo ${quotations.length} giocatori. Nessun dato locale verrà sovrascritto.`
      )
    }

    const generatedAt = new Date().toISOString()

    const players = quotations.map((row) => {
      const injury = matchInjury(row.name, row.team, injuries)
      const stats = statsByKey.get(`${normalizeName(row.name)}|${row.team}`)

      return {
        playerKey: `${row.name}|${row.team}`,
        name: row.name,
        team: row.team,
        quotation: row.quotation,
        fvm: row.fvm,
        appearances: stats?.appearances ?? null,
        averageRating: stats?.averageRating ?? null,
        fantasyAverage: stats?.fantasyAverage ?? null,
        goals: stats?.goals ?? null,
        assists: stats?.assists ?? null,
        injury: injury?.detail ?? null,
        injuryStatus: injury ? 'injured' : null,
        recoveryTime: injury ? recoveryFromDetail(injury.detail) : null,
        lastUpdated: generatedAt,
      }
    })

    return new Response(
      JSON.stringify({
        version: `live-${generatedAt.slice(0, 10)}`,
        generatedAt,
        sourceLabel: 'Fantacalcio.it · live (quotazioni + statistiche + infortuni)',
        players,
        changes: [],
        diagnostics: {
          quotationPlayers: quotations.length,
          statsPlayers: statsRows.length,
          injuryHints: injuries.length,
          injuriesSourceOk: injuriesResult.status === 'fulfilled',
          statsSourceOk: statsResult.status === 'fulfilled',
        },
      }),
      {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store, max-age=0',
        },
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : 'Aggiornamento non disponibile.',
      }),
      {
        status: 503,
        headers: {
          ...CORS_HEADERS,
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store, max-age=0',
        },
      }
    )
  }
}