# Стиль-библия арта «Затмения»

Двенадцать героинь рисуются как одна серия: один свет, одна палитра кожи и линий, один фон.
Этот файл — источник правды для стиля; `art/prompts.ts` держит его английскую выжимку в `STYLE`
(тест `art/prompts.test.ts` проверяет, что блок ниже и `STYLE` совпадают дословно).

## Правила

- **Жанр:** ночное аниме-фэнтези. Полуреалистичные пропорции (без чиби и без гипертрофированных глаз).
- **Свет:** мягкий рисованный лунный свет сверху-слева; тени холодные, сине-фиолетовые.
- **Фон:** тёмный градиент от цвета фона игры `--bg` (#0b0e1f) к чуть более светлому синему (#161a33),
  редкие светящиеся частицы. Никаких пейзажей и интерьеров: героиня читается на маленькой иконке.
- **Акцент стихии:** контровой свет цвета стихии на волосах и одежде:
  огонь #ff7a45, вода #4cc3ff, ветер #7ee787, свет #ffe08a, тьма #b48cff, звёзды #ff9ad5.
- **Палитра:** единая для всех двенадцати — тёплая светлая кожа с лёгким румянцем, тонкие
  тёмно-сливовые линии контура, живописная заливка без жёсткого cel-shading.
- **Запрещено:** текст, буквы, логотипы, водяные знаки, рамки, оружие крупным планом
  (посох или щит допустимы только целиком и вторым планом), откровенные наряды.
- **Кадр:** портрет — по грудь, взгляд в камеру, лицо в верхней трети; в рост — стоя, лёгкий поворот,
  вся фигура в кадре с запасом сверху и снизу (низ кадра в игре перекрывается градиентом стихии).

## STYLE (английский блок для промптов)

```
Night anime fantasy illustration, semi-realistic proportions, soft painted moonlight from the top-left with cool blue-violet shadows, dark gradient background from deep navy #0b0e1f to #161a33 with a few softly glowing floating particles, accent rim light in the element colour on the hair and clothes, one consistent palette for all characters: warm fair skin with a light blush and thin dark plum line art, painterly shading, a single young woman as the only subject, no text, no letters, no logos, no watermark, no frame, no close-up weapons.
```
