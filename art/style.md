# Стиль-библия арта «Затмения»

Двенадцать героинь рисуются как одна серия: один свет, одна палитра кожи и линий, один фон.
Этот файл — источник правды для стиля; `art/prompts.ts` держит его английскую выжимку в `STYLE`
(тест `art/prompts.test.ts` проверяет, что блок ниже и `STYLE` совпадают дословно).

## Правила

- **Жанр и уровень:** премиальный ключевой арт мобильной коллекционной RPG в духе японских и корейских
  гача-сплэшей: полуреалистичный рендер, контролируемые аниме-пропорции (без чиби и без
  гипертрофированных глаз), чистое красивое лицо, детальные материалы, ткань, металл с отражениями.
- **Свет:** мягкий рисованный лунный ключевой свет сверху-слева; тени холодные, сине-фиолетовые;
  тонкий контровой свет цвета стихии сзади; лицо освещено детально; волосы, костюм и фон читаются
  раздельно.
- **Фон:** минимальный «студийный» фон: тёмный градиент от цвета фона игры `--bg` (#0b0e1f) к чуть
  более светлому синему (#161a33), редкие светящиеся частицы. Никаких пейзажей и интерьеров: фон не
  спорит с героиней, она читается на маленькой иконке.
- **Акцент стихии:** контровой свет цвета стихии на волосах и одежде:
  огонь #ff7a45, вода #4cc3ff, ветер #7ee787, свет #ffe08a, тьма #b48cff, звёзды #ff9ad5.
- **Палитра:** единая для всех двенадцати — тёплая светлая кожа с лёгким румянцем, тонкие
  тёмно-сливовые линии контура, живописная заливка без жёсткого cel-shading.
- **Героиня:** взрослая девушка, одна в кадре, сильный узнаваемый силуэт. У каждой четыре фирменных
  элемента (волосы, деталь костюма, парящий предмет или эффект, знак стихии), которые должны совпадать
  между портретом и артом в рост и в любых будущих картинках.
- **Руки:** анатомически верные, ровно пять пальцев, простые расслабленные позы, руки видны; предметы
  парят рядом с героиней, а не зажаты в кулаке (у моделей это главный источник брака).
- **Запрещено:** текст, буквы, цифры, логотипы, водяные знаки, элементы интерфейса, рамки карточек,
  чиби и мультяшные пропорции, фотореализм, откровенные наряды, оружие крупным планом (щит допустим
  только целиком и вторым планом), другие персонажи. Негативного промпта в Images API нет, поэтому
  запреты входят в текст словами «no …».
- **Кадр:** портрет — по грудь, взгляд в камеру, лицо в верхней трети, перспектива 85 мм, камера на
  уровне глаз; в рост — стоя, поворот около 20°, одна нога чуть вперёд, вся фигура с запасом сверху и
  снизу, обувь видна, ничего не обрезано, камера на уровне груди, вертикаль 2:3 (низ кадра в игре
  перекрывается градиентом стихии).

## STYLE (английский блок для промптов)

```
Premium anime dark-fantasy key art for a collectible mobile RPG, in the style of high-end Japanese and Korean gacha splash art: sophisticated semi-realistic rendering, controlled anime proportions, beautiful clean facial rendering, sharp expressive eyes, highly detailed materials, elegant fabric, realistic metal reflections, extremely polished professional concept art. Night setting: soft painted moonlight key light from the top-left, cool blue-violet shadows, a very subtle rim light in the element colour from behind, detailed face lighting, strong separation between hair, outfit and background. Minimal premium studio-like background: smooth dark gradient from deep navy #0b0e1f to #161a33 with a few softly glowing atmospheric particles, no landscape, no interior, nothing that competes with the character. One consistent palette for the whole roster: warm fair skin with a light blush, thin dark plum line art, painterly shading without hard cel-shading. A single adult young woman as the only subject, correct human anatomy, anatomically correct hands with exactly five fingers each, clearly visible hands in relaxed natural poses, strong recognizable silhouette. Forbidden: no text, no letters, no numbers, no logos, no watermark, no UI, no card frame, no chibi, no cartoon proportions, no photorealism, no revealing outfits, no close-up weapons, no other characters.
```

## Структура промпта героини

`STYLE` + концепт-лист из `art/prompts.ts` + кадр. Концепт-лист: имя, роль и стихия с цветом акцента;
возраст, лицо и выражение; волосы; костюм; четыре фирменных элемента; магия (что именно светится и
летает, чего не должно быть); руки. Пример: Айра — багрово-янтарные волосы с угольками, янтарные
глаза, чёрный лакированный ларец парит у пояса, тлеющий подол.
