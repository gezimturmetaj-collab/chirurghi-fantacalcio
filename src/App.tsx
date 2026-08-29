import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { players, type Player, type Role } from './data/players'

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
type ViewMode = 'war' | 'live' | 'rivals' | 'history' | 'squad' | 'report' | 'ranking' | 'settings'
type Strategy = 'balanced' | 'aggressive' | 'value' | 'patient' | 'stars'
type SuggestionMode = 'target' | 'bet' | 'decoy'

type RankedPlayer = {
  player: Player
  score: number
  reason: string
}

type ExtendedPlayer = Player & {
  newToSerieA?: boolean
}

const BASE_BUDGET = 500
const STORAGE_KEY = 'fantacalcio-auction-state-v1'

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
}

function loadSavedAuction(): Partial<SavedAuction> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

const roles: Role[] = ['P', 'D', 'C', 'A']

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
    grid-template-columns: repeat(7, 1fr);
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
  const [role, setRole] = useState<Role>('A')
  const [moveRoleFilter] = useState<'ALL' | Role>('ALL')
  const [warRoleChosen, setWarRoleChosen] = useState(false)
  const [warCallChosen, setWarCallChosen] = useState(false)
  const [comparisonSearch, setComparisonSearch] = useState('')
  const [comparisonName, setComparisonName] = useState('')
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
  ])

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

  function getMarket(player: Player) {
    const value =
      leagueSize === 8
        ? player.market8 ?? player.market10
        : player.market10 ?? player.market8
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
  const creditsPerSlot = slotsRemaining > 0 ? (budget / slotsRemaining).toFixed(1) : '0.0'

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

    if (strategy === 'balanced') return 1

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

  function targetReason(player: Player) {
    const market = getMarket(player)
    const max = calculateDynamicMax(player)
    const pairBonus = goalkeeperPairBonus(player)
    const strategicFit = calculateStrategyFit(player)

    if (pairBonus >= 60) return `Abbinamento portieri prioritario · ${strategyReason(player)}`
    if (strategicFit >= 85) return strategyReason(player)
    if (market <= max * 0.75 && max > 0)
      return `Grande rapporto qualità/prezzo · ${strategyReason(player)}`
    if (market <= max && tierScore(player) >= 80)
      return `Profilo forte e sostenibile · ${strategyReason(player)}`
    if (market <= max)
      return `Compatibile con il budget · ${strategyReason(player)}`
    if (market <= max * 1.2)
      return `Interessante, ma serve disciplina · ${strategyReason(player)}`
    return `Alternativa solo a prezzo favorevole · ${strategyReason(player)}`
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

  const targetRankedPlayers = useMemo<RankedPlayer[]>(
    () =>
      availablePlayers
        .filter((player) => player.role === role)
        .map((player) => ({
          player,
          score: calculateTargetScore(player),
          reason: targetReason(player),
        }))
        .sort((a, b) => b.score - a.score),
    [availablePlayers, role, leagueSize, budget, purchases, adaptiveBudgets, startingBudget, strategy]
  )

  const betRankedPlayers = useMemo<RankedPlayer[]>(
    () =>
      availablePlayers
        .filter((player) => player.role === role)
        .filter((player) => getMarket(player) <= startingBudget * 0.08)
        .map((player) => ({
          player,
          score: calculateBetScore(player),
          reason: betReason(player),
        }))
        .sort((a, b) => b.score - a.score),
    [availablePlayers, role, leagueSize, budget, purchases, adaptiveBudgets, startingBudget, strategy]
  )

  const decoyRankedPlayers = useMemo<RankedPlayer[]>(
    () =>
      availablePlayers
        .filter((player) => player.role === role)
        .map((player) => ({
          player,
          score: calculateDecoyScore(player),
          reason: decoyReason(player),
        }))
        .sort((a, b) => b.score - a.score),
    [availablePlayers, role, leagueSize, budget, purchases, rivalSales, startingBudget, strategy]
  )

  const rankedPlayers =
    suggestionMode === 'bet'
      ? betRankedPlayers
      : suggestionMode === 'decoy'
      ? decoyRankedPlayers
      : targetRankedPlayers
  const recommendedPlayer = rankedPlayers[0]?.player
  const topAlternatives = rankedPlayers
    .filter((item) => item.player.name !== recommendedPlayer?.name)
    .slice(0, 3)

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
    moveRoleFilter === 'ALL'
      ? auctionMoves
      : auctionMoves.filter((move) => move.role === moveRoleFilter)

  const nextAuctionMove =
    filteredAuctionMoves.find((move) => move.urgency > 0) ?? null


  const allAvailableRolePlayers = useMemo(
    () =>
      availablePlayers
        .filter((player) => player.role === role)
        .sort((a, b) => a.name.localeCompare(b.name, 'it')),
    [availablePlayers, role]
  )

  const searchedPlayers = useMemo(() => {
    const search = playerSearch.trim().toLowerCase()
    if (!search) return allAvailableRolePlayers
    return allAvailableRolePlayers.filter(
      (player) =>
        player.name.toLowerCase().includes(search) ||
        player.team.toLowerCase().includes(search)
    )
  }, [allAvailableRolePlayers, playerSearch])

  const selectedPlayer =
    availablePlayers.find(
      (player) => player.name === selectedName && player.role === role
    ) ?? recommendedPlayer

  const comparisonCandidates = availablePlayers
    .filter((player) => player.role === role)
    .filter((player) => player.name !== recommendedPlayer?.name)
    .filter((player) => {
      const search = comparisonSearch.trim().toLowerCase()
      if (!search) return true
      return (
        player.name.toLowerCase().includes(search) ||
        player.team.toLowerCase().includes(search)
      )
    })
    .slice(0, 20)

  const comparisonPlayer =
    availablePlayers.find(
      (player) =>
        player.name === comparisonName &&
        player.role === role &&
        player.name !== recommendedPlayer?.name
    ) ?? null

  function recommendationScore(player: Player) {
    if (suggestionMode === 'bet') return calculateBetScore(player)
    if (suggestionMode === 'decoy') return calculateDecoyScore(player)
    return calculateTargetScore(player)
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
    strategyDifference > tolerance
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

  function changeRole(newRole: Role) {
    setRole(newRole)
    setSelectedName('')
    setPlayerSearch('')
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
    const search = value.trim().toLowerCase()
    if (!search) {
      setSelectedName('')
      return
    }
    const matches = allAvailableRolePlayers.filter(
      (player) =>
        player.name.toLowerCase().includes(search) ||
        player.team.toLowerCase().includes(search)
    )
    if (matches.length === 1) {
      setSelectedName(matches[0].name)
      setPrice(getMarket(matches[0]))
    }
  }

  function useRecommendedPlayer() {
    if (!recommendedPlayer) return
    setSelectedName(recommendedPlayer.name)
    setPlayerSearch(recommendedPlayer.name)
    setPrice(getMarket(recommendedPlayer))
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
    setComparisonSearch('')
    setComparisonName('')
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
    minHeight: '46px',
    padding: '6px 3px',
    borderRadius: '12px',
    border: active ? '1px solid rgba(77,163,255,.38)' : '1px solid transparent',
    background: active
      ? 'linear-gradient(145deg,rgba(77,163,255,.20),rgba(77,163,255,.09))'
      : 'transparent',
    color: active ? '#d8ecff' : '#7f8da3',
    fontWeight: 900,
    fontSize: '8px',
    cursor: 'pointer',
    boxShadow: active ? '0 7px 18px rgba(77,163,255,.08)' : 'none',
  })

  const smallChoiceStyle = (active: boolean) => ({
    minHeight: '43px',
    padding: '8px 10px',
    borderRadius: '13px',
    border: active
      ? '1px solid rgba(77,163,255,.42)'
      : '1px solid rgba(148,163,184,.16)',
    background: active
      ? 'linear-gradient(145deg,rgba(77,163,255,.18),rgba(77,163,255,.08))'
      : 'rgba(17,25,40,.78)',
    color: active ? '#e8f4ff' : '#aab7c9',
    fontWeight: 900,
    fontSize: '9px',
    cursor: 'pointer',
    boxShadow: active ? '0 7px 20px rgba(77,163,255,.08)' : 'none',
  })

  if (!setupComplete) {
    return (
      <div className="app setup-shell">
        <style>{APP_THEME_CSS}</style>

        <div className="setup-hero">
          <span className="setup-badge">● AUCTION CONTROL</span>
          <h1>Prepara la tua asta.</h1>
          <p>
            Imposta lega, crediti e strategia. Da qui il Regista d’Asta adatterà
            tutte le decisioni live.
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
          <div className="section-title"><span>01</span>PARTECIPANTI</div>
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
          <div className="section-title"><span>02</span>CREDITI INIZIALI</div>
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

        <section className="section">
          <div className="section-title"><span>03</span>STRATEGIA</div>
          <div className="main-card">
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2,1fr)',
              gap: '8px',
            }}>
              {(Object.keys(strategies) as Strategy[]).map((item) => (
                <button
                  key={`setup-strategy-${item}`}
                  type="button"
                  style={smallChoiceStyle(strategy === item)}
                  onClick={() => setStrategy(item)}
                >
                  {strategies[item].name}
                </button>
              ))}
            </div>

            <div style={{
              marginTop: '12px',
              padding: '12px',
              border: '1px solid #273149',
              borderRadius: '10px',
              background: '#0b111e',
            }}>
              <strong style={{ color: '#70d6a1' }}>
                {currentStrategy.name}
              </strong>
              <p className="tip" style={{ marginBottom: 0 }}>
                {currentStrategy.description}
              </p>
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
          La strategia potrà essere cambiata in qualsiasi momento dalle impostazioni.
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
          <span>●</span><span className="nav-caption">LIVE</span>
        </button>
        <button type="button" style={navStyle(view === 'rivals')} onClick={() => setView('rivals')}>
          <span>♟</span><span className="nav-caption">LEGA</span>
        </button>
        <button type="button" style={navStyle(view === 'squad')} onClick={() => setView('squad')}>
          <span>◆</span><span className="nav-caption">ROSA</span>
        </button>
        <button type="button" style={navStyle(view === 'report')} onClick={() => setView('report')}>
          <span>↗</span><span className="nav-caption">REPORT</span>
        </button>
        <button type="button" style={navStyle(view === 'history')} onClick={() => setView('history')}>
          <span>◷</span><span className="nav-caption">STORICO</span>
        </button>
        <button type="button" style={navStyle(view === 'settings')} onClick={() => setView('settings')}>
          <span>⚙</span><span className="nav-caption">SET</span>
        </button>
      </div>

      {view === 'war' && (
        <>
          <header className="topbar">
            <div>
              <p className="eyebrow">FANTACALCIO 2026/27</p>
              <h1>WAR ROOM</h1>
            </div>
            <div className="budget-box">
              <span>RESIDUO</span>
              <strong>{budget}</strong>
            </div>
          </header>

          <section
            className="stats"
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 20,
              background: 'rgba(7,11,20,.88)',
              paddingTop: '7px',
              paddingBottom: '7px',
              borderRadius: '15px',
            }}
          >
            <div className="stat">
              <span>BUDGET INIZIALE</span>
              <strong>{startingBudget}</strong>
            </div>
            <div className="stat highlight-stat">
              <span>RESIDUO</span>
              <strong>{budget}</strong>
            </div>
            <div className="stat">
              <span>SPESO</span>
              <strong>{startingBudget - budget}</strong>
            </div>
            <div className="stat">
              <span>CR / SLOT</span>
              <strong>{creditsPerSlot}</strong>
            </div>
          </section>

          <section className="section">
            <div className="section-title"><span>01</span>LA MIA ROSA</div>

            <div className="roster-summary">
              {roles.map((item) => (
                <div key={`war-roster-${item}`}>
                  <span>{item}</span>
                  <strong>{roleCount(item)}/{slotLimits[item]}</strong>
                  <small>{roleRemaining(item)} liberi</small>
                </div>
              ))}
            </div>

            {purchases.length === 0 ? (
              <div className="main-card">
                <strong>Rosa ancora vuota</strong>
                <p className="tip">
                  Gli acquisti compariranno qui durante l’asta.
                </p>
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
          </section>

          <section className="section">
            <div className="section-title"><span>02</span>STRATEGIA ADATTIVA</div>

            <div className={`adaptive-status ${strategyStatus.className}`}>
              <div>
                <span>{currentStrategy.name}</span>
                <strong>{strategyStatus.label}</strong>
              </div>
              <p>{strategyStatus.text}</p>
            </div>

            <div className="role-budget-grid">
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
          </section>

          <section className="section">
            <div className="section-title"><span>03</span>AVVISI INTELLIGENTI</div>

            {smartAlerts.length === 0 ? (
              <div className="main-card" style={{ border: '1px solid #315a49' }}>
                <strong style={{ color: '#70d6a1' }}>
                  ✓ Situazione sotto controllo
                </strong>
                <p className="tip">
                  Nessuno squilibrio importante rilevato in questo momento.
                </p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '8px' }}>
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
                          <strong style={{ color: appearance.color }}>
                            {alert.title}
                          </strong>
                          <p
                            style={{
                              margin: '4px 0 0',
                              color: '#a8b1c2',
                              fontSize: '9px',
                              lineHeight: 1.55,
                            }}
                          >
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

          <section className="section">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: '8px',
                alignItems: 'center',
              }}
            >
              <div className="section-title" style={{ marginBottom: 0 }}>
                <span>04</span>SCEGLI RUOLO
              </div>

              {(warRoleChosen || warCallChosen || comparisonName || comparisonSearch) && (
                <button
                  type="button"
                  style={smallChoiceStyle(false)}
                  onClick={resetWarChoiceFlow}
                >
                  ↻ RESET
                </button>
              )}
            </div>

            <div className="role-tabs" style={{ marginTop: '10px' }}>
              {roles.map((item) => (
                <button
                  type="button"
                  key={`war-role-${item}`}
                  className={
                    warRoleChosen && role === item
                      ? 'role-button active'
                      : 'role-button'
                  }
                  onClick={() => {
                    changeRole(item)
                    setWarRoleChosen(true)
                    setWarCallChosen(false)
                    setComparisonSearch('')
                    setComparisonName('')
                  }}
                >
                  <span>{item}</span>
                  <small>{roleCount(item)}/{slotLimits[item]}</small>
                </button>
              ))}
            </div>

            {!warRoleChosen && (
              <p className="tip">
                Scegli il reparto da affrontare. Dopo la scelta comparirà il tipo di chiamata.
              </p>
            )}
          </section>

          {warRoleChosen && (
            <section className="section">
              <div className="section-title"><span>05</span>TIPO DI CHIAMATA</div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3,1fr)',
                  gap: '8px',
                }}
              >
                <button
                  type="button"
                  style={smallChoiceStyle(
                    warCallChosen && suggestionMode === 'target'
                  )}
                  onClick={() => {
                    setSuggestionMode('target')
                    setWarCallChosen(true)
                    setComparisonSearch('')
                    setComparisonName('')
                  }}
                >
                  🎯 TARGET
                </button>

                <button
                  type="button"
                  style={smallChoiceStyle(
                    warCallChosen && suggestionMode === 'bet'
                  )}
                  onClick={() => {
                    setSuggestionMode('bet')
                    setWarCallChosen(true)
                    setComparisonSearch('')
                    setComparisonName('')
                  }}
                >
                  🎲 SCOMMESSA
                </button>

                <button
                  type="button"
                  style={smallChoiceStyle(
                    warCallChosen && suggestionMode === 'decoy'
                  )}
                  onClick={() => {
                    setSuggestionMode('decoy')
                    setWarCallChosen(true)
                    setComparisonSearch('')
                    setComparisonName('')
                  }}
                >
                  🪤 ESCA
                </button>
              </div>
            </section>
          )}

          {warRoleChosen && warCallChosen && recommendedPlayer && (
            <section className="section">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: '8px',
                  alignItems: 'center',
                }}
              >
                <div className="section-title" style={{ marginBottom: 0 }}>
                  <span>06</span>
                  {suggestionMode === 'bet'
                    ? 'SCOMMESSA SUGGERITA'
                    : suggestionMode === 'decoy'
                    ? 'ESCA SUGGERITA'
                    : 'CHIAMATA SUGGERITA'}
                </div>

                <button
                  type="button"
                  style={smallChoiceStyle(false)}
                  onClick={resetWarChoiceFlow}
                >
                  ↻ RESET
                </button>
              </div>

              <div className="main-card recommendation-main">
                <div className="player-heading">
                  <div style={{ display: 'flex', gap: '11px', alignItems: 'center' }}>
                    <PlayerPhoto player={recommendedPlayer} size={92} card />
                    <div>
                      <p className="small-label">
                        {roleNames[recommendedPlayer.role]} · {recommendedPlayer.tier}
                      </p>
                      <h2>{recommendedPlayer.name}</h2>
                      <p className="description">{recommendedPlayer.team}</p>
                    </div>
                  </div>

                  <div className="recommendation-score">
                    <span>VALUTAZIONE</span>
                    <strong>
                      {scoreOutOf10(recommendationScore(recommendedPlayer))}/10
                    </strong>
                  </div>
                </div>

                <div className="dynamic-info-grid">
                  <div className="dynamic-main">
                    <span>MAX LIVE</span>
                    <strong>{calculateDynamicMax(recommendedPlayer)}</strong>
                  </div>
                  <div>
                    <span>MERCATO</span>
                    <strong>{getMarket(recommendedPlayer)}</strong>
                  </div>
                  <div>
                    <span>FIT STRATEGIA</span>
                    <strong>
                      {scoreOutOf10(calculateStrategyFit(recommendedPlayer))}/10
                    </strong>
                  </div>
                  <div>
                    <span>TETTO DB</span>
                    <strong>{scaledDbMax(recommendedPlayer)}</strong>
                  </div>
                </div>

                <p className="recommendation-reason" style={{ marginBottom: '8px' }}>
                  🧠 {strategyReason(recommendedPlayer)}
                </p>

                <p className="recommendation-reason">
                  {suggestionMode === 'bet'
                    ? `🎲 ${betReason(recommendedPlayer)}`
                    : suggestionMode === 'decoy'
                    ? `🪤 ${decoyReason(recommendedPlayer)}`
                    : `★ ${targetReason(recommendedPlayer)}`}
                </p>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3,1fr)',
                    gap: '6px',
                    marginTop: '10px',
                  }}
                >
                  {(() => {
                    const thresholds = bidThresholds(recommendedPlayer)
                    return (
                      <>
                        <div
                          style={{
                            padding: '8px',
                            border: '1px solid #315a49',
                            borderRadius: '8px',
                          }}
                        >
                          <span
                            style={{
                              display: 'block',
                              color: '#70d6a1',
                              fontSize: '6px',
                            }}
                          >
                            ATTACCA
                          </span>
                          <strong>{thresholds.attack}</strong>
                        </div>

                        <div
                          style={{
                            padding: '8px',
                            border: '1px solid #6b5830',
                            borderRadius: '8px',
                          }}
                        >
                          <span
                            style={{
                              display: 'block',
                              color: '#f2c66d',
                              fontSize: '6px',
                            }}
                          >
                            DISCIPLINA
                          </span>
                          <strong>{thresholds.discipline}</strong>
                        </div>

                        <div
                          style={{
                            padding: '8px',
                            border: '1px solid #753f48',
                            borderRadius: '8px',
                          }}
                        >
                          <span
                            style={{
                              display: 'block',
                              color: '#ff9aa8',
                              fontSize: '6px',
                            }}
                          >
                            STOP
                          </span>
                          <strong>{thresholds.stop}</strong>
                        </div>
                      </>
                    )
                  })()}
                </div>

                <button
                  type="button"
                  className="suggested-target-button"
                  onClick={useRecommendedPlayer}
                  style={{ marginTop: '10px' }}
                >
                  {suggestionMode === 'decoy'
                    ? 'USA QUESTA ESCA'
                    : suggestionMode === 'bet'
                    ? 'USA QUESTA SCOMMESSA'
                    : 'USA QUESTO TARGET'}
                </button>
              </div>

              <div
                className="main-card"
                style={{ marginTop: '10px', border: '1px solid #273149' }}
              >
                <strong>⚖️ CONFRONTA CON UN ALTRO GIOCATORE</strong>
                <p className="tip">
                  Facoltativo: scegli un altro {roleNames[role].toLowerCase()} e confronta
                  subito le valutazioni principali.
                </p>

                <input
                  type="text"
                  placeholder="Cerca nome o squadra..."
                  value={comparisonSearch}
                  onChange={(event) => {
                    setComparisonSearch(event.target.value)
                    setComparisonName('')
                  }}
                />

                <select
                  value={comparisonName}
                  onChange={(event) => setComparisonName(event.target.value)}
                  style={{ marginTop: '8px' }}
                >
                  <option value="">Seleziona per confrontare</option>
                  {comparisonCandidates.map((player) => (
                    <option
                      key={`compare-option-${player.name}-${player.team}`}
                      value={player.name}
                    >
                      {player.name} · {player.team}
                    </option>
                  ))}
                </select>

                {comparisonPlayer && (
                  <div style={{ marginTop: '12px' }}>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '7px',
                        marginBottom: '7px',
                      }}
                    >
                      <div
                        style={{
                          padding: '9px',
                          border: '1px solid #315a49',
                          borderRadius: '9px',
                          background: '#10251d',
                        }}
                      >
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <PlayerPhoto player={recommendedPlayer} size={54} card />
                          <div>
                            <small style={{ color: '#70d6a1' }}>SUGGERITO</small>
                            <strong style={{ display: 'block' }}>
                              {recommendedPlayer.name}
                            </strong>
                            <small>{recommendedPlayer.team}</small>
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          padding: '9px',
                          border: '1px solid #273149',
                          borderRadius: '9px',
                        }}
                      >
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <PlayerPhoto player={comparisonPlayer} size={54} card />
                          <div>
                            <small style={{ color: '#79b8ff' }}>CONFRONTO</small>
                            <strong style={{ display: 'block' }}>
                              {comparisonPlayer.name}
                            </strong>
                            <small>{comparisonPlayer.team}</small>
                          </div>
                        </div>
                      </div>
                    </div>

                    {[
                      {
                        label: 'VALUTAZIONE',
                        left: `${scoreOutOf10(
                          recommendationScore(recommendedPlayer)
                        )}/10`,
                        right: `${scoreOutOf10(
                          recommendationScore(comparisonPlayer)
                        )}/10`,
                      },
                      {
                        label: 'MERCATO',
                        left: getMarket(recommendedPlayer),
                        right: getMarket(comparisonPlayer),
                      },
                      {
                        label: 'MAX LIVE',
                        left: calculateDynamicMax(recommendedPlayer),
                        right: calculateDynamicMax(comparisonPlayer),
                      },
                      {
                        label: 'FIT STRATEGIA',
                        left: `${scoreOutOf10(
                          calculateStrategyFit(recommendedPlayer)
                        )}/10`,
                        right: `${scoreOutOf10(
                          calculateStrategyFit(comparisonPlayer)
                        )}/10`,
                      },
                      {
                        label: 'TETTO DB',
                        left: scaledDbMax(recommendedPlayer),
                        right: scaledDbMax(comparisonPlayer),
                      },
                      {
                        label: 'TIER',
                        left: recommendedPlayer.tier,
                        right: comparisonPlayer.tier,
                      },
                    ].map((row) => (
                      <div
                        key={`comparison-${row.label}`}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 72px 72px',
                          gap: '6px',
                          alignItems: 'center',
                          padding: '8px 0',
                          borderBottom: '1px solid #20283a',
                        }}
                      >
                        <span
                          style={{
                            color: '#78859b',
                            fontSize: '7px',
                            fontWeight: 900,
                          }}
                        >
                          {row.label}
                        </span>
                        <strong style={{ textAlign: 'center' }}>{row.left}</strong>
                        <strong style={{ textAlign: 'center' }}>{row.right}</strong>
                      </div>
                    ))}

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '8px',
                        marginTop: '10px',
                      }}
                    >
                      <button
                        type="button"
                        style={smallChoiceStyle(true)}
                        onClick={useRecommendedPlayer}
                      >
                        USA {recommendedPlayer.name}
                      </button>
                      <button
                        type="button"
                        style={smallChoiceStyle(false)}
                        onClick={() => changePlayer(comparisonPlayer.name)}
                      >
                        USA {comparisonPlayer.name}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {topAlternatives.length > 0 && (
                <div className="recommendation-list" style={{ marginTop: '10px' }}>
                  {topAlternatives.map((item, index) => (
                    <button
                      type="button"
                      className="recommendation-item"
                      key={`war-alt-${item.player.name}-${item.player.team}`}
                      onClick={() => {
                        setComparisonName(item.player.name)
                        setComparisonSearch(item.player.name)
                      }}
                    >
                      <span className="recommendation-rank">#{index + 2}</span>
                      <PlayerPhoto player={item.player} size={34} />
                      <div>
                        <strong>{item.player.name}</strong>
                        <small>{item.player.team} · {item.reason}</small>
                      </div>
                      <b>{scoreOutOf10(item.score)}/10</b>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}

          <section className="section">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: '8px',
                alignItems: 'center',
              }}
            >
              <div className="section-title" style={{ marginBottom: 0 }}>
                <span>07</span>CERCA E VALUTA
              </div>

              {(playerSearch || selectedName || price !== 1 || message) && (
                <button
                  type="button"
                  style={smallChoiceStyle(false)}
                  onClick={resetSearchEvaluate}
                >
                  ↻ RESET
                </button>
              )}
            </div>

            <div className="target-card" style={{ marginTop: '10px' }}>
              <label>Cerca giocatore</label>
              <input
                type="text"
                placeholder="Scrivi nome o squadra..."
                value={playerSearch}
                onChange={(event) => handlePlayerSearch(event.target.value)}
              />

              <div
                style={{
                  margin: '8px 0 10px',
                  color: '#7f8ca3',
                  fontSize: '10px',
                }}
              >
                {searchedPlayers.length} trovati · {allAvailableRolePlayers.length} disponibili
              </div>

              <select
                value={
                  selectedPlayer &&
                  searchedPlayers.some(
                    (player) => player.name === selectedPlayer.name
                  )
                    ? selectedPlayer.name
                    : ''
                }
                onChange={(event) => changePlayer(event.target.value)}
              >
                <option value="">Seleziona un giocatore</option>
                {searchedPlayers.map((player) => (
                  <option
                    key={`search-evaluate-${player.name}-${player.team}`}
                    value={player.name}
                  >
                    {player.name} · {player.team}
                  </option>
                ))}
              </select>

              {selectedPlayer && (
                <>
                  <div
                    style={{
                      display: 'flex',
                      gap: '10px',
                      alignItems: 'center',
                      marginTop: '10px',
                      marginBottom: '10px',
                    }}
                  >
                    <PlayerPhoto player={selectedPlayer} size={66} card />
                    <div>
                      <strong style={{ display: 'block', fontSize: '15px' }}>
                        {selectedPlayer.name}
                      </strong>
                      <small style={{ color: '#78859b' }}>
                        {selectedPlayer.role} · {selectedPlayer.team} · {selectedPlayer.tier}
                      </small>
                    </div>
                  </div>

                  <div className="dynamic-info-grid" style={{ marginTop: '10px' }}>
                    <div className="dynamic-main">
                      <span>VALUTAZIONE</span>
                      <strong>
                        {scoreOutOf10(calculateTargetScore(selectedPlayer))}/10
                      </strong>
                    </div>
                    <div>
                      <span>MERCATO</span>
                      <strong>{getMarket(selectedPlayer)}</strong>
                    </div>
                    <div>
                      <span>MAX LIVE</span>
                      <strong>{dynamicMaxBid}</strong>
                    </div>
                    <div>
                      <span>FIT STRATEGIA</span>
                      <strong>
                        {scoreOutOf10(calculateStrategyFit(selectedPlayer))}/10
                      </strong>
                    </div>
                  </div>

                  <label>Prezzo corrente</label>

                  <div className="price-row">
                    <input
                      type="number"
                      min="0"
                      value={price}
                      onChange={(event) =>
                        setPrice(Math.max(0, Number(event.target.value) || 0))
                      }
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setPrice((current) => Math.max(0, current - 1))
                      }
                    >
                      −1
                    </button>
                    <button
                      type="button"
                      onClick={() => setPrice((current) => current + 1)}
                    >
                      +1
                    </button>
                  </div>

                  <div className="decision-grid">
                    <div>
                      <span>MAX LIVE</span>
                      <strong>{dynamicMaxBid}</strong>
                    </div>
                    <div className={`decision-box ${decision?.className ?? ''}`}>
                      <span>DECISIONE</span>
                      <strong>{decision?.label ?? '—'}</strong>
                    </div>
                  </div>

                  <p className="tip">{decision?.message}</p>

                  <button
                    type="button"
                    className="primary-button"
                    onClick={registerPurchase}
                  >
                    REGISTRA ACQUISTO
                  </button>

                  {message && <div className="message">{message}</div>}
                </>
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
            <div className="section-title"><span>01</span>GIOCATORE CHIAMATO</div>
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
              <div className="section-title"><span>02</span>GAME THEORY LIVE</div>
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
            <div className="section-title"><span>01</span>GIUDIZIO ROSA</div>
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
            <div className="section-title"><span>02</span>ANALISI REPARTI</div>
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
            <div className="section-title"><span>03</span>ROSA ACQUISTATA</div>

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

      {view === 'report' && (
        <>
          <header className="topbar">
            <div>
              <p className="eyebrow">CHIUSURA ASTA</p>
              <h1>REPORT FINALE</h1>
            </div>
            <div className="budget-box">
              <span>VOTO FINALE</span>
              <strong>{purchases.length > 0 ? scoreOutOf10(finalReportScore) : '—'}</strong>
            </div>
          </header>

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
            <div className="section-title"><span>01</span>VERDETTO</div>
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
            <div className="section-title"><span>02</span>BUDGET: PIANO VS REALE</div>
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
            <div className="section-title"><span>03</span>MIGLIORI AFFARI</div>
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
            <div className="section-title"><span>04</span>OVERPAY</div>
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
            <div className="section-title"><span>05</span>REPARTI</div>
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
            <div className="section-title"><span>06</span>RIEPILOGO</div>
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
            <div className="section-title"><span>01</span>LE MIE OPERAZIONI</div>

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
            <div className="section-title"><span>02</span>OPERAZIONI RIVALI</div>

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
            <div className="section-title"><span>03</span>SICUREZZA</div>
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
            <div className="section-title"><span>01</span>STRATEGIA ASTA</div>
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
            <div className="section-title"><span>02</span>STATO DATI</div>
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
            <div className="section-title"><span>03</span>BACKUP</div>
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
            <div className="section-title"><span>04</span>CONTROLLO INTEGRITÀ</div>
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
            <div className="section-title"><span>01</span>SITUAZIONE LEGA</div>
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
            <div className="section-title"><span>02</span>CLASSIFICA ROSE</div>
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
              <div className="section-title"><span>03</span>RIVALE DA BATTERE</div>
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
            <div className="section-title"><span>04</span>LETTURA CORRETTA</div>
            <div className="main-card">
              <p className="tip">
                Questa è una stima dinamica, non una previsione del campionato.
                Più acquisti dei rivali registri, più il confronto diventa rappresentativo.
              </p>
            </div>
          </section>


          <section className="section">
            <div className="section-title"><span>05</span>CONTROLLO AVVERSARI</div>
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