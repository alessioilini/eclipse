import type { HeroId } from '../src/engine';

/**
 * Art prompts (spec §7). `STYLE` is the English digest of `art/style.md` and must match its STYLE block verbatim
 * (checked by `art/prompts.test.ts`). `base` is the heroine's concept sheet: look, costume and neckline, signature
 * elements, magic and hands; `portrait` and `full` add the composition plus a pose of her own, so the twelve do not
 * stand the same way. A full prompt is `STYLE + base + framing`, see `prompt()`.
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
  + 'young woman as the only subject, an attractive feminine figure with an elegant open neckline showing the upper '
  + 'chest, tasteful and refined rather than vulgar, correct human anatomy, both hands fully visible and drawn '
  + 'carefully with exactly five fingers each, fingers clearly separated and naturally proportioned, natural '
  + 'relaxed hand poses, strong recognizable silhouette. Forbidden: no text, no letters, no numbers, no logos, '
  + 'no watermark, no UI, no card frame, no chibi, no cartoon proportions, no photorealism, no nudity, '
  + 'no fetish outfits, no close-up weapons, no other characters, no extra fingers, no fused fingers, '
  + 'no deformed hands.';

const PORTRAIT =
  'Composition: bust portrait, looking at the camera, face in the upper third, head, shoulders and the neckline '
  + 'fully in frame, 85mm portrait perspective, camera at eye height, square composition with empty space around '
  + 'the head.';
const FULL =
  'Composition: full body, standing, slight turn from the camera, the whole figure in frame with empty space '
  + 'above the head and below the feet, clearly visible footwear, both hands in frame, no cropped limbs, '
  + 'no cropped signature elements, camera at chest height, vertical 2:3 composition, character centred.';

export type ArtKind = 'portrait' | 'full';
export interface HeroPrompt {
  base: string;
  portrait: string;
  full: string;
}

/** Concept sheet plus her own head pose for the portrait and body pose for the full-body art. */
const framed = (base: string, headPose: string, bodyPose: string, fullComposition = FULL): HeroPrompt => ({
  base,
  portrait: `${PORTRAIT} Pose: ${headPose}`,
  full: `${fullComposition} Pose: ${bodyPose}`,
});

/** Tali sits: a throne of clear ice instead of the standing composition. */
const TALI_FULL =
  'Composition: full body, seated sideways on a throne carved from clear ice with thin streams of water running '
  + 'down its back and armrests, the whole figure and the throne in frame with empty space above and below, '
  + 'clearly visible footwear, both hands in frame, no cropped limbs, no cropped signature elements, camera at '
  + 'chest height, vertical 2:3 composition, character centred.';

export const PROMPTS: Record<HeroId, HeroPrompt> = {
  // Fire · mage. Passive "Heat", skill "Casket of Calamities", ultimate "Forbidden Gift".
  aira: framed(
    'Character: Aira, fire mage, element fire, accent colour #ff7a45. Adult woman of about 22, slender with a '
    + 'confident relaxed posture. Refined face with a sly half-smile and slightly narrowed amber eyes with a faint '
    + 'inner glow. Long wavy crimson hair fading to amber at the tips, falling below the waist; small glowing embers '
    + 'drift through the strands and a few sparks float around her head. Costume: a deep red mage robe cut like dark '
    + 'haute couture with a deep V neckline showing the upper chest, gold thread embroidery in ember patterns, '
    + 'a high stiff collar open at the front, long sleeves with smouldering ember-lit hems, a fitted black corset '
    + 'belt with brass clasps, a long skirt with a side slit, dark heeled boots. Signature elements that must stay '
    + 'consistent in every image: 1) crimson-to-amber hair with embers; 2) glowing amber eyes; 3) a small ornate '
    + 'black lacquered casket with gold hinges floating beside her at waist height, sparks leaking from its lid; '
    + '4) smouldering hems. Magic: thin orange ember trails and slow drifting sparks, a warm orange glow on the face '
    + 'from below, no big flames, no smoke. Hands: one hand raised palm up beside the floating casket with the five '
    + 'fingers relaxed and slightly curled, the other hand hanging loosely at her side.',
    'chin slightly raised, head tilted a little to one side, a sly sideways smile, eyes half-lidded.',
    'weight on one leg with the hip pushed slightly out, head tilted back a little, one hand raised palm up beside '
    + 'the floating casket, the other arm relaxed along the body.',
  ),
  // Fire · support. Passive "Warmth", skill "Spark of Life", ultimate "From the Ashes" (revive).
  fenna: framed(
    'Character: Fenna, fire healer and support, element fire, accent colour #ff7a45. Adult woman of about 24 with a '
    + 'gentle warm presence and a kind open smile. Soft oval face, warm hazel eyes, light freckles. Shoulder-length '
    + 'wavy copper-orange hair with a phoenix-feather hairpin above one ear. Costume: a cream and soft orange healer '
    + 'dress with an off-the-shoulder open neckline showing the collarbones and upper chest, layered flowing '
    + 'skirts, a short shawl of red and gold phoenix feathers resting on her upper arms, a wide fabric belt with a '
    + 'small brass sun clasp, light sandals. Signature elements that must stay consistent: 1) copper hair with the '
    + 'phoenix-feather hairpin; 2) the red-gold feather shawl; 3) a small warm flame shaped like a tiny phoenix '
    + 'floating just above her open hands; 4) drifting grey ash flakes turning into orange sparks around her. '
    + 'Magic: a gentle warm glow, a few rising sparks, soft light on her face and chest from the flame, no large '
    + 'fire. Hands: both hands held open in front of her waist, palms up and side by side under the floating flame, '
    + 'fingers relaxed and clearly separated.',
    'head gently lowered and turned three-quarters, warm soft smile, eyes lifted to the camera.',
    'three-quarter turn, shoulders relaxed, both open hands cupped loosely in front of her waist under the flame, '
    + 'a slight gentle bow of the head, the feather shawl slipping off one shoulder.',
  ),
  // Water · guardian. Passive "Stone Water", skill "Protector", ultimate "Great Protection".
  nerisa: framed(
    'Character: Nerisa, water guardian, element water, accent colour #4cc3ff. Tall adult woman of about 27, strong '
    + 'composed build, steady protective gaze, calm serious expression. Sea-green eyes, a thick teal braid over one '
    + 'shoulder with a few wet strands. Costume: a deep blue armoured long coat with silver clasps, worn open at the '
    + 'chest over a low-cut dark undersuit that shows the upper chest, heavy grey stone pauldrons carved like river '
    + 'rocks with thin streams of flowing water running over them, stone-plated bracers, a layered blue skirt with '
    + 'a wave pattern, sturdy armoured boots. Signature elements that must stay consistent: 1) the teal braid; '
    + '2) the grey stone pauldrons with flowing water; 3) a large round stone shield with a rim of moving water '
    + 'carried on her back, seen whole and secondary, never in close-up; 4) droplets hovering around her '
    + 'shoulders. Magic: slow suspended water droplets and thin blue light reflections, no splashes, no ice. '
    + 'Hands: one hand resting on her hip, the other hanging relaxed at her side, fingers clearly separated.',
    'head held straight and level, calm steady look straight into the camera, lips closed.',
    'firm frontal stance with the feet apart, one hand on the hip, the other arm relaxed, shoulders squared, '
    + 'the shield rim visible behind one shoulder.',
  ),
  // Water · mage. Passive "Frost Depth", skill "Wave", ultimate "Tide".
  tali: framed(
    'Character: Tali, water mage, element water, accent colour #4cc3ff. Petite adult woman of about 21 with a '
    + 'playful focused expression and a light smile. Delicate face, ice-blue eyes, long wavy pale-blue hair dusted '
    + 'with tiny frost crystals that catch the light. Costume: a flowing navy and white mage robe with a deep square '
    + 'neckline showing the upper chest and a wave pattern on the hem, a sheer frosted capelet, silver wave-shaped '
    + 'clasps, a thin silver circlet with a single water-drop crystal, light boots. Signature elements that must '
    + 'stay consistent: 1) pale-blue frosted hair; 2) the sheer frosted capelet; 3) a ring of water droplets and '
    + 'tiny ice shards slowly orbiting around her waist; 4) the water-drop circlet. Magic: elegant suspended '
    + 'droplets and thin shards with cold blue glints, a subtle mist at the feet, no big waves. Hands: one hand '
    + 'resting on the armrest of her ice throne with the fingers relaxed and clearly visible, the other hand '
    + 'lightly lifting the edge of the sheer capelet, arms with correct natural anatomy, no twisted wrists.',
    'looking over her shoulder at the camera with a playful smile, one eyebrow slightly raised.',
    'playful: sitting sideways on the ice throne with her legs crossed and one foot swinging, leaning back '
    + 'against the armrest, a cheeky over-the-shoulder smile at the camera, one hand resting on the armrest, the '
    + 'other lifting the edge of the capelet, the ring of droplets orbiting the throne.',
    TALI_FULL,
  ),
  // Wind · guardian. Passive "Illusory Guard", skill "Mirror Shield", ultimate "Reflection".
  zefira: framed(
    'Character: Zefira, wind guardian, element wind, accent colour #7ee787. Adult woman of about 25, athletic and '
    + 'watchful, calm alert expression with a slight knowing look. Pale green eyes, a high silver-green ponytail '
    + 'blown gently to one side. Costume: light layered armour in white and sage green with silver edges, a fitted '
    + 'jacket open at the front over a low-cut top showing the upper chest, mirror-polished bracers, a short pleated '
    + 'skirt over leggings, light boots. Signature elements that must stay consistent: 1) the silver-green high '
    + 'ponytail; 2) mirror-polished bracers; 3) a small round mirror buckler strapped to her left forearm reflecting '
    + 'moonlight; 4) a faint translucent shimmer around her silhouette like heat haze, with a few leaves caught in '
    + 'the breeze. Magic: subtle mirror-like distortions and drifting leaves, no tornado. Hands: the left hand '
    + 'relaxed below the buckler with fingers visible, the right hand resting on her hip.',
    'head turned slightly, alert sideways glance at the camera, a faint knowing smile.',
    'side stance with the shield arm forward and low, the right hand on the hip, ponytail and leaves blown to '
    + 'one side.',
  ),
  // Wind · mage. Passive "Moon Wind", skill "Moon Gust", ultimate "Heavenly Stream".
  liraya: framed(
    'Character: Liraya, wind mage, element wind, accent colour #7ee787. Adult woman of about 23, dreamy serene '
    + 'expression and a soft smile, grey-green eyes. Very long flowing mint-white hair blown sideways by the wind, '
    + 'filling part of the frame. Costume: airy layered robes in pale green and silver with a deep V neckline '
    + 'showing the upper chest, crescent-moon ornaments, long ribbons streaming in the wind, a silver sash, delicate '
    + 'sandals. Signature elements that must stay consistent: 1) extremely long mint-white wind-blown hair; '
    + '2) streaming ribbons; 3) a small silver crescent-moon charm on a chain floating in front of her; 4) crescent '
    + 'ornaments on the robe. Magic: thin pale-green wind lines and drifting petals, a soft glow around the crescent '
    + 'charm. Hands: both arms open slightly away from the body with the palms turned outward, fingers relaxed and '
    + 'clearly separated.',
    'face turned to the camera with the hair streaming across one cheek, eyes soft and dreamy, lips parted slightly.',
    'body turned almost in profile with the hair and ribbons streaming behind, face turned toward the camera, '
    + 'both arms open with the palms outward, one foot slightly raised as if drifting.',
  ),
  // Light · guardian. Passive "Light of Protection", skill "Bastion", ultimate "Unshaken".
  aurora: framed(
    'Character: Aurora, light guardian, element light, accent colour #ffe08a. Tall sturdy adult woman of about 28, '
    + 'unshakeable gentle expression, warm gold eyes, golden blonde hair in a crown braid. Costume: white and gold '
    + 'plate armour with elegant layered construction and a sweetheart-cut breastplate that leaves the upper chest '
    + 'open, a sunburst emblem on the breastplate, a white tabard with gold trim, fingerless white gloves with gold '
    + 'bracers, heavy white boots. Signature elements that must stay consistent: 1) the crown braid; 2) the sunburst '
    + 'breastplate; 3) a large white tower shield with gold edges standing behind her shoulder, seen whole and '
    + 'secondary; 4) a soft halo of warm light behind her head. Magic: a calm golden glow and small floating light '
    + 'motes, no lens flares. Hands: one hand resting flat on the rim of the shield, the other hanging relaxed, '
    + 'fingers visible and clearly separated.',
    'head held high and straight, gentle unshakeable look into the camera, a calm closed-lip smile.',
    'wide steady stance, one hand resting on the rim of the tower shield beside her, the other arm hanging '
    + 'relaxed, the halo glowing behind the crown braid.',
  ),
  // Light · striker. Passive "Pursuit", skill "Breaker", ultimate "Verdict".
  justina: framed(
    'Character: Justina, light striker, element light, accent colour #ffe08a. Adult woman of about 26, sharp-eyed '
    + 'and stern, determined controlled expression. Short platinum-blonde hair with a side fringe, piercing amber '
    + 'eyes. Costume: a fitted white and gold coat of a judge-knight with a high collar, worn open over a low-cut '
    + 'top that shows the upper chest, a small balance-scales emblem on the chest, fingerless gloves with gold '
    + 'bracers glowing with soft light, a short white half-cape over one shoulder, dark fitted trousers, white boots '
    + 'with gold details. Signature elements that must stay consistent: 1) short platinum hair; 2) the balance-scales '
    + 'emblem; 3) the glowing gold bracers; 4) the short white half-cape. Magic: thin golden light lines along the '
    + 'bracers and a few floating glyphs of light. Hands: both hands relaxed at her sides with the fingers clearly '
    + 'separated.',
    'head turned a few degrees, stern direct stare into the camera, jaw set, no smile.',
    'mid-step walking toward the camera, one foot forward, hands relaxed at her sides, the half-cape swinging '
    + 'back, chin slightly down.',
  ),
  // Dark · mage. Passive "Blight", skill "Dark Seal", ultimate "Fallen".
  nokta: framed(
    'Character: Nokta, dark mage, element dark, accent colour #b48cff. Adult woman of about 27, mysterious cool '
    + 'aloof expression, calm and overwhelmingly confident, majestic rather than demonic. Long straight black-violet '
    + 'hair with a single pale streak, glowing violet eyes, fair skin a shade paler than the others. Costume: dark '
    + 'violet robes covered in faint silver sigils, a fitted bodice with a deep plunging neckline showing the upper '
    + 'chest, black feather trim on the shoulders like folded fallen wings, fitted sleeves, dark boots. Signature '
    + 'elements that must stay consistent: 1) black-violet hair with the pale streak; 2) the black feather shoulder '
    + 'trim; 3) a glowing purple seal circle with runes hovering beside her open hand; 4) silver sigils on the robe. '
    + 'Magic: violet-black particles, thin lines of light, a few floating broken glyphs, no fire, no smoke, no horns, '
    + 'no wings. Hands: one hand held out to the side with the palm open under the floating seal, five fingers '
    + 'relaxed, the other hand hanging loosely.',
    'head slightly lowered, eyes raised to the camera under the lashes, cool aloof expression, lips closed.',
    'perfectly still regal stance, feet together, one hand held out to the side with the seal circle glowing above '
    + 'the open palm, the other arm relaxed, head slightly lowered with the eyes raised.',
  ),
  // Dark · striker. Passive "Rage", skill "Blood Strike", ultimate "Ruin".
  kira: framed(
    'Character: Kira, dark striker, element dark, accent colour #b48cff. Adult woman of about 24, fierce reckless '
    + 'grin, a thin scar across one cheek, crimson-violet eyes. Messy short dark purple hair. Costume: a black '
    + 'leather combat outfit with violet straps and buckles, a sleeveless top with a low scoop neckline showing the '
    + 'upper chest and an open collar, bandaged forearms with the fingers free, a torn dark scarf, fitted dark '
    + 'trousers with knee guards, heavy boots. Signature elements that must stay consistent: 1) short messy purple '
    + 'hair; 2) the cheek scar; 3) bandaged forearms; 4) a flickering dark violet aura around her forearms. Magic: '
    + 'a flickering violet aura and a few drifting dark sparks, no blood. Hands: both hands loosely open at her '
    + 'sides with the fingers clearly separated, not clenched.',
    'head cocked to one side, fierce wide grin, direct challenging stare into the camera.',
    'leaning forward slightly with a cocky tilt of the hips, arms loose at her sides with the hands open, the scarf '
    + 'blown to one side, one knee bent.',
  ),
  // Star · support. Passive "Tactician", skill "Rebuild", ultimate "Repeat".
  mira: framed(
    'Character: Mira, star tactician and support, element star, accent colour #ff9ad5. Adult woman of about 23, '
    + 'clever knowing smile, bright pink eyes, a neat pink-lavender bob with a small star hairclip. Costume: a '
    + 'fitted white blouse unbuttoned to a deep neckline showing the upper chest, with a loose pink ribbon at the '
    + 'collar, a dark blue cape lined with a glowing star chart, a high-waisted navy skirt, short boots. Signature '
    + 'elements that must stay consistent: 1) the lavender bob with the star clip; 2) the star-chart cape lining; '
    + '3) a small glowing brass astrolabe floating in front of her at chest height, its rings slowly turning; '
    + '4) the pink ribbon. Magic: soft pink star motes and thin constellation lines. Hands: one hand on her hip, '
    + 'the other raised with the index finger lightly touching the outer ring of the astrolabe, fingers clearly '
    + 'separated.',
    'head tilted with a clever knowing smile, one eyebrow raised, eyes on the camera.',
    'hip cocked to one side, the cape swept open over one shoulder showing the star-chart lining, one hand on the '
    + 'hip, the other touching the floating astrolabe.',
  ),
  // Star · striker. Passive "Impulse", skill "Comet", ultimate "Starfall".
  selena: framed(
    'Character: Selena, star striker, element star, accent colour #ff9ad5. Adult woman of about 22, energetic '
    + 'confident look and a bright smile, bright pink eyes. Long pink-white hair in a high ponytail trailing like a '
    + 'comet tail with glittering stardust. Costume: a sleek dark blue coat embroidered with silver stars, worn open '
    + 'over a fitted low-cut top showing the upper chest, shorts over leggings, light fast boots trailing stardust. '
    + 'Signature elements that must stay consistent: 1) the comet-tail ponytail; 2) silver star embroidery; '
    + '3) stardust trails from her boots and hair; 4) small falling stars among the background particles. Magic: '
    + 'glittering stardust and thin pink light streaks suggesting speed. Hands: both arms swept slightly back and '
    + 'out as if about to dash, hands open with the fingers relaxed and clearly separated.',
    'bright energetic grin, head turned quickly toward the camera with the ponytail swinging.',
    'dynamic mid-turn pose, torso twisted toward the camera, both arms swept back and out with the hands open, '
    + 'the ponytail swinging in an arc, one foot lifted off the ground.',
  ),
};

/** The full prompt for one image: style bible, concept sheet, then composition and pose. */
export function prompt(id: HeroId, kind: ArtKind): string {
  const p = PROMPTS[id];
  return `${STYLE} ${p.base} ${kind === 'portrait' ? p.portrait : p.full}`;
}

// Заметки для правок (по-русски):
// - STYLE меняется только вместе с блоком STYLE в art/style.md: тест сверяет их дословно.
// - base — концепт-лист героини: возраст и лицо, волосы, костюм с вырезом, четыре фирменных элемента (их модель
//   держит между портретом и артом в рост), магия, руки. Кадр и поза добавляются сами, их в base не писать.
// - Позы: у каждой героини свой поворот головы для портрета и своя стойка для арта в рост (третий и четвёртый
//   аргументы framed), чтобы двенадцать не стояли одинаково; пятым аргументом можно заменить сам кадр
//   (Тали сидит на ледяном троне).
// - Декольте: у всех открыта верхняя часть груди, формулировки «elegant open neckline», «tasteful» проходят
//   модерацию; наготу и фетиш STYLE запрещает.
// - Руки видны у всех: STYLE требует ровно пять пальцев, раздельные пальцы, естественные позы; в base у каждой
//   своё положение рук. Это не гарантия: негативного промпта в Images API нет, запреты пишутся словами «no …»,
//   а брак по пальцам лечится перегенерацией одной картинки (--kind full --force) или выбором из вариантов
//   (--variants N).
// - Фирменные детали из спеки: у Айры угли в волосах (embers), у Нерисы каменные наплечники (stone pauldrons).
// - Цвет акцентного света в base совпадает с токеном стихии в src/styles/tokens.css (--el-*).
// - Оружие крупным планом запрещено стилем: щит допустим только целиком и вторым планом.
// - Если лицо в арте в рост не совпало с портретом, перегенерировать: npm run art -- --only <id> --kind full --force.
// - Если не нравится портрет, перегенерировать его и затем арт в рост (он берёт портрет как референс).
// - Качество для финального прогона: --quality high (руки и металл заметно чище, чем на medium).
