import type { HeroId } from '../src/engine';

/**
 * Art prompts (spec §7). `STYLE` is the English digest of `art/style.md` and must match its STYLE block verbatim
 * (checked by `art/prompts.test.ts`). `base` is the heroine's look and costume; `portrait` and `full` add the framing.
 * A full prompt is `STYLE + base + framing`, see `prompt()`.
 */
export const STYLE =
  'Night anime fantasy illustration, semi-realistic proportions, soft painted moonlight from the top-left with cool '
  + 'blue-violet shadows, dark gradient background from deep navy #0b0e1f to #161a33 with a few softly glowing '
  + 'floating particles, accent rim light in the element colour on the hair and clothes, one consistent palette for '
  + 'all characters: warm fair skin with a light blush and thin dark plum line art, painterly shading, a single young '
  + 'woman as the only subject, no text, no letters, no logos, no watermark, no frame, no close-up weapons.';

const PORTRAIT = 'bust portrait, looking at the camera, face in the upper third.';
const FULL = 'full body, standing, slight turn, the whole figure in frame with space above the head and below the feet.';

export type ArtKind = 'portrait' | 'full';
export interface HeroPrompt {
  base: string;
  portrait: string;
  full: string;
}

const framed = (base: string): HeroPrompt => ({ base, portrait: PORTRAIT, full: FULL });

export const PROMPTS: Record<HeroId, HeroPrompt> = {
  // Fire · mage. Passive "Heat", skill "Casket of Calamities", ultimate "Forbidden Gift".
  aira: framed(
    'Element fire, orange accent light #ff7a45. A fire mage in her early twenties with long wavy crimson hair '
    + 'fading to amber at the tips, small glowing embers drifting in her hair, amber eyes with a faint inner glow, '
    + 'a sly half-smile. Dark red mage robe with gold embroidery and smouldering ember-lit hems, a high collar, '
    + 'a small ornate black lacquered casket held in one hand with sparks leaking from its lid.',
  ),
  // Fire · support. Passive "Warmth", skill "Spark of Life", ultimate "From the Ashes" (revive).
  fenna: framed(
    'Element fire, orange accent light #ff7a45. A gentle healer with shoulder-length wavy copper-orange hair and '
    + 'a phoenix-feather hairpin, warm hazel eyes, a kind smile. Cream and soft orange healer dress with a short '
    + 'shawl of red and gold phoenix feathers, a small warm flame floating above her cupped palm, '
    + 'a few drifting ash flakes turning into sparks.',
  ),
  // Water · guardian. Passive "Stone Water", skill "Protector", ultimate "Great Protection".
  nerisa: framed(
    'Element water, sky-blue accent light #4cc3ff. A tall composed guardian with a thick teal braid over one '
    + 'shoulder, sea-green eyes, a steady protective gaze. Heavy grey stone pauldrons veined with thin streams '
    + 'of flowing water, a deep blue armoured coat with silver clasps, a round stone shield with a water rim '
    + 'resting on her back, droplets hovering around her shoulders.',
  ),
  // Water · mage. Passive "Frost Depth", skill "Wave", ultimate "Tide".
  tali: framed(
    'Element water, sky-blue accent light #4cc3ff. A petite water mage with long wavy pale-blue hair dusted with '
    + 'frost crystals, ice-blue eyes, a playful focused look. Flowing navy and white robe with a wave pattern on '
    + 'the hem, a sheer frosted capelet, a ring of water droplets and tiny ice shards circling one raised hand.',
  ),
  // Wind · guardian. Passive "Illusory Guard", skill "Mirror Shield", ultimate "Reflection".
  zefira: framed(
    'Element wind, green accent light #7ee787. A watchful guardian with a high silver-green ponytail, pale green '
    + 'eyes, a calm alert expression. Light layered armour in white and sage, mirror-polished bracers, '
    + 'a small round mirror buckler on her forearm reflecting moonlight, a faint translucent shimmer around her '
    + 'silhouette like a heat haze, leaves caught in a breeze.',
  ),
  // Wind · mage. Passive "Moon Wind", skill "Moon Gust", ultimate "Heavenly Stream".
  liraya: framed(
    'Element wind, green accent light #7ee787. A dreamy wind mage with very long flowing mint-white hair blown '
    + 'sideways by the wind, grey-green eyes, a soft serene smile. Airy layered robes in pale green and silver '
    + 'with crescent moon ornaments, long ribbons streaming in the wind, a small crescent moon charm on a chain.',
  ),
  // Light · guardian. Passive "Light of Protection", skill "Bastion", ultimate "Unshaken".
  aurora: framed(
    'Element light, golden accent light #ffe08a. A tall sturdy guardian with golden blonde hair in a crown braid, '
    + 'warm gold eyes, an unshakeable gentle expression. White and gold plate armour with a sunburst emblem on the '
    + 'breastplate, a large white tower shield standing behind her shoulder, a soft halo of light around her head.',
  ),
  // Light · striker. Passive "Pursuit", skill "Breaker", ultimate "Verdict".
  justina: framed(
    'Element light, golden accent light #ffe08a. A sharp-eyed striker with short platinum-blonde hair and a side '
    + 'fringe, piercing amber eyes, a stern determined look. A fitted white and gold coat of a judge-knight, '
    + 'a small balance-scales emblem on her chest, armoured gauntlets glowing with light, a short white half-cape.',
  ),
  // Dark · mage. Passive "Blight", skill "Dark Seal", ultimate "Fallen".
  nokta: framed(
    'Element dark, violet accent light #b48cff. A mysterious dark mage with long straight black-violet hair with '
    + 'a single pale streak, glowing violet eyes, a cool aloof expression. Dark violet robes covered in faint '
    + 'silver sigils, black feather trim on the shoulders like folded fallen wings, '
    + 'a glowing purple seal circle hovering beside her open hand.',
  ),
  // Dark · striker. Passive "Rage", skill "Blood Strike", ultimate "Ruin".
  kira: framed(
    'Element dark, violet accent light #b48cff. A fierce striker with messy short dark purple hair, crimson-violet '
    + 'eyes, a reckless grin and a thin scar across one cheek. Black leather combat outfit with violet straps, '
    + 'bandaged forearms and knuckles, a torn dark scarf, a flickering dark violet aura around her fists.',
  ),
  // Star · support. Passive "Tactician", skill "Rebuild", ultimate "Repeat".
  mira: framed(
    'Element star, pink accent light #ff9ad5. A clever tactician with a neat pink-lavender bob and a small star '
    + 'hairclip, bright pink eyes, a knowing smile. A deep blue cape lined with a star chart, a fitted white '
    + 'blouse with a pink ribbon, a small glowing brass astrolabe held in her hands.',
  ),
  // Star · striker. Passive "Impulse", skill "Comet", ultimate "Starfall".
  selena: framed(
    'Element star, pink accent light #ff9ad5. A swift striker with long pink-white hair in a high ponytail '
    + 'trailing like a comet tail, bright pink eyes, an energetic confident look. A sleek dark blue coat '
    + 'embroidered with silver stars, light boots trailing glittering stardust, small falling stars in the background.',
  ),
};

/** The full prompt for one image: style bible, look, then framing. */
export function prompt(id: HeroId, kind: ArtKind): string {
  const p = PROMPTS[id];
  return `${STYLE} ${p.base} ${kind === 'portrait' ? p.portrait : p.full}`;
}

// Заметки для правок (по-русски):
// - STYLE меняется только вместе с блоком STYLE в art/style.md: тест сверяет их дословно.
// - base описывает только внешность и костюм; кадр (портрет/в рост) добавляется сам, его в base не писать.
// - Фирменные детали из спеки: у Айры угли в волосах, у Нерисы каменные наплечники — их не убирать.
// - Цвет акцентного света в base совпадает с токеном стихии в src/styles/tokens.css (--el-*).
// - Оружие крупным планом запрещено стилем: посох/щит допустимы только целиком и вторым планом.
// - Если лицо в арте в рост не совпало с портретом, перегенерировать: npm run art -- --only <id> --kind full --force.
// - Если не нравится портрет, перегенерировать его и затем арт в рост (он берёт портрет как референс).
