import type { HeroDef, HeroId } from '../types';

// Spec §4.1. Basic attack is not stored here: the engine adds it.
// Ultimate cost = 2 Energy (spec §2.3); the Luna cost is computed by the validator (ultimateLunaCost).
// Hero rarity is not specified in the spec; 'rare' is a placeholder (it has no effect on the engine).
export const HEROES: Record<HeroId, HeroDef> = {
  aira: {
    id: 'aira', name: 'Айра', element: 'fire', role: 'mage', rarity: 'rare', hp: 20, atk: 7, spd: 6,
    passive: {
      name: 'Жар',
      text: 'Каждый тик Burn по противникам наносит +1.',
      triggers: [{ on: 'burnTick', hook: 'aira.burnBonus' }],
    },
    skill: {
      name: 'Ларец бедствий', cost: 2, target: 'enemies',
      effects: [{ op: 'damage', mod: 0.9, aoe: true }, { op: 'hook', name: 'aira.burnMaxAtk' }],
    },
    ultimate: {
      name: 'Запретный дар', cost: 2, target: 'enemies',
      effects: [{ op: 'damage', mod: 1.2, aoe: true }, { op: 'hook', name: 'aira.detonate' }],
    },
  },
  fenna: {
    id: 'fenna', name: 'Фенна', element: 'fire', role: 'support', rarity: 'rare', hp: 24, atk: 4, spd: 7,
    passive: {
      name: 'Тепло',
      text: 'Первое лечение Фенны в раунде +2.',
      triggers: [{ on: 'onHeal', once: 'round', hook: 'fenna.firstHeal' }],
    },
    skill: {
      name: 'Искра жизни', cost: 1, target: 'ally',
      effects: [{ op: 'heal', amount: 8, when: { kind: 'targetHpBelow', pct: 50 }, elseAmount: 6 }],
    },
    ultimate: {
      name: 'Из пепла', cost: 2, target: 'none',
      effects: [{ op: 'hook', name: 'fenna.revive' }],
    },
  },
  nerisa: {
    id: 'nerisa', name: 'Нериса', element: 'water', role: 'guardian', rarity: 'rare', hp: 31, atk: 4, spd: 4,
    passive: {
      name: 'Каменная вода',
      text: 'Первый полученный Нерисой урон в раунде −3.',
      triggers: [{ on: 'beforeTakeDamage', once: 'round', hook: 'nerisa.firstHit' }],
    },
    skill: {
      name: 'Защитница', cost: 1, target: 'ally',
      effects: [{ op: 'shield', amount: 4, who: 'target' }, { op: 'hook', name: 'nerisa.guard' }],
    },
    ultimate: {
      name: 'Великая защита', cost: 2, target: 'allies',
      effects: [{ op: 'shield', amount: 6, who: 'allies' }, { op: 'cleanse', count: 1, who: 'allies' }],
    },
  },
  tali: {
    id: 'tali', name: 'Тали', element: 'water', role: 'mage', rarity: 'rare', hp: 20, atk: 6, spd: 7,
    passive: {
      name: 'Морозная глубина',
      text: 'Первый удар Тали в раунде по цели с Soak накладывает Freeze.',
      triggers: [{ on: 'afterDealDamage', once: 'round', hook: 'tali.freezeSoaked' }],
    },
    skill: {
      name: 'Волна', cost: 1, target: 'enemy',
      effects: [{ op: 'damage', mod: 1.1 }, { op: 'status', status: 'soak', duration: 'nextRound' }],
    },
    ultimate: {
      name: 'Прилив', cost: 2, target: 'enemies',
      effects: [{ op: 'damage', mod: 0.9, aoe: true }, { op: 'hook', name: 'tali.tide' }],
    },
  },
  zefira: {
    id: 'zefira', name: 'Зефира', element: 'wind', role: 'guardian', rarity: 'rare', hp: 29, atk: 5, spd: 7,
    passive: {
      name: 'Иллюзорный страж',
      text: 'Первый одиночный удар по другой союзнице в раунде перенаправляется в Зефиру и наносит ей −2.',
      triggers: [{ on: 'beforeTakeDamage', once: 'round', hook: 'zefira.intercept' }],
    },
    skill: {
      name: 'Зеркальный щит', cost: 1, target: 'ally',
      effects: [{ op: 'shield', amount: 5, who: 'target' }, { op: 'hook', name: 'zefira.mirror' }],
    },
    ultimate: {
      name: 'Отражение', cost: 2, target: 'none',
      effects: [{ op: 'hook', name: 'zefira.reflect' }],
    },
  },
  liraya: {
    id: 'liraya', name: 'Лирая', element: 'wind', role: 'mage', rarity: 'rare', hp: 21, atk: 6, spd: 7,
    passive: {
      name: 'Лунный ветер',
      text: 'Если в этом раунде Луна была сдвинута (картой или умением любой стороны), Лирая получает +1 ATK до конца раунда.',
      triggers: [{ on: 'onMoonShift', hook: 'liraya.moonWind' }],
    },
    skill: {
      name: 'Лунный порыв', cost: 1, target: 'enemy',
      effects: [{ op: 'damage', mod: 1.2 }, { op: 'moon', shift: 1 }],
    },
    ultimate: {
      name: 'Небесный поток', cost: 2, target: 'enemies',
      effects: [{ op: 'damage', mod: 1.0, aoe: true }, { op: 'moon', set: 'full' }],
    },
  },
  aurora: {
    id: 'aurora', name: 'Аврора', element: 'light', role: 'guardian', rarity: 'rare', hp: 32, atk: 4, spd: 5,
    passive: {
      name: 'Свет защиты',
      text: 'Пока HP Авроры выше 50%, весь урон по другим активным союзницам −1.',
      triggers: [{ on: 'beforeTakeDamage', hook: 'aurora.aegis' }],
    },
    skill: {
      name: 'Бастион', cost: 1, target: 'self',
      effects: [
        { op: 'shield', amount: 6, who: 'self' },
        { op: 'status', status: 'taunt', duration: 'nextRound', who: 'self' },
      ],
    },
    ultimate: {
      name: 'Непоколебимая', cost: 2, target: 'allies',
      effects: [{ op: 'shield', amount: 4, who: 'allies' }, { op: 'hook', name: 'aurora.unshaken' }],
    },
  },
  justina: {
    id: 'justina', name: 'Юстина', element: 'light', role: 'striker', rarity: 'rare', hp: 23, atk: 7, spd: 8,
    passive: {
      name: 'Преследование',
      text: 'Когда противник получает Shield или бафф, Юстина получает +1 SPD до конца раунда (раз в раунд).',
      triggers: [{ on: 'onEnemyBuffed', once: 'round', hook: 'justina.pursuit' }],
    },
    skill: {
      name: 'Разрушительница', cost: 1, target: 'enemy',
      effects: [{ op: 'damage', mod: 1.5, when: { kind: 'targetHasShieldOrBuff' }, elseMod: 1.2 }],
    },
    ultimate: {
      name: 'Приговор', cost: 2, target: 'enemy',
      effects: [{ op: 'damage', mod: 2.0 }, { op: 'hook', name: 'justina.verdict' }],
    },
  },
  nokta: {
    id: 'nokta', name: 'Нокта', element: 'dark', role: 'mage', rarity: 'rare', hp: 20, atk: 7, spd: 7,
    passive: {
      name: 'Порча',
      text: 'Урон Нокты по целям с Curse +1.',
      triggers: [{ on: 'beforeDealDamage', hook: 'nokta.cursedBonus' }],
    },
    skill: {
      name: 'Тёмная печать', cost: 1, target: 'enemy',
      effects: [{ op: 'damage', mod: 1.2 }, { op: 'status', status: 'curse', duration: 'permanent' }],
    },
    ultimate: {
      name: 'Падшая', cost: 2, target: 'enemies',
      effects: [{ op: 'damage', mod: 1.0, aoe: true }, { op: 'hook', name: 'nokta.fallen' }],
    },
  },
  kira: {
    id: 'kira', name: 'Кира', element: 'dark', role: 'striker', rarity: 'rare', hp: 24, atk: 7, spd: 6,
    passive: {
      name: 'Ярость',
      text: 'При HP ниже 50% урон +2.',
      triggers: [{ on: 'beforeDealDamage', hook: 'kira.rage' }],
    },
    skill: {
      name: 'Кровавый удар', cost: 1, target: 'enemy',
      effects: [{ op: 'selfHp', amount: -3 }, { op: 'damage', mod: 1.6 }],
    },
    ultimate: {
      name: 'Разрушение', cost: 2, target: 'enemy',
      effects: [{ op: 'hook', name: 'kira.ruin' }],
    },
  },
  mira: {
    id: 'mira', name: 'Мира', element: 'star', role: 'support', rarity: 'rare', hp: 24, atk: 4, spd: 9,
    passive: {
      name: 'Тактик',
      text: 'В нечётных раундах карта стороны стоит на 1 Energy меньше (не ниже 0).',
      triggers: [],
    },
    skill: {
      name: 'Перестройка', cost: 1, target: 'ally',
      effects: [{ op: 'hook', name: 'mira.rebuild' }],
    },
    ultimate: {
      name: 'Повторение', cost: 2, target: 'none',
      effects: [{ op: 'hook', name: 'mira.repeat' }],
    },
  },
  selena: {
    id: 'selena', name: 'Селена', element: 'star', role: 'striker', rarity: 'rare', hp: 22, atk: 6, spd: 9,
    passive: {
      name: 'Импульс',
      text: 'После того как сторона сыграла карту, следующий удар Селены в этом раунде +2.',
      triggers: [{ on: 'onCardPlayed', hook: 'selena.impulse' }],
    },
    skill: {
      name: 'Комета', cost: 1, target: 'enemy',
      effects: [{ op: 'damage', mod: 1.4 }],
    },
    ultimate: {
      name: 'Звездопад', cost: 2, target: 'enemy',
      effects: [{ op: 'hook', name: 'selena.starfall' }],
    },
  },
};

export const HERO_IDS = Object.keys(HEROES) as HeroId[];
