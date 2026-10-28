import type { HeroId } from '../src/engine';

/**
 * Art prompts (spec §7). `STYLE` is the English digest of `art/style.md` and must match its STYLE block verbatim
 * (checked by `art/prompts.test.ts`). `base` is the heroine's concept sheet: look, costume, signature elements,
 * magic and hands; `portrait` and `full` add the composition. A full prompt is `STYLE + base + framing`, see `prompt()`.
 */
export const STYLE =
  'Premium anime dark-fantasy key art for a collectible mobile RPG, in the style of high-end Japanese and Korean '
  + 'gacha splash art: sophisticated semi-realistic rendering, controlled anime proportions, beautiful clean facial '
  + 'rendering, sharp expressive eyes, highly detailed materials, elegant fabric, realistic metal reflections, '
  + 'extremely polished professional concept art. Night setting: soft painted moonlight key light from the top-left, '
  + 'cool blue-violet shadows, a very subtle rim light in the element colour from behind, detailed face lighting, '
  + 'strong separation between hair, outfit and background. Minimal premium studio-like background: smooth dark '
  + 'gradient from deep navy #0b0e1f to #161a33 with a few softly glowing atmospheric particles, no landscape, '
  + 'no interior, nothing that competes with the character. One consistent palette for the whole roster: warm fair '
  + 'skin with a light blush, thin dark plum line art, painterly shading without hard cel-shading. A single adult '
  + 'young woman as the only subject, correct human anatomy, anatomically correct hands with exactly five fingers '
  + 'each, hands kept simple: relaxed, partly hidden in sleeves or behind the body, never spread or gesturing, '
  + 'strong recognizable silhouette. Forbidden: no text, no letters, '
  + 'no numbers, no logos, no watermark, no UI, no card frame, no chibi, no cartoon proportions, no photorealism, '
  + 'no revealing outfits, no close-up weapons, no other characters.';

const PORTRAIT =
  'Composition: bust portrait, looking at the camera, face in the upper third, head and shoulders fully in frame, '
  + '85mm portrait perspective, camera at eye height, square composition with empty space around the head.';
const FULL =
  'Composition: full body, standing, slight turn of about 20 degrees from the camera, one leg slightly forward, '
  + 'relaxed but confident pose, the whole figure in frame with empty space above the head and below the feet, '
  + 'clearly visible footwear, no cropped limbs, no cropped signature elements, camera at chest height, '
  + 'vertical 2:3 composition, character centred.';

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
    'Character: Aira, fire mage, element fire, accent colour #ff7a45. Adult woman of about 22, slender, '
    + 'with a confident relaxed posture. Refined face with a sly half-smile and slightly narrowed amber eyes with a '
    + 'faint inner glow. Long wavy crimson hair fading to amber at the tips, falling below the waist; small glowing '
    + 'embers drift through the strands and a few sparks float around her head. Costume: a deep red mage robe cut '
    + 'like dark haute couture, gold thread embroidery in ember patterns, a high stiff collar, long sleeves with '
    + 'smouldering ember-lit hems, a fitted black corset belt with brass clasps, dark boots. Signature elements '
    + 'that must stay consistent in every image: 1) crimson-to-amber hair with embers; 2) glowing amber eyes; '
    + '3) a small ornate black lacquered casket with gold hinges floating beside her at waist height, sparks leaking '
    + 'from its lid; 4) smouldering hems. Magic: thin orange ember trails and slow drifting sparks, a warm orange '
    + 'glow on the face from below, no big flames, no smoke. Hands: hidden in her wide sleeves, at most the fingertips of one relaxed hand showing, '
    + 'never clutching anything.',
  ),
  // Fire · support. Passive "Warmth", skill "Spark of Life", ultimate "From the Ashes" (revive).
  fenna: framed(
    'Character: Fenna, fire healer and support, element fire, accent colour #ff7a45. Adult woman of about 24 with a '
    + 'gentle warm presence and a kind open smile. Soft oval face, warm hazel eyes, light freckles. Shoulder-length '
    + 'wavy copper-orange hair with a phoenix-feather hairpin above one ear. Costume: a cream and soft orange healer '
    + 'dress with layered flowing skirts, a short shawl of red and gold phoenix feathers over the shoulders, a wide '
    + 'fabric belt with a small brass sun clasp, light sandals. Signature elements that must stay consistent: '
    + '1) copper hair with the phoenix-feather hairpin; 2) the red-gold feather shawl; 3) a small warm flame shaped '
    + 'like a tiny phoenix floating in front of her chest; 4) drifting grey ash flakes turning into orange sparks '
    + 'around her. Magic: a gentle warm glow, a few rising sparks, soft light on her face from the flame, no large '
    + 'fire. Hands: folded loosely in her wide sleeves or open in a calm welcoming gesture.',
  ),
  // Water · guardian. Passive "Stone Water", skill "Protector", ultimate "Great Protection".
  nerisa: framed(
    'Character: Nerisa, water guardian, element water, accent colour #4cc3ff. Tall adult woman of about 27, strong '
    + 'composed build, steady protective gaze, calm serious expression. Sea-green eyes, a thick teal braid over one '
    + 'shoulder with a few wet strands. Costume: a deep blue armoured long coat with silver clasps over a dark '
    + 'undersuit, heavy grey stone pauldrons carved like river rocks with thin streams of flowing water running over '
    + 'them, stone-plated bracers, a layered blue skirt with a wave pattern, sturdy armoured boots. Signature '
    + 'elements that must stay consistent: 1) the teal braid; 2) the grey stone pauldrons with flowing water; '
    + '3) a large round stone shield with a rim of moving water carried on her back, seen whole and secondary, '
    + 'never in close-up; 4) droplets hovering around her shoulders. Magic: slow suspended water droplets and thin '
    + 'blue light reflections, no splashes, no ice. Hands: relaxed, one resting on her belt.',
  ),
  // Water · mage. Passive "Frost Depth", skill "Wave", ultimate "Tide".
  tali: framed(
    'Character: Tali, water mage, element water, accent colour #4cc3ff. Petite adult woman of about 21 with a '
    + 'playful focused expression and a light smile. Delicate face, ice-blue eyes, long wavy pale-blue hair dusted '
    + 'with tiny frost crystals that catch the light. Costume: a flowing navy and white mage robe with a wave '
    + 'pattern on the hem, a sheer frosted capelet, silver wave-shaped clasps, a thin silver circlet with a single '
    + 'water-drop crystal, light boots. Signature elements that must stay consistent: 1) pale-blue frosted hair; '
    + '2) the sheer frosted capelet; 3) a ring of water droplets and tiny ice shards slowly orbiting around her; '
    + '4) the water-drop circlet. Magic: elegant suspended droplets and thin shards with cold blue glints, a subtle '
    + 'mist at the feet, no big waves. Hands: hidden in wide sleeves or one hand lightly raised with open relaxed '
    + 'fingers.',
  ),
  // Wind · guardian. Passive "Illusory Guard", skill "Mirror Shield", ultimate "Reflection".
  zefira: framed(
    'Character: Zefira, wind guardian, element wind, accent colour #7ee787. Adult woman of about 25, athletic and '
    + 'watchful, calm alert expression with a slight knowing look. Pale green eyes, a high silver-green ponytail '
    + 'blown gently to one side. Costume: light layered armour in white and sage green with silver edges, a fitted '
    + 'jacket, mirror-polished bracers, a short pleated skirt over leggings, light boots. Signature elements that '
    + 'must stay consistent: 1) the silver-green high ponytail; 2) mirror-polished bracers; 3) a small round mirror '
    + 'buckler on her left forearm reflecting moonlight; 4) a faint translucent shimmer around her silhouette like '
    + 'heat haze, with a few leaves caught in the breeze. Magic: subtle mirror-like distortions and drifting '
    + 'leaves, no tornado. Hands: relaxed, the shield arm lowered naturally.',
  ),
  // Wind · mage. Passive "Moon Wind", skill "Moon Gust", ultimate "Heavenly Stream".
  liraya: framed(
    'Character: Liraya, wind mage, element wind, accent colour #7ee787. Adult woman of about 23, dreamy serene '
    + 'expression and a soft smile, grey-green eyes. Very long flowing mint-white hair blown sideways by the wind, '
    + 'filling part of the frame. Costume: airy layered robes in pale green and silver with crescent-moon '
    + 'ornaments, long ribbons streaming in the wind, a silver sash, delicate sandals. Signature elements that must '
    + 'stay consistent: 1) extremely long mint-white wind-blown hair; 2) streaming ribbons; 3) a small silver '
    + 'crescent-moon charm on a chain floating in front of her; 4) crescent ornaments on the robe. Magic: thin '
    + 'pale-green wind lines and drifting petals, a soft glow around the crescent charm. Hands: open and relaxed, '
    + 'palms slightly turned outward.',
  ),
  // Light · guardian. Passive "Light of Protection", skill "Bastion", ultimate "Unshaken".
  aurora: framed(
    'Character: Aurora, light guardian, element light, accent colour #ffe08a. Tall sturdy adult woman of about 28, '
    + 'unshakeable gentle expression, warm gold eyes, golden blonde hair in a crown braid. Costume: white and gold '
    + 'plate armour with elegant layered construction, a sunburst emblem on the breastplate, a white tabard with '
    + 'gold trim, armoured gauntlets, heavy white boots. Signature elements that must stay consistent: 1) the crown '
    + 'braid; 2) the sunburst breastplate; 3) a large white tower shield with gold edges standing behind her '
    + 'shoulder, seen whole and secondary; 4) a soft halo of warm light behind her head. Magic: a calm golden glow '
    + 'and small floating light motes, no lens flares. Hands: relaxed, one resting on the shield edge.',
  ),
  // Light · striker. Passive "Pursuit", skill "Breaker", ultimate "Verdict".
  justina: framed(
    'Character: Justina, light striker, element light, accent colour #ffe08a. Adult woman of about 26, sharp-eyed '
    + 'and stern, determined controlled expression. Short platinum-blonde hair with a side fringe, piercing amber '
    + 'eyes. Costume: a fitted white and gold coat of a judge-knight with a high collar, a small balance-scales '
    + 'emblem on the chest, armoured gauntlets glowing with soft light, a short white half-cape over one shoulder, '
    + 'dark fitted trousers, white boots with gold details. Signature elements that must stay consistent: 1) short '
    + 'platinum hair; 2) the balance-scales emblem; 3) the glowing gauntlets; 4) the short white half-cape. Magic: '
    + 'thin golden light lines along the gauntlets and a few floating glyphs of light. Hands: relaxed at her sides '
    + 'in the glowing gauntlets, fingers clearly separated.',
  ),
  // Dark · mage. Passive "Blight", skill "Dark Seal", ultimate "Fallen".
  nokta: framed(
    'Character: Nokta, dark mage, element dark, accent colour #b48cff. Adult woman of about 27, mysterious cool '
    + 'aloof expression, calm and overwhelmingly confident, majestic rather than demonic. Long straight black-violet '
    + 'hair with a single pale streak, glowing violet eyes, fair skin a shade paler than the others. Costume: dark '
    + 'violet robes covered in faint silver sigils, a fitted bodice, black feather trim on the shoulders like '
    + 'folded fallen wings, long sleeves, dark boots. Signature elements that must stay consistent: 1) black-violet '
    + 'hair with the pale streak; 2) the black feather shoulder trim; 3) a glowing purple seal circle with runes '
    + 'hovering beside her shoulder; 4) silver sigils on the robe. Magic: violet-black particles, thin lines of '
    + 'light, a few floating broken glyphs, no fire, no smoke, no horns, no wings. Hands: hidden in her long sleeves '
    + 'or one hand relaxed and open.',
  ),
  // Dark · striker. Passive "Rage", skill "Blood Strike", ultimate "Ruin".
  kira: framed(
    'Character: Kira, dark striker, element dark, accent colour #b48cff. Adult woman of about 24, fierce reckless '
    + 'grin, a thin scar across one cheek, crimson-violet eyes. Messy short dark purple hair. Costume: a black '
    + 'leather combat outfit with violet straps and buckles, a sleeveless top with a high collar, bandaged forearms '
    + 'and knuckles, a torn dark scarf, fitted dark trousers with knee guards, heavy boots. Signature elements that '
    + 'must stay consistent: 1) short messy purple hair; 2) the cheek scar; 3) bandaged forearms; 4) a flickering '
    + 'dark violet aura around her hands. Magic: a flickering violet aura and a few drifting dark sparks, no blood. '
    + 'Hands: relaxed and slightly open at her sides, fingers clearly visible, not clenched fists.',
  ),
  // Star · support. Passive "Tactician", skill "Rebuild", ultimate "Repeat".
  mira: framed(
    'Character: Mira, star tactician and support, element star, accent colour #ff9ad5. Adult woman of about 23, '
    + 'clever knowing smile, bright pink eyes, a neat pink-lavender bob with a small star hairclip. Costume: a fitted '
    + 'white blouse with a pink ribbon at the collar, a dark blue cape lined with a glowing star chart, a '
    + 'high-waisted navy skirt, short boots. Signature elements that must stay consistent: 1) the lavender bob with '
    + 'the star clip; 2) the star-chart cape lining; 3) a small glowing brass astrolabe floating in front of her at '
    + 'chest height, its rings slowly turning; 4) the pink ribbon. Magic: soft pink star motes and thin '
    + 'constellation lines. Hands: relaxed, one hand lightly gesturing toward the astrolabe with open fingers.',
  ),
  // Star · striker. Passive "Impulse", skill "Comet", ultimate "Starfall".
  selena: framed(
    'Character: Selena, star striker, element star, accent colour #ff9ad5. Adult woman of about 22, energetic '
    + 'confident look and a bright smile, bright pink eyes. Long pink-white hair in a high ponytail trailing like a '
    + 'comet tail with glittering stardust. Costume: a sleek dark blue coat embroidered with silver stars, a fitted '
    + 'top, shorts over leggings, light fast boots trailing stardust. Signature elements that must stay consistent: '
    + '1) the comet-tail ponytail; 2) silver star embroidery; 3) stardust trails from her boots and hair; 4) small '
    + 'falling stars among the background particles. Magic: glittering stardust and thin pink light streaks '
    + 'suggesting speed. Hands: relaxed and open, arms slightly away from the body.',
  ),
};

/** The full prompt for one image: style bible, concept sheet, then composition. */
export function prompt(id: HeroId, kind: ArtKind): string {
  const p = PROMPTS[id];
  return `${STYLE} ${p.base} ${kind === 'portrait' ? p.portrait : p.full}`;
}

// Заметки для правок (по-русски):
// - STYLE меняется только вместе с блоком STYLE в art/style.md: тест сверяет их дословно.
// - base — концепт-лист героини: возраст и лицо, волосы, костюм, четыре фирменных элемента (их модель держит
//   между портретом и артом в рост), магия, руки. Кадр добавляется сам, его в base не писать.
// - Фирменные детали из спеки: у Айры угли в волосах (embers), у Нерисы каменные наплечники (stone pauldrons).
// - Цвет акцентного света в base совпадает с токеном стихии в src/styles/tokens.css (--el-*).
// - Руки: STYLE требует пять пальцев и простые расслабленные позы; предметы в base парят рядом, а не зажаты в руке.
//   Негативного промпта в Images API нет, поэтому запреты пишутся словами «no …» прямо в тексте.
// - Оружие крупным планом запрещено стилем: щит допустим только целиком и вторым планом.
// - Если лицо в арте в рост не совпало с портретом, перегенерировать: npm run art -- --only <id> --kind full --force.
// - Если не нравится портрет, перегенерировать его и затем арт в рост (он берёт портрет как референс).
// - Качество для финального прогона: --quality high (руки и металл заметно чище, чем на medium).
