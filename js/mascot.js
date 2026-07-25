// mascot.js — the Wetterfux fox, dressed for today's weather

// cond: { level, rain, sun, wind, snow }
// level: freezing|cold|chilly|cool|mild|warm|hot
export function foxSVG(cond = {}) {
  const beanie = cond.level === 'freezing' || cond.level === 'cold' || cond.snow;
  const scarf = beanie || cond.level === 'chilly' || cond.level === 'cool';
  const shades = (cond.sun || cond.level === 'hot' || cond.level === 'warm') && !cond.rain;
  const umbrella = cond.rain;

  return `<svg viewBox="0 0 72 72" class="fox" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    ${umbrella ? umbrellaSVG() : ''}
    <!-- ears -->
    <path d="M16 30 L20 10 L32 26 Z" class="fox-ear"/>
    <path d="M56 30 L52 10 L40 26 Z" class="fox-ear"/>
    <path d="M19 27 L21 15 L28 25 Z" class="fox-ear-in"/>
    <path d="M53 27 L51 15 L44 25 Z" class="fox-ear-in"/>
    <!-- head -->
    <path d="M36 24 C50 24 56 34 54 44 C52 54 44 60 36 60 C28 60 20 54 18 44 C16 34 22 24 36 24 Z" class="fox-face"/>
    <!-- cheeks / muzzle -->
    <path d="M36 40 C44 40 50 44 50 48 C50 55 43 60 36 60 C29 60 22 55 22 48 C22 44 28 40 36 40 Z" class="fox-cheek"/>
    <!-- eyes -->
    ${shades ? shadesSVG() : `<circle cx="28" cy="40" r="3" class="fox-eye"/><circle cx="44" cy="40" r="3" class="fox-eye"/>`}
    <!-- nose -->
    <ellipse cx="36" cy="50" rx="3.4" ry="2.6" class="fox-nose"/>
    <path d="M36 52 L36 56" class="fox-mouth"/>
    ${scarf ? scarfSVG() : ''}
    ${beanie ? beanieSVG() : ''}
  </svg>`;
}

function beanieSVG() {
  return `<g class="fox-beanie">
    <path d="M17 26 C20 12 52 12 55 26 C46 21 26 21 17 26 Z" class="beanie-top"/>
    <rect x="16" y="24" width="40" height="7" rx="3.5" class="beanie-band"/>
    <circle cx="36" cy="9" r="4" class="beanie-pom"/>
  </g>`;
}
function scarfSVG() {
  return `<g class="fox-scarf">
    <path d="M22 56 C28 62 44 62 50 56 L50 61 C44 66 28 66 22 61 Z" class="scarf-main"/>
    <path d="M45 60 L52 70 L46 70 L42 61 Z" class="scarf-end"/>
  </g>`;
}
function shadesSVG() {
  return `<g class="fox-shades">
    <rect x="22" y="37" width="12" height="8" rx="4" class="shade-lens"/>
    <rect x="38" y="37" width="12" height="8" rx="4" class="shade-lens"/>
    <path d="M34 40 L38 40" class="shade-bridge"/>
  </g>`;
}
function umbrellaSVG() {
  return `<g class="fox-umbrella">
    <path d="M36 2 C22 2 14 12 14 20 L58 20 C58 12 50 2 36 2 Z" class="umb-top"/>
    <path d="M36 2 L36 6" class="umb-tip"/>
  </g>`;
}
