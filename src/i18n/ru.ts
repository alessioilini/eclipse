import type { Element, Role } from '../engine/types';

// TODO(Task 1): replace these local types with imports from the engine public API.
export type ValidationCode =
  | 'DEAD_HERO' | 'NONE_ONLY_DEAD' | 'TARGET_DEAD' | 'WRONG_TARGET' | 'SKILL_FREEZE'
  | 'SKILL_SILENCE' | 'ULT_SILENCE' | 'ULT_USED' | 'ENERGY' | 'LUNA' | 'RESERVE_DEAD'
  | 'DUPLICATE_RESERVE' | 'SWAP_BANNED' | 'CARD_NOT_IN_HAND' | 'ONE_CARD';

export type BlockReason = 'dead' | 'energy' | 'luna' | 'used' | 'freeze' | 'silence' | 'banned';

export const ru = {
  common: {
    title: 'Затмение',
    soon: 'Скоро',
    back: 'Назад',
  },
  menu: {
    play: 'Играть',
    heroes: 'Героини',
    decks: 'Колоды',
    tutorial: 'Обучение',
    wins: 'Победы',
  },
  battle: {
    confirm: 'Подтвердить',
    skip: 'Пропустить',
    log: 'Журнал',
    back: 'Назад',
    surrenderConfirm: 'Сдаться? Матч будет засчитан как поражение.',
    round: 'Раунд {n}',
    actions: {
      basic: 'Атака',
      skill: 'Умение',
      ultimate: 'Ульта',
      swap: 'Смена',
    },
  },
  moon: {
    new: { name: 'Новолуние', effect: 'Dark +1 урон, Luna +2' },
    waxing: { name: 'Растущая Луна', effect: 'Лечение и щиты +1' },
    full: { name: 'Полнолуние', effect: 'Ульта за 2 Luna, Light и Star +1' },
    waning: { name: 'Убывающая Луна', effect: 'Весь урон +1, лечение −1' },
  },
  result: {
    win: 'Победа',
    loss: 'Поражение',
    draw: 'Ничья',
    again: 'Ещё раз',
    menu: 'В меню',
  },
  heroes: {
    title: 'Героини',
    locked: 'Закрыта',
    toDeck: 'В колоду',
  },
  decks: {
    title: 'Колоды',
    new: 'Новая колода',
    autoBuild: 'Собрать за меня',
    save: 'Сохранить',
    delete: 'Удалить',
    confirmDelete: 'Удалить колоду?',
    archetypes: {
      attack: 'Атака',
      defense: 'Защита',
      control: 'Контроль',
      balanced: 'Баланс',
    },
  },
  tutorial: {
    title: 'Обучение',
    retry: 'Ещё раз',
    next: 'Дальше',
  },
  errors: {
    DEAD_HERO: 'Павшая героиня не может действовать',
    NONE_ONLY_DEAD: 'Бездействовать могут только павшие героини',
    TARGET_DEAD: 'Цель уже пала',
    WRONG_TARGET: 'Нельзя выбрать эту цель',
    SKILL_FREEZE: 'Умение заморожено',
    SKILL_SILENCE: 'Умение под Молчанием',
    ULT_SILENCE: 'Ульта под Молчанием',
    ULT_USED: 'Ульта уже использована',
    ENERGY: 'Не хватает энергии',
    LUNA: 'Не хватает Luna',
    RESERVE_DEAD: 'Резервная героиня пала',
    DUPLICATE_RESERVE: 'Эта резервная героиня уже выбрана',
    SWAP_BANNED: 'Смена запрещена',
    CARD_NOT_IN_HAND: 'Этой карты нет в руке',
    ONE_CARD: 'За раунд можно сыграть только одну карту',
  } satisfies Record<ValidationCode, string>,
  blocked: {
    dead: 'Пала',
    energy: 'Не хватает энергии',
    luna: 'Не хватает Luna',
    used: 'Уже использована',
    freeze: 'Заморожено',
    silence: 'Молчание',
    banned: 'Запрещено',
  } satisfies Record<BlockReason, string>,
  deckErrors: {
    count6: 'В колоде должно быть ровно 6 героинь',
    duplicateHero: 'Героини в колоде не должны повторяться',
    starting: 'Выберите стартовую тройку',
    count12: 'В колоде должно быть ровно 12 карт',
    copies: 'Не больше 2 копий одной карты',
    legendaryCopy: 'Легендарная карта — только в одном экземпляре',
    legendaryCount: 'Слишком много легендарных карт',
    unknown: 'Колода не проходит проверку',
  },
  keyMoment: {
    bloodMoonComeback: 'Кровавая Луна: {name} вернула матч',
    topDamage: '{name} нанесла больше всех урона: {n}',
    shields: 'Щиты поглотили {n} урона',
    ultKill: 'Ульта {name} решила исход',
    rounds: 'Раундов: {n}',
  },
  elements: {
    fire: 'Огонь',
    water: 'Вода',
    wind: 'Ветер',
    light: 'Свет',
    dark: 'Тьма',
    star: 'Звезда',
  } satisfies Record<Element, string>,
  roles: {
    guardian: 'Страж',
    striker: 'Боец',
    mage: 'Маг',
    support: 'Поддержка',
  } satisfies Record<Role, string>,
} as const;

/** Replaces `{key}` placeholders; unknown keys are left untouched. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) =>
    Object.hasOwn(vars, key) ? String(vars[key]) : m,
  );
}
