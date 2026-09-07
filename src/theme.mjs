// theme.mjs — extracted verbatim from the former inline app (Phase 5.3). Do not edit behaviour here without tests.
// ─── NEWSPAPER THEME ─────────────────────────────────────────────────────────
export const FONTS = {fell:"'IM Fell English SC','Playfair Display',serif",sansOld:"'Inter',system-ui,sans-serif",serif:"'Source Serif 4','Libre Baskerville',Georgia,serif",sans:"'Inter',system-ui,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif",mono:"'JetBrains Mono','Courier New',monospace",display:"'Playfair Display','Source Serif 4',Georgia,serif"};

export const LIGHT = {bg:"#E1CDAC",surface:"#EBDFC4",card:"#E7D8B9",border:"#A3814B",borderLt:"#C8B68C",text:"#2E2922",textDim:"#5C5240",textMute:"#8B7B58",ink:"#231F19",accent:"#93433C",green:"#3F5232",red:"#93433C",blue:"#2C3944",gold:"#9C7B33",hoverRow:"#D8C7A1",...FONTS};

export const DARK = LIGHT;

// single newsprint theme
export const T = {...LIGHT};

// Helpers — muted newspaper grade colors
export const gc = g => g>=85?"#B68D40":g>=75?T.green:g>=65?T.blue:g>=55?T.textDim:T.red;

export const gb = g => g>=85?"#B68D4015":g>=75?T.green+"12":g>=65?T.blue+"10":g>=55?"#6B656008":T.red+"0a";

export const gl = g => g>=85?"ELITE":g>=75?"GREAT":g>=65?"ABOVE AVG":g>=55?"AVG":"POOR";

export const vc = e => !e||e===0?T.textMute:e>=10e6?"#B68D40":e>=5e6?T.green:e>=2e6?T.blue:e>=5e5?T.textDim:T.textMute;

