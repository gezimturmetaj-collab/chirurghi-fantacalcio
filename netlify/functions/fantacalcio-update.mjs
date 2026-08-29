const QUOTATIONS_URL = 'https://www.fantacalcio.it/quotazioni-fantacalcio'
const FORMATIONS_URL = 'https://www.fantacalcio.it/probabili-formazioni-serie-a'

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

function clean(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
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
  const n = Number(String(value || '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 ChirurghiFantacalcio Netlify',
      accept: 'text/html,application/xhtml+xml',
      'accept-language': 'it-IT,it;q=0.9'
    }
  })

  if (!response.ok) {
    throw new Error('Fonte non disponibile: ' + response.status + ' ' + url)
  }

  return response.text()
}

function parseQuotationRows(html) {
  const rows = []
  const trMatches = html.match(/<tr\b[\s\S]*?<\/tr>/gi) || []

  for (const tr of trMatches) {
    const cellMatches = Array.from(
      tr.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)
    )

    const cells = cellMatches
      .map(function (match) {
        return clean(match[1])
      })
      .filter(Boolean)

    if (cells.length < 5) continue

    const teamIndex = cells.findIndex(function (cell) {
      return Boolean(TEAM_CODES[cell.toUpperCase()])
    })

    if (teamIndex < 1) continue

    const teamCode = cells[teamIndex].toUpperCase()
    const numbers = cells
      .slice(teamIndex + 1)
      .map(toNumber)
      .filter(function (value) {
        return value !== null
      })

    if (numbers.length < 3) continue

    let name = ''

    for (let i = teamIndex - 1; i >= 0; i -= 1) {
      if (cells[i] && !/^\d+(?:[.,]\d+)?$/.test(cells[i])) {
        name = cells[i]
        break
      }
    }

    if (!name) continue

    rows.push({
      name: name,
      team: TEAM_CODES[teamCode],
      quotation: numbers[1] !== undefined ? numbers[1] : numbers[0],
      fvm: numbers[2] !== undefined ? numbers[2] : null
    })
  }

  const unique = new Map()

  rows.forEach(function (row) {
    unique.set(normalizeName(row.name) + '|' + row.team, row)
  })

  return Array.from(unique.values())
}

function visibleText(html) {
  return clean(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<\/(?:p|div|li|h1|h2|h3|h4|section|article|tr)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
  )
}

function injuryHints(html) {
  const text = visibleText(html)
  const chunks = text.split(/\bInfortunati\b/i).slice(1)
  const result = []

  chunks.forEach(function (chunk) {
    const lines = chunk
      .slice(0, 1800)
      .split(/\s{2,}|\n+/)
      .map(function (line) {
        return line.trim()
      })
      .filter(Boolean)

    for (let i = 0; i < lines.length - 1; i += 1) {
      const name = lines[i]
      const detail = lines[i + 1]

      if (
        name.length >= 2 &&
        name.length <= 45 &&
        detail.length >= 8 &&
        detail.length <= 350 &&
        !/^(nessun|squalificati|diffidati|in dubbio|ballottaggi)/i.test(name)
      ) {
        result.push({ name: name, detail: detail })
      }
    }
  })

  return result
}

function findInjury(name, hints) {
  const target = normalizeName(name)

  return (
    hints.find(function (item) {
      return normalizeName(item.name) === target
    }) || null
  )
}

function recoveryTime(detail) {
  if (!detail) return null

  const patterns = [
    /rientro[^,.]{0,80}/i,
    /recuper[^,.]{0,80}/i,
    /torna[^,.]{0,80}/i,
    /tornare[^,.]{0,80}/i
  ]

  for (const pattern of patterns) {
    const match = detail.match(pattern)
    if (match) return clean(match[0])
  }

  return null
}

export default async function handler(request) {
  if (request.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      {
        status: 405,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      }
    )
  }

  try {
    const results = await Promise.all([
      fetchHtml(QUOTATIONS_URL),
      fetchHtml(FORMATIONS_URL)
    ])

    const quotations = parseQuotationRows(results[0])
    const hints = injuryHints(results[1])

    if (quotations.length < 100) {
      throw new Error(
        'Parsing quotazioni incompleto: trovati solo ' +
          quotations.length +
          ' giocatori. Nessun dato locale verra sovrascritto.'
      )
    }

    const generatedAt = new Date().toISOString()

    const players = quotations.map(function (row) {
      const injury = findInjury(row.name, hints)

      return {
        playerKey: row.name + '|' + row.team,
        name: row.name,
        team: row.team,
        quotation: row.quotation,
        fvm: row.fvm,
        injury: injury ? injury.detail : null,
        injuryStatus: injury ? 'injured' : null,
        recoveryTime: injury ? recoveryTime(injury.detail) : null,
        lastUpdated: generatedAt
      }
    })

    const payload = {
      version: 'live-' + generatedAt.slice(0, 10),
      generatedAt: generatedAt,
      sourceLabel: 'Fantacalcio.it live',
      players: players,
      changes: [],
      diagnostics: {
        quotationPlayers: quotations.length,
        injuryHints: hints.length
      }
    }

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store, max-age=0'
      }
    })
  } catch (error) {
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : 'Aggiornamento non disponibile.'
      }),
      {
        status: 503,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store, max-age=0'
        }
      }
    )
  }
}