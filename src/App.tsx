import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { players, type Player as BasePlayer, type Role } from './data/players'

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
type ViewMode = 'war' | 'live' | 'myteam' | 'rivals' | 'history' | 'squad' | 'report' | 'ranking' | 'settings' | 'more'
type Strategy = 'balanced' | 'aggressive' | 'value' | 'patient' | 'stars' | 'free'
type SuggestionMode = 'target' | 'bet' | 'decoy'
type SuggestionCategory = 'top' | 'starter' | 'bet' | 'low' | 'decoy'

type WishlistItem = {
  playerKey: string
  priority: number
  comment?: string
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
const UPDATE_ENDPOINT = '/data/fantacalcio-update.json'

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

  const initials = player.name
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const width = card ? Math.round(size * 0.72) : size
  const height = card ? size : size

  if (!id || failed) {
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
      src={`https://content.fantacalcio.it/web/campioncini/21/card/${id}.png`}
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
    --app-bg: #070b14;
    --app-bg-2: #0b1220;
    --surface: rgba(17, 25, 40, .92);
    --surface-2: rgba(22, 32, 50, .88);
    --surface-3: #121c2d;
    --line: rgba(148, 163, 184, .14);
    --line-strong: rgba(148, 163, 184, .24);
    --text: #f8fafc;
    --muted: #8b9ab0;
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
      linear-gradient(180deg, #080d17 0%, #070b14 45%, #060910 100%);
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
      linear-gradient(145deg, rgba(18,29,48,.96), rgba(11,17,29,.98)) !important;
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
    background: linear-gradient(145deg, rgba(17,25,40,.93), rgba(12,18,30,.96)) !important;
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
     PASSO 39 — OBSIDIAN / ICE UI
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

`

function App() {
  const saved = useMemo(() => loadSavedAuction(), [])

  const [view, setView] = useState<ViewMode>('war')
  const [setupComplete, setSetupComplete] = useState(saved.setupComplete ?? false)
  const [leagueSize, setLeagueSize] = useState<LeagueSize>(saved.leagueSize ?? 10)
  const [startingBudget, setStartingBudget] = useState<StartingBudget>(saved.startingBudget ?? 500)
  const [budget, setBudget] = useState(saved.budget ?? saved.startingBudget ?? 500)
  const [strategy, setStrategy] = useState<Strategy>(saved.strategy ?? 'balanced')
  const [suggestionMode, setSuggestionMode] = useState<SuggestionMode>(saved.suggestionMode ?? 'target')
  const [suggestionRole, setSuggestionRole] = useState<'ALL' | Role>('ALL')
  const [suggestionCategory, setSuggestionCategory] = useState<SuggestionCategory | null>(null)
  const [strategyDetailsOpen, setStrategyDetailsOpen] = useState(false)
  const [squadReportOpen, setSquadReportOpen] = useState(false)
  const [warRosterOpen, setWarRosterOpen] = useState(false)
  const [alertsOpen, setAlertsOpen] = useState(false)
  const [comparisonOpen, setComparisonOpen] = useState(false)
  const [expandedSuggestionKey, setExpandedSuggestionKey] = useState<string | null>(null)
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
  const [warRoleChosen, setWarRoleChosen] = useState(false)
  const [warCallChosen, setWarCallChosen] = useState(false)
  const [selectedName, setSelectedName] = useState('')
  const [playerSearch, setPlayerSearch] = useState('')
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
    return Object.values(dataUpdates).find(
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

  function originalRoleRemaining(currentRole: Role) {
    return plannedRoleBudget(currentRole) - spentByRole(currentRole)
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
    const dbMax = scaledDbMax(player) * strategyMaxMultiplier(player)
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

  function betReason(player: Player) {
    const market = getMarket(player)
    const fit = getFit(player) ?? 0
    if (isNewToSerieA(player))
      return 'Nuovo in Serie A: profilo ad alto rischio/potenziale'
    if (market <= startingBudget * 0.012 && fit >= 75)
      return 'Low-cost con potenziale molto interessante'
    if (market <= startingBudget * 0.02 && fit >= 65)
      return 'Costo ridotto e buon margine di crescita'
    if (market <= startingBudget * 0.035)
      return 'Scommessa economica con rischio controllato'
    return 'Profilo di upside da valutare solo a prezzo basso'
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

  function decoyReason(player: Player) {
    const demand = activeRivals.filter((_, rivalId) =>
      rivalNeedsRole(rivalId, player.role)
    ).length
    const target = calculateTargetScore(player)

    if (demand >= 4 && target < 75) {
      return 'Molto appetibile ai rivali, ma non prioritario per la tua strategia'
    }

    if (tierScore(player) >= 82 && target < 82) {
      return 'Nome forte: può spingere gli avversari a spendere'
    }

    if (demand >= 2) {
      return 'Buona esca: diversi rivali hanno ancora bisogno del ruolo'
    }

    return 'Esca situazionale: chiamala solo se vuoi muovere il budget dei rivali'
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

  const auctionMoves = roles
    .map((currentRole) => buildRoleMove(currentRole))
    .sort((a, b) => b.urgency - a.urgency)

  const filteredAuctionMoves =
    suggestionRole === 'ALL'
      ? auctionMoves
      : auctionMoves.filter((move) => move.role === suggestionRole)

  const nextAuctionMove =
    filteredAuctionMoves.find((move) => move.urgency > 0) ?? null



  const searchedPlayers = useMemo(() => {
    const search = playerSearch.trim().toLowerCase()
    if (!search) return []
    return availablePlayers
      .filter(
        (player) =>
          player.name.toLowerCase().includes(search) ||
          player.team.toLowerCase().includes(search)
      )
      .slice(0, 18)
  }, [availablePlayers, playerSearch])

  const selectedPlayer =
    availablePlayers.find((player) => player.name === selectedName) ?? null


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

  function playerPro(player: Player) {
    const personalComment = myTeamComment(player)
    const update = dataUpdateFor(player)
    if (personalComment) {
      const base = update?.pro?.trim() || [player.profile, player.traits, player.biddingRule].filter(Boolean).map(String).join(' · ') || 'Profilo da valutare.'
      return `★ MY TEAM: ${personalComment} · ${base}`
    }
    if (update?.pro?.trim()) return update.pro.trim()

    const pieces = [player.profile, player.traits, player.biddingRule]
      .filter(Boolean)
      .map((item) => String(item).trim())
    return pieces[0] || 'Profilo utile se acquistato al prezzo corretto.'
  }

  function playerContra(player: Player) {
    const update = dataUpdateFor(player)
    if (update?.contra?.trim()) return update.contra.trim()
    if (update?.injuryStatus === 'injured') {
      const recovery = update.recoveryTime || update.expectedReturn
      return `Infortunato${update.injury ? `: ${update.injury}` : ''}${recovery ? ` · recupero ${recovery}` : ''}.`
    }
    if (update?.injuryStatus === 'doubt') {
      return `Condizione da monitorare${update.injury ? `: ${update.injury}` : ''}.`
    }
    if (update?.injuryStatus === 'suspended') {
      return 'Indisponibile per squalifica.'
    }
    if (player.note) return player.note
    if (estimatedStarterPct(player) < 60) return 'Titolarità da monitorare: evitare aste aggressive.'
    if (getMarket(player) > calculateDynamicMax(player)) return 'Prezzo di mercato sopra il massimo consigliato.'
    return 'Nessuna criticità forte nel database: resta decisivo il prezzo d’acquisto.'
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

  function categoryReason(player: Player, category: SuggestionCategory) {
    if (strategy === 'free') {
      const pricePct = freeMarketPercentile(player)

      if (category === 'top') {
        return 'TOP FREE: qualità assoluta. Nessun filtro su costo, budget o strategia.'
      }

      if (category === 'starter') {
        return `TITOLARE: ${estimatedStarterPct(player)}% titolarità stimata e costo in fascia media (${pricePct}° percentile del gruppo).`
      }

      if (category === 'bet') {
        return `SCOMMESSA: costo contenuto (${pricePct}° percentile) e potenziale tecnico elevato.`
      }

      if (category === 'low') {
        return `LOW BUDGET: costo tra i più bassi (${pricePct}° percentile) con ${estimatedStarterPct(player)}% di titolarità stimata.`
      }

      return `ESCA: profilo molto appetibile e costoso (${pricePct}° percentile), adatto a generare rilanci degli avversari.`
    }

    if (category === 'top') return 'Qualità assoluta, tier e impatto potenziale sul reparto.'
    if (category === 'starter') return `Titolarità stimata ${estimatedStarterPct(player)}% e profilo affidabile.`
    if (category === 'bet') return betReason(player)
    if (category === 'low') return `Costo sostenibile (${getMarket(player)}) con margine rispetto al MAX LIVE ${calculateDynamicMax(player)}.`
    return decoyReason(player)
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

  function wishlistPriorityBonus(player: Player) {
    const item = wishlistItemFor(player)
    if (!item) return 0

    // Priorità 1 è la più alta. La wishlist orienta i suggerimenti,
    // ma non cancella qualità, categoria e compatibilità con la rosa.
    return Math.max(3, 17 - (Math.max(1, Math.min(20, item.priority)) - 1) * 0.75)
  }

  function specificSuggestionScore(player: Player, category: SuggestionCategory) {
    const base = categoryScore(player, category)
    const analysis = squadSpecificAnalysis(player)
    const wishlistBonus = wishlistPriorityBonus(player)

    // La categoria resta dominante; rosa e MY TEAM riordinano i profili vicini.
    return Math.max(0, Math.min(120, base + analysis.bonus + wishlistBonus))
  }

  function specificSuggestionExplanation(player: Player, category: SuggestionCategory) {
    const analysis = squadSpecificAnalysis(player)
    const reasons = analysis.positives.slice(0, 5)
    const warnings = analysis.cautions.slice(0, 3)
    const wish = wishlistItemFor(player)

    if (wish) {
      reasons.unshift(`È nella tua MY TEAM con priorità ${wish.priority}: il motore lo considera esplicitamente tra i tuoi obiettivi.`)
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

    return `${categoryIntro} ${positiveText}${warningText}`
  }

  function specificSuggestionHeadline(player: Player, category: SuggestionCategory) {
    const analysis = squadSpecificAnalysis(player)

    if (analysis.positives.length > 0) {
      return analysis.positives[0]
    }

    if (analysis.cautions.length > 0) {
      return `Profilo interessante, ma ${analysis.cautions[0].charAt(0).toLowerCase()}${analysis.cautions[0].slice(1)}`
    }

    return categoryReason(player, category)
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
  ])


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

  function myTeamComment(player: Player) {
    return wishlistItemFor(player)?.comment?.trim() || ''
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

  async function runDataUpdate() {
    if (!navigator.onLine) {
      setUpdateStatus('error')
      setUpdateError('Nessuna connessione. L’app continua a usare l’ultimo database salvato sul dispositivo.')
      return
    }

    setUpdateStatus('updating')
    setUpdateError('')
    setUpdateChangesOpen(false)

    try {
      const response = await fetch(`${UPDATE_ENDPOINT}?t=${Date.now()}`, {
        method: 'GET',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      })

      if (!response.ok) {
        throw new Error(`Server aggiornamenti non disponibile (${response.status}).`)
      }

      const payload = (await response.json()) as UpdatePayload

      if (
        !payload ||
        typeof payload.version !== 'string' ||
        typeof payload.generatedAt !== 'string' ||
        !Array.isArray(payload.players)
      ) {
        throw new Error('Il pacchetto ricevuto non è valido.')
      }

      const normalized = payload.players.filter(
        (item) => item && typeof item.playerKey === 'string' && item.playerKey.includes('|')
      )

      const map = Object.fromEntries(normalized.map((item) => [item.playerKey, item]))
      const meta: UpdateMeta = {
        version: payload.version,
        generatedAt: payload.generatedAt,
        downloadedAt: new Date().toISOString(),
        sourceLabel: payload.sourceLabel,
        playerCount: normalized.length,
      }

      localStorage.setItem(DATA_UPDATE_KEY, JSON.stringify(normalized))
      localStorage.setItem(DATA_UPDATE_META_KEY, JSON.stringify(meta))

      setDataUpdates(map)
      setUpdateMeta(meta)
      setUpdateChanges(payload.changes ?? [])
      setUpdateStatus('success')
    } catch (error) {
      setUpdateStatus('error')
      setUpdateError(
        error instanceof Error
          ? error.message
          : 'Aggiornamento non riuscito. Rimane attivo l’ultimo database locale.'
      )
    }
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
    if (updateStatus === 'success') return 'DATI AGGIORNATI'
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

  const totalSpent = purchases.reduce((total, purchase) => total + purchase.price, 0)
  const expectedSpentByNow = roles.reduce(
    (total, currentRole) =>
      total +
      plannedRoleBudget(currentRole) *
        (roleCount(currentRole) / slotLimits[currentRole]),
    0
  )
  const strategyDifference = totalSpent - expectedSpentByNow
  const tolerance = startingBudget * 0.03

  const strategyStatus =
    strategy === 'free'
      ? {
          label: 'BUDGET FREE',
          text: 'Nessun piano strategico condiziona i suggerimenti: il costo viene usato solo per definire TITOLARE, SCOMMESSA, LOW BUDGET ed ESCA.',
          className: 'positive',
        }
      : strategyDifference > tolerance
      ? {
          label: 'RECUPERO',
          text: `Stai spendendo circa ${Math.round(strategyDifference)} crediti più rapidamente del piano.`,
          className: 'danger',
        }
      : strategyDifference < -tolerance
      ? {
          label: 'VANTAGGIO',
          text: `Hai circa ${Math.abs(Math.round(strategyDifference))} crediti di margine rispetto al piano.`,
          className: 'positive',
        }
      : {
          label: 'EQUILIBRIO',
          text: 'La spesa attuale è coerente con la strategia scelta.',
          className: 'neutral',
        }

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

    return {
      afterBudget,
      afterSlots,
      adaptiveAfter,
      roleAveragesAfter,
      nextTargets,
      afterCreditsPerSlot: afterSlots > 0 ? afterBudget / afterSlots : 0,
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

  function undoLastPurchase() {
    if (purchases.length === 0) return
    const last = purchases[purchases.length - 1]
    setPurchases((current) => current.slice(0, -1))
    setBudget((current) => current + last.price)
    setMessage(`Annullato acquisto di ${last.player.name}.`)
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

  function resetWarChoiceFlow() {
    setWarRoleChosen(false)
    setWarCallChosen(false)
    setSuggestionRole('ALL')
    setSuggestionCategory(null)
    setSuggestionMode('target')
    setMessage('')
  }

  function resetSearchEvaluate() {
    setSelectedName('')
    setPlayerSearch('')
    setPrice(1)
    setMessage('')
  }

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

    const confirmed = window.confirm(
      `Annullare l'acquisto di ${purchase.player.name} a ${purchase.price}?`
    )
    if (!confirmed) return

    setPurchases((current) =>
      current.filter((_, purchaseIndex) => purchaseIndex !== index)
    )
    setBudget((current) => current + purchase.price)
    setMessage(`Annullato acquisto: ${purchase.player.name}`)
  }

  function undoRivalPurchase(index: number) {
    const sale = rivalSales[index]
    if (!sale) return

    const rivalName = activeRivals[sale.rivalId] ?? `Rivale ${sale.rivalId + 1}`
    const confirmed = window.confirm(
      `Annullare ${sale.player.name} assegnato a ${rivalName} per ${sale.price}?`
    )
    if (!confirmed) return

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

      <div className="app-nav">
        <button type="button" style={navStyle(view === 'war')} onClick={() => setView('war')}>
          <span>⌂</span><span className="nav-caption">WAR</span>
        </button>
        <button type="button" style={navStyle(view === 'live')} onClick={() => setView('live')}>
          <span>●</span><span className="nav-caption">ASTA</span>
        </button>
        <button type="button" style={navStyle(view === 'myteam')} onClick={() => setView('myteam')}>
          <span>★</span><span className="nav-caption">MY TEAM</span>
        </button>
        <button type="button" style={navStyle(view === 'squad')} onClick={() => setView('squad')}>
          <span>◆</span><span className="nav-caption">ROSA</span>
        </button>
        <button type="button" style={navStyle(view === 'rivals')} onClick={() => setView('rivals')}>
          <span>♟</span><span className="nav-caption">LEGA</span>
        </button>
        <button
          type="button"
          style={navStyle(view === 'more' || view === 'history' || view === 'settings')}
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
          <section
            className="section"
            style={{
              position: 'sticky',
              top: '64px',
              zIndex: 45,
              padding: '10px 11px',
              marginBottom: '10px',
              background: 'rgba(10,13,18,.88)',
              backdropFilter: 'blur(18px)',
              WebkitBackdropFilter: 'blur(18px)',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1.2fr repeat(3,1fr)',
                gap: '6px',
                alignItems: 'stretch',
              }}
            >
              <div className="stat highlight-stat" style={{ textAlign: 'left', paddingLeft: '10px' }}>
                <span>BUDGET RESIDUO</span>
                <strong style={{ fontSize: '23px' }}>{budget}</strong>
              </div>
              <div className="stat">
                <span>ROSA</span>
                <strong>{purchases.length}/25</strong>
              </div>
              <div className="stat">
                <span>SLOT</span>
                <strong>{25 - purchases.length}</strong>
              </div>
              <div className="stat">
                <span>STRATEGIA</span>
                <strong style={{ fontSize: '10px', lineHeight: 1.15 }}>{currentStrategy.name}</strong>
              </div>
            </div>
          </section>

          <section className="section" style={{ padding: '11px 12px' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: '8px',
                alignItems: 'center',
              }}
            >
              <div className="section-title" style={{ marginBottom: 0 }}>LA MIA ROSA
              </div>
              <button
                type="button"
                style={smallChoiceStyle(warRosterOpen)}
                onClick={() => setWarRosterOpen((value) => !value)}
              >
                {warRosterOpen ? 'CHIUDI' : 'VEDI ROSA'}
              </button>
            </div>

            <div className="roster-summary" style={{ marginTop: '9px' }}>
              {roles.map((item) => (
                <div key={`war-roster-${item}`}>
                  <span>{item}</span>
                  <strong>{roleCount(item)}/{slotLimits[item]}</strong>
                  <small>{roleRemaining(item)} liberi</small>
                </div>
              ))}
            </div>

            {warRosterOpen && (
              <div style={{ marginTop: '10px' }}>
                {purchases.length === 0 ? (
                  <div className="main-card">
                    <strong>Rosa ancora vuota</strong>
                    <p className="tip">Gli acquisti compariranno qui durante l’asta.</p>
                  </div>
                ) : (
                  <div className="purchases">
                    {purchases.map((purchase, index) => (
                      <div
                        className="purchase-row"
                        key={`war-purchase-${purchase.player.name}-${index}`}
                      >
                        <span className="purchase-role">{purchase.player.role}</span>
                        <PlayerPhoto player={purchase.player} size={34} />
                        <div className="purchase-player">
                          <strong>{purchase.player.name}</strong>
                          <small>{purchase.player.team}</small>
                        </div>
                        <div className="purchase-price">
                          <small>PREZZO</small>
                          <strong>{purchase.price}</strong>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {purchases.length > 0 && (
                  <button
                    type="button"
                    className="undo-button"
                    onClick={undoLastPurchase}
                  >
                    ↶ ANNULLA ULTIMO ACQUISTO
                  </button>
                )}
              </div>
            )}
          </section>

          <section className="section" style={{ padding: '11px 12px' }}>
            <div className="section-title">STRATEGIA</div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: '8px',
                alignItems: 'end',
              }}
            >
              <div>
                <label style={{ marginTop: 0 }}>ATTIVA</label>
                <select
                  value={strategy}
                  onChange={(event) => setStrategy(event.target.value as Strategy)}
                >
                  {(Object.keys(strategies) as Strategy[]).map((item) => (
                    <option key={`war-strategy-${item}`} value={item}>
                      {strategies[item].name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                style={smallChoiceStyle(strategyDetailsOpen)}
                onClick={() => setStrategyDetailsOpen((value) => !value)}
              >
                {strategyDetailsOpen ? 'CHIUDI' : 'DETTAGLI'}
              </button>
            </div>

            <div
              style={{
                marginTop: '8px',
                display: 'flex',
                justifyContent: 'space-between',
                gap: '8px',
                alignItems: 'center',
              }}
            >
              <small style={{ color: '#7f93ad' }}>
                {strategy === 'free'
                  ? '∞ Nessun vincolo strategico nei suggerimenti'
                  : `P ${plannedRoleBudget('P')} · D ${plannedRoleBudget('D')} · C ${plannedRoleBudget('C')} · A ${plannedRoleBudget('A')}`}
              </small>
              <span className="setup-badge">{strategyStatus.label}</span>
            </div>

            {strategyDetailsOpen && (
              <div style={{ marginTop: '11px' }}>
                <p className="tip">{currentStrategy.description}</p>

                <div style={{ overflowX: 'auto', marginTop: '8px' }}>
                  <div style={{ minWidth: '510px', display: 'grid', gap: '5px' }}>
                    {(Object.keys(strategies) as Strategy[]).map((item) => {
                      const plan = strategies[item]
                      return (
                        <button
                          type="button"
                          key={`strategy-budget-preview-${item}`}
                          onClick={() => setStrategy(item)}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '150px repeat(4,1fr)',
                            gap: '5px',
                            alignItems: 'center',
                            padding: '8px',
                            border: strategy === item ? '1px solid rgba(77,163,255,.45)' : '1px solid rgba(148,163,184,.12)',
                            borderRadius: '11px',
                            background: strategy === item ? 'rgba(77,163,255,.10)' : 'rgba(11,18,31,.6)',
                            color: '#fff',
                            textAlign: 'left',
                            cursor: 'pointer',
                          }}
                        >
                          <strong style={{ fontSize: '8px' }}>{plan.name}</strong>
                          {roles.map((r) => (
                            <span key={`${item}-${r}`} style={{ textAlign: 'center', fontSize: '8px', color: '#9fb0c6' }}>
                              {item === 'free' ? `${r} FREE` : `${r} ${scaleValue(plan.budgets[r])}`}
                            </span>
                          ))}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className={`adaptive-status ${strategyStatus.className}`} style={{ marginTop: '10px' }}>
                  <div>
                    <span>{currentStrategy.name}</span>
                    <strong>{strategyStatus.label}</strong>
                  </div>
                  <p>{strategyStatus.text}</p>
                </div>

                {strategy !== 'free' && (
                  <div className="role-budget-grid" style={{ marginTop: '10px' }}>
                    {roles.map((item) => (
                      <div className="role-budget-card" key={`adaptive-${item}`}>
                        <div className="role-budget-header">
                          <span>{item}</span>
                          <strong>{Math.round(adaptiveRoleBudget(item))}</strong>
                        </div>
                        <div className="role-budget-details">
                          <span>Piano {plannedRoleBudget(item)}</span>
                          <span>Speso {spentByRole(item)}</span>
                        </div>
                        <div className="adaptive-comparison">
                          <div>
                            <span>RESIDUO ORIG.</span>
                            <strong>{Math.round(originalRoleRemaining(item))}</strong>
                          </div>
                          <div>
                            <span>NUOVO BUDGET</span>
                            <strong>{Math.round(adaptiveRoleBudget(item))}</strong>
                          </div>
                        </div>
                        <div className="role-budget-bottom">
                          <span>{roleRemaining(item)} slot</span>
                          <strong>{adaptiveAverage(item).toFixed(1)} cr/slot</strong>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="section" style={{ padding: '11px 12px' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: '8px',
                alignItems: 'center',
              }}
            >
              <div>
                <div className="section-title" style={{ marginBottom: '3px' }}>AVVISI
                </div>
                <strong
                  style={{
                    color: smartAlerts.length === 0 ? '#70d6a1' : '#ffd37a',
                    fontSize: '11px',
                  }}
                >
                  {smartAlerts.length === 0
                    ? '✓ Nessun avviso importante'
                    : `⚠ ${smartAlerts.length} ${smartAlerts.length === 1 ? 'avviso' : 'avvisi'}`}
                </strong>
              </div>

              {smartAlerts.length > 0 && (
                <button
                  type="button"
                  style={smallChoiceStyle(alertsOpen)}
                  onClick={() => setAlertsOpen((value) => !value)}
                >
                  {alertsOpen ? 'CHIUDI' : 'APRI'}
                </button>
              )}
            </div>

            {alertsOpen && smartAlerts.length > 0 && (
              <div style={{ display: 'grid', gap: '8px', marginTop: '10px' }}>
                {smartAlerts.map((alert) => {
                  const appearance = alertAppearance(alert.level)

                  return (
                    <div
                      key={`war-alert-${alert.id}`}
                      className="main-card"
                      style={{
                        border: `1px solid ${appearance.border}`,
                        background: appearance.background,
                      }}
                    >
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '26px 1fr',
                          gap: '8px',
                          alignItems: 'start',
                        }}
                      >
                        <span style={{ fontSize: '17px' }}>{appearance.icon}</span>
                        <div>
                          <strong style={{ color: appearance.color }}>{alert.title}</strong>
                          <p style={{ margin: '4px 0 0', color: '#a8b1c2', fontSize: '9px', lineHeight: 1.55 }}>
                            {alert.text}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <section className="section" style={{ padding: '12px' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: '8px',
                alignItems: 'center',
              }}
            >
              <div className="section-title" style={{ marginBottom: 0 }}>SUGGERIMENTI
              </div>

              {(warRoleChosen || warCallChosen) && (
                <button type="button" style={smallChoiceStyle(false)} onClick={() => {
                  resetWarChoiceFlow()
                  setComparisonOpen(false)
                  setExpandedSuggestionKey(null)
                }}>
                  ↻ RESET
                </button>
              )}
            </div>

            {strategy === 'free' && (
              <small
                style={{
                  display: 'block',
                  marginTop: '7px',
                  color: '#76edaa',
                  fontWeight: 900,
                }}
              >
                ∞ FREE · nessun vincolo strategico
              </small>
            )}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5,1fr)',
                gap: '5px',
                marginTop: '11px',
              }}
            >
              {(['ALL', 'P', 'D', 'C', 'A'] as const).map((item) => (
                <button
                  type="button"
                  key={`suggest-role-${item}`}
                  style={smallChoiceStyle(warRoleChosen && suggestionRole === item)}
                  onClick={() => {
                    setSuggestionRole(item)
                    setWarRoleChosen(true)
                    setWarCallChosen(false)
                    setSuggestionCategory(null)
                    setComparisonOpen(false)
                    setExpandedSuggestionKey(null)
                  }}
                >
                  {item === 'ALL' ? 'TUTTI' : item}
                </button>
              ))}
            </div>

            {warRoleChosen && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(5,minmax(0,1fr))',
                  gap: '5px',
                  marginTop: '7px',
                }}
              >
                {([
                  ['top', 'TOP'],
                  ['starter', 'TITOLARE'],
                  ['bet', 'SCOMM.'],
                  ['low', 'LOW'],
                  ['decoy', 'ESCA'],
                ] as [SuggestionCategory, string][]).map(([item, label]) => (
                  <button
                    type="button"
                    key={`suggest-type-${item}`}
                    style={{
                      ...smallChoiceStyle(warCallChosen && suggestionCategory === item),
                      paddingLeft: '4px',
                      paddingRight: '4px',
                      fontSize: '7px',
                    }}
                    onClick={() => {
                      setSuggestionCategory(item)
                      setWarCallChosen(true)
                      setSuggestionMode(item === 'bet' ? 'bet' : item === 'decoy' ? 'decoy' : 'target')
                      setComparisonOpen(false)
                      setExpandedSuggestionKey(null)
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {!warRoleChosen && (
              <p className="tip" style={{ margin: '10px 0 0' }}>
                Scegli un reparto per iniziare.
              </p>
            )}

            {warRoleChosen && !warCallChosen && (
              <p className="tip" style={{ margin: '10px 0 0' }}>
                Ora scegli il tipo di giocatore che vuoi cercare.
              </p>
            )}

            {warRoleChosen && warCallChosen && suggestionCategory && (
              <div style={{ marginTop: '12px' }}>
                <div className="section-title" style={{ marginBottom: '8px' }}>
                  <span>TOP 3</span>SUGGERIMENTO SPECIFICO
                </div>

                {suggestionCandidates.length === 0 ? (
                  <div className="main-card"><strong>Nessun profilo disponibile</strong></div>
                ) : (
                  <>
                    <div style={{ display: 'grid', gap: '8px' }}>
                      {suggestionCandidates.map(({ player, score }, index) => {
                        const key = `${player.name}|${player.team}`
                        const isOpen = expandedSuggestionKey === key
                        const analysis = squadSpecificAnalysis(player)

                        return (
                          <div className="main-card" key={`suggestion-card-${key}`} style={{ padding: '10px' }}>
                            <div
                              style={{
                                display: 'grid',
                                gridTemplateColumns: 'auto 1fr auto',
                                gap: '9px',
                                alignItems: 'center',
                              }}
                            >
                              <PlayerPhoto player={player} size={50} card />
                              <div style={{ minWidth: 0 }}>
                                <small style={{ color: '#7f93ad' }}>
                                  #{index + 1} · {player.role} · {player.team}
                                  {wishlistItemFor(player) && (
                                    <span style={{ marginLeft: '6px', color: '#ff95c8', fontWeight: 950 }}>
                                      ★ MY TEAM P{wishlistItemFor(player)?.priority}
                                    </span>
                                  )}
                                </small>
                                <strong
                                  style={{
                                    display: 'block',
                                    fontSize: '14px',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {player.name}
                                </strong>
                                <small style={{ color: '#9fb0c6' }}>
                                  Tit. {estimatedStarterPct(player)}% · Mercato {getMarket(player)}
                                </small>
                              </div>
                              <div className="recommendation-score" style={{ minWidth: '67px' }}>
                                <span>SPECIFICO</span>
                                <strong>{scoreOutOf10(Math.min(100, score))}/10</strong>
                              </div>
                            </div>

                            <div
                              style={{
                                marginTop: '8px',
                                padding: '8px 9px',
                                borderRadius: '10px',
                                border: '1px solid rgba(155,140,255,.18)',
                                background: 'rgba(155,140,255,.07)',
                              }}
                            >
                              <small style={{ color: '#c0b8ff', fontWeight: 900 }}>🎯 PERCHÉ</small>
                              <p className="tip" style={{ margin: '4px 0 0' }}>
                                {specificSuggestionHeadline(player, suggestionCategory)}
                              </p>
                            </div>

                            <div
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr',
                                gap: '6px',
                                marginTop: '8px',
                              }}
                            >
                              <button
                                type="button"
                                style={smallChoiceStyle(isOpen)}
                                onClick={() => setExpandedSuggestionKey(isOpen ? null : key)}
                              >
                                {isOpen ? 'CHIUDI ANALISI' : 'VEDI ANALISI'}
                              </button>
                              <button
                                type="button"
                                className="suggested-target-button"
                                style={{ width: '100%', margin: 0 }}
                                onClick={() => changePlayer(player.name)}
                              >
                                VALUTA
                              </button>
                            </div>

                            {isOpen && (
                              <div style={{ marginTop: '10px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '5px' }}>
                                  <div className="stat"><span>TITOLARITÀ</span><strong>{estimatedStarterPct(player)}%</strong></div>
                                  <div className="stat"><span>MERCATO</span><strong>{getMarket(player)}</strong></div>
                                  <div className="stat"><span>MAX LIVE</span><strong>{calculateDynamicMax(player)}</strong></div>
                                  <div className="stat"><span>MV 25/26</span><strong>{player.averageRating2526 ?? '—'}</strong></div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px', marginTop: '8px' }}>
                                  <div style={{ padding: '9px', borderRadius: '11px', background: 'rgba(50,213,131,.08)', border: '1px solid rgba(50,213,131,.18)' }}>
                                    <small style={{ color: '#76edaa' }}>PRO</small>
                                    <p className="tip" style={{ margin: '4px 0 0' }}>{playerPro(player)}</p>
                                  </div>
                                  <div style={{ padding: '9px', borderRadius: '11px', background: 'rgba(255,107,122,.07)', border: '1px solid rgba(255,107,122,.17)' }}>
                                    <small style={{ color: '#ff9ca6' }}>CONTRO</small>
                                    <p className="tip" style={{ margin: '4px 0 0' }}>{playerContra(player)}</p>
                                  </div>
                                </div>

                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '8px' }}>
                                  <span className="setup-badge">{player.penalties ? '✓ RIGORISTA' : '— RIGORI'}</span>
                                  <span className="setup-badge">{player.setPieces ? '✓ PIAZZATI' : '— PIAZZATI'}</span>
                                  <span className="setup-badge">CLUB {analysis.teamShare}%</span>
                                  {(player.role === 'D' || player.role === 'P') && (
                                    <span className="setup-badge">MOD {Math.round(analysis.modifier)}/100</span>
                                  )}
                                  {analysis.bug >= 100 && <span className="setup-badge">⚡ RUOLO BUG</span>}
                                </div>

                                <div
                                  style={{
                                    marginTop: '9px',
                                    padding: '10px',
                                    borderRadius: '11px',
                                    border: '1px solid rgba(155,140,255,.22)',
                                    background: 'rgba(155,140,255,.08)',
                                  }}
                                >
                                  <small style={{ color: '#c0b8ff', fontWeight: 950 }}>
                                    ANALISI SPECIFICA DELLA TUA ROSA
                                  </small>
                                  <p className="tip" style={{ margin: '6px 0 0', lineHeight: 1.6 }}>
                                    {specificSuggestionExplanation(player, suggestionCategory)}
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    <button
                      type="button"
                      style={{ ...smallChoiceStyle(comparisonOpen), width: '100%', marginTop: '9px' }}
                      onClick={() => setComparisonOpen((value) => !value)}
                    >
                      {comparisonOpen ? '✕ CHIUDI CONFRONTO' : '⚖️ CONFRONTA I 3'}
                    </button>

                    {comparisonOpen && (
                      <div className="main-card" style={{ marginTop: '8px', overflowX: 'auto' }}>
                        <div style={{ minWidth: '560px' }}>
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '150px repeat(3,1fr)',
                              gap: '6px',
                              alignItems: 'stretch',
                              paddingBottom: '9px',
                              borderBottom: '1px solid rgba(77,163,255,.20)',
                            }}
                          >
                            <span style={{ color: '#7f93ad', fontSize: '7px', fontWeight: 900, alignSelf: 'end' }}>
                              GIOCATORE
                            </span>

                            {suggestionCandidates.map(({ player }) => (
                              <div
                                key={`compare-player-${player.name}-${player.team}`}
                                style={{
                                  display: 'grid',
                                  justifyItems: 'center',
                                  gap: '4px',
                                  padding: '7px 5px',
                                  border: '1px solid rgba(148,163,184,.14)',
                                  borderRadius: '11px',
                                  background: 'rgba(11,18,31,.72)',
                                  textAlign: 'center',
                                }}
                              >
                                <PlayerPhoto player={player} size={38} />
                                <strong style={{ fontSize: '9px', lineHeight: 1.15 }}>{player.name}</strong>
                                <small style={{ color: '#7f93ad', fontSize: '7px' }}>
                                  {player.team} · {player.role}
                                </small>
                              </div>
                            ))}

                            {Array.from({ length: Math.max(0, 3 - suggestionCandidates.length) }).map((_, i) => (
                              <span key={`empty-player-${i}`} />
                            ))}
                          </div>

                          {[
                            ['SPECIFICO ROSA', (p: Player) => `${scoreOutOf10(Math.min(100, specificSuggestionScore(p, suggestionCategory)))}/10`],
                            ['VALUTAZIONE BASE', (p: Player) => `${scoreOutOf10(calculateTargetScore(p))}/10`],
                            ['CLUB NELLA ROSA', (p: Player) => `${squadSpecificAnalysis(p).teamShare}%`],
                            ['TITOLARITÀ STIM.', (p: Player) => `${estimatedStarterPct(p)}%`],
                            ['MERCATO', (p: Player) => getMarket(p)],
                            ['MAX LIVE', (p: Player) => calculateDynamicMax(p)],
                            ['FIT STRATEGIA', (p: Player) => `${scoreOutOf10(calculateStrategyFit(p))}/10`],
                            ['RIGORISTA', (p: Player) => p.penalties ? 'SÌ' : 'NO'],
                            ['PIAZZATI', (p: Player) => p.setPieces ? 'SÌ' : 'NO'],
                            ['MV 25/26', (p: Player) => p.averageRating2526 ?? '—'],
                          ].map(([label, getter]) => (
                            <div
                              key={`suggest-compare-${label}`}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '150px repeat(3,1fr)',
                                gap: '6px',
                                padding: '8px 0',
                                borderBottom: '1px solid rgba(148,163,184,.12)',
                              }}
                            >
                              <span style={{ color: '#7f93ad', fontSize: '7px', fontWeight: 900 }}>
                                {String(label)}
                              </span>
                              {suggestionCandidates.map(({ player }) => (
                                <strong key={`${String(label)}-${player.name}`} style={{ textAlign: 'center', fontSize: '9px' }}>
                                  {(getter as (p: Player) => string | number)(player)}
                                </strong>
                              ))}
                              {Array.from({ length: Math.max(0, 3 - suggestionCandidates.length) }).map((_, i) => (
                                <span key={`empty-${String(label)}-${i}`} />
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </section>

          <section className="section">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'center' }}>
              <div className="section-title" style={{ marginBottom: 0 }}>CERCA E VALUTA
              </div>
              {(playerSearch || selectedName) && (
                <button type="button" style={smallChoiceStyle(false)} onClick={resetSearchEvaluate}>↻ RESET</button>
              )}
            </div>

            <div className="target-card" style={{ marginTop: '10px' }}>
              <input
                type="text"
                placeholder="Cerca per nome o squadra..."
                value={playerSearch}
                onChange={(event) => handlePlayerSearch(event.target.value)}
              />

              {playerSearch && !selectedPlayer && (
                <div style={{ display: 'grid', gap: '6px', marginTop: '9px' }}>
                  {searchedPlayers.length === 0 ? (
                    <p className="tip">Nessun giocatore disponibile trovato.</p>
                  ) : (
                    searchedPlayers.map((player) => (
                      <button
                        type="button"
                        key={`quick-search-${player.name}-${player.team}`}
                        onClick={() => changePlayer(player.name)}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'auto 1fr auto',
                          gap: '9px',
                          alignItems: 'center',
                          padding: '9px',
                          border: '1px solid rgba(148,163,184,.14)',
                          borderRadius: '12px',
                          background: 'rgba(11,18,31,.72)',
                          color: '#fff',
                          textAlign: 'left',
                          cursor: 'pointer',
                        }}
                      >
                        <PlayerPhoto player={player} size={36} />
                        <div><strong>{player.name}</strong><small style={{ display: 'block', color: '#7f93ad' }}>{player.team} · {player.role}</small></div>
                        <strong>{getMarket(player)}</strong>
                      </button>
                    ))
                  )}
                </div>
              )}

              {selectedPlayer && (
                <div style={{ marginTop: '12px' }}>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <PlayerPhoto player={selectedPlayer} size={72} card />
                    <div>
                      <small style={{ color: '#7f93ad' }}>{selectedPlayer.role} · {selectedPlayer.team} · {selectedPlayer.tier}</small>
                      <strong style={{ display: 'block', fontSize: '17px' }}>{selectedPlayer.name}</strong>
                      <small>{selectedPlayer.profile ?? selectedPlayer.use ?? 'Profilo giocatore'}</small>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '5px', marginTop: '10px' }}>
                    <div className="stat"><span>VALUTAZIONE</span><strong>{scoreOutOf10(calculateTargetScore(selectedPlayer))}/10</strong></div>
                    <div className="stat"><span>TITOLARITÀ STIM.</span><strong>{estimatedStarterPct(selectedPlayer)}%</strong></div>
                    <div className="stat"><span>MERCATO</span><strong>{getMarket(selectedPlayer)}</strong></div>
                    <div className="stat highlight-stat"><span>MAX LIVE</span><strong>{dynamicMaxBid}</strong></div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '7px', marginTop: '8px' }}>
                    <div className="main-card"><span className="small-label">MEDIA VOTO 25/26</span><strong style={{ display: 'block' }}>{selectedPlayer.averageRating2526 ?? '—'}</strong></div>
                    <div className="main-card"><span className="small-label">FIT STRATEGIA</span><strong style={{ display: 'block' }}>{scoreOutOf10(calculateStrategyFit(selectedPlayer))}/10</strong></div>
                    <div className="main-card"><span className="small-label">RIGORISTA</span><strong style={{ display: 'block' }}>{selectedPlayer.penalties ? 'SÌ' : 'NO'}</strong></div>
                    <div className="main-card"><span className="small-label">CALCI PIAZZATI</span><strong style={{ display: 'block' }}>{selectedPlayer.setPieces ? 'SÌ' : 'NO'}</strong></div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px', marginTop: '8px' }}>
                    <div style={{ padding: '10px', borderRadius: '12px', background: 'rgba(50,213,131,.08)', border: '1px solid rgba(50,213,131,.18)' }}>
                      <small style={{ color: '#76edaa' }}>PRO</small>
                      <p className="tip" style={{ marginBottom: 0 }}>{playerPro(selectedPlayer)}</p>
                    </div>
                    <div style={{ padding: '10px', borderRadius: '12px', background: 'rgba(255,107,122,.07)', border: '1px solid rgba(255,107,122,.17)' }}>
                      <small style={{ color: '#ff9ca6' }}>CONTRO</small>
                      <p className="tip" style={{ marginBottom: 0 }}>{playerContra(selectedPlayer)}</p>
                    </div>
                  </div>

                  <div style={{ marginTop: '9px', padding: '11px', borderRadius: '12px', background: 'rgba(77,163,255,.09)', border: '1px solid rgba(77,163,255,.20)' }}>
                    <small style={{ color: '#88c3ff' }}>COMMENTO ALLA VALUTAZIONE</small>
                    <p className="tip" style={{ marginBottom: 0 }}>🧠 {evaluationComment(selectedPlayer)}</p>
                  </div>

                  <label>Prezzo corrente</label>
                  <div className="price-row">
                    <input type="number" min="0" value={price} onChange={(event) => setPrice(Math.max(0, Number(event.target.value) || 0))} />
                    <button type="button" onClick={() => setPrice((current) => Math.max(0, current - 1))}>−1</button>
                    <button type="button" onClick={() => setPrice((current) => current + 1)}>+1</button>
                  </div>

                  <div className="decision-grid">
                    <div><span>MAX LIVE</span><strong>{dynamicMaxBid}</strong></div>
                    <div className={`decision-box ${decision?.className ?? ''}`}><span>DECISIONE</span><strong>{decision?.label ?? '—'}</strong></div>
                  </div>
                  <p className="tip">{decision?.message}</p>
                  <button type="button" className="primary-button" onClick={registerPurchase}>REGISTRA ACQUISTO</button>
                  {message && <div className="message">{message}</div>}
                </div>
              )}
            </div>
          </section>
        </>
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

                            <button
                              type="button"
                              className="undo-button"
                              style={{
                                width: '37px',
                                minWidth: '37px',
                                height: '37px',
                                padding: 0,
                                fontSize: '18px',
                                margin: 0,
                              }}
                              onClick={() => removeFromWishlist(item.playerKey)}
                              aria-label={`Rimuovi ${player.name}`}
                            >
                              −
                            </button>
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
              Un giocatore presente in MY TEAM riceve un bonus di priorità nel motore
              “Suggerimento specifico”. La priorità 1 pesa di più; il limite dipende dal ruolo, ma la lista
              non forza un nome sbagliato: qualità, categoria scelta, stato della rosa,
              titolarità, incastri e compatibilità restano comunque determinanti.
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
                            <strong>{purchase.price}</strong>
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
                onClick={runDataUpdate}
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
                    I nuovi dati sono già attivi nei suggerimenti, in MY TEAM e nelle valutazioni.
                    Rimarranno disponibili anche senza connessione.
                  </p>
                </div>
              )}
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


          <section className="section
">
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