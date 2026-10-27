import type { CardDef, CardId } from '../types';

// Spec §4.2. Card order follows the spec table (#1–#24).
export const CARDS: Record<CardId, CardDef> = {
  lunarDash: {
    id: 'lunarDash', name: 'Лунный рывок', rarity: 'common', cost: 1, timing: 'swift', target: 'ally',
    effects: [{ op: 'status', status: 'spd', value: 2, duration: 'thisRound' }],
    text: '+2 SPD союзнице до конца раунда.',
  },
  wardCircle: {
    id: 'wardCircle', name: 'Защитный круг', rarity: 'common', cost: 1, timing: 'reaction', target: 'ally',
    effects: [{ op: 'status', status: 'damageReduction', value: 4, duration: 'thisRound' }],
    text: 'DamageReduction 4: следующий полученный урон −4.',
  },
  fieldKit: {
    id: 'fieldKit', name: 'Полевая аптечка', rarity: 'common', cost: 1, timing: 'standard', target: 'ally',
    effects: [{ op: 'heal', amount: 4 }],
    text: 'Союзница восстанавливает 4 HP.',
  },
  unseal: {
    id: 'unseal', name: 'Снятие печати', rarity: 'common', cost: 1, timing: 'swift', target: 'ally',
    effects: [{ op: 'cleanse', count: 1 }],
    text: 'Снять 1 дебафф с союзницы.',
  },
  huntersMark: {
    id: 'huntersMark', name: 'Метка охотника', rarity: 'common', cost: 1, timing: 'swift', target: 'enemy',
    effects: [{ op: 'status', status: 'mark', duration: 'permanent' }],
    text: 'Враг получает Mark: следующий одиночный удар по нему +3.',
  },
  emergencySwap: {
    id: 'emergencySwap', name: 'Экстренная замена', rarity: 'common', cost: 1, timing: 'swift', target: 'slotAndReserve',
    effects: [{ op: 'hook', name: 'card.emergencySwap' }],
    text: 'Swap без траты действия: вышедшая выполняет Basic Attack по цели, запланированной для слота, иначе ничего.',
  },
  lunarSpark: {
    id: 'lunarSpark', name: 'Лунная искра', rarity: 'common', cost: 1, timing: 'standard', target: 'none',
    effects: [{ op: 'luna', amount: 1 }],
    text: '+1 Luna.',
  },
  breakRhythm: {
    id: 'breakRhythm', name: 'Сбить ритм', rarity: 'common', cost: 1, timing: 'swift', target: 'enemy',
    effects: [{ op: 'status', status: 'spd', value: -2, duration: 'thisRound' }],
    text: '−2 SPD врагу до конца раунда.',
  },
  piercingStrike: {
    id: 'piercingStrike', name: 'Сквозной удар', rarity: 'common', cost: 1, timing: 'swift', target: 'ally',
    effects: [{ op: 'status', status: 'pierce', value: 2, duration: 'thisRound' }],
    text: 'Следующий её удар в этом раунде +2 и игнорирует Shield.',
  },
  cover: {
    id: 'cover', name: 'Прикрытие', rarity: 'common', cost: 1, timing: 'reaction', target: 'allyAndGuardian',
    effects: [{ op: 'hook', name: 'card.cover' }],
    text: 'Следующий одиночный удар по союзнице переходит в выбранную активную Guardian.',
  },
  warCry: {
    id: 'warCry', name: 'Боевой клич', rarity: 'common', cost: 1, timing: 'swift', target: 'none',
    effects: [{ op: 'status', status: 'atk', value: 1, duration: 'thisRound', who: 'allies' }],
    text: 'Все активные союзницы +1 ATK до конца раунда.',
  },
  reserveImpulse: {
    id: 'reserveImpulse', name: 'Резервный импульс', rarity: 'common', cost: 0, timing: 'standard', target: 'none',
    effects: [{ op: 'draw', amount: 1 }],
    text: 'Взять 1 карту.',
  },
  moonTurn: {
    id: 'moonTurn', name: 'Поворот Луны', rarity: 'rare', cost: 1, timing: 'swift', target: 'none',
    effects: [{ op: 'moon', shift: 1 }],
    text: 'Луна +1 фаза.',
  },
  moonReverse: {
    id: 'moonReverse', name: 'Обратная фаза', rarity: 'rare', cost: 1, timing: 'swift', target: 'none',
    effects: [{ op: 'moon', shift: -1 }],
    text: 'Луна −1 фаза.',
  },
  dispel: {
    id: 'dispel', name: 'Рассеивание', rarity: 'rare', cost: 2, timing: 'swift', target: 'none',
    effects: [{ op: 'hook', name: 'card.dispel' }],
    text: 'Снять Shield со всех активных противников.',
  },
  healingWave: {
    id: 'healingWave', name: 'Целебная волна', rarity: 'rare', cost: 2, timing: 'standard', target: 'allies',
    effects: [{ op: 'heal', amount: 3 }],
    text: 'Все активные союзницы восстанавливают 3 HP.',
  },
  bloodPact: {
    id: 'bloodPact', name: 'Кровавая сделка', rarity: 'rare', cost: 0, timing: 'swift', target: 'ally',
    effects: [{ op: 'hook', name: 'card.bloodPact' }],
    text: 'Союзница теряет 4 HP (не ниже 1); сторона получает +2 Energy в этом раунде.',
  },
  ashTrail: {
    id: 'ashTrail', name: 'Пепельный след', rarity: 'rare', cost: 1, timing: 'standard', target: 'none',
    effects: [{ op: 'hook', name: 'card.ashTrail' }],
    text: 'Два активных противника с наибольшим HP получают Burn.',
  },
  swapBan: {
    id: 'swapBan', name: 'Запрет замены', rarity: 'rare', cost: 1, timing: 'swift', target: 'none',
    effects: [{ op: 'hook', name: 'card.swapBan' }],
    text: 'Swap-действия противника в этом раунде отменяются (героиня ничего не делает).',
  },
  deferredDeath: {
    id: 'deferredDeath', name: 'Отложенная смерть', rarity: 'epic', cost: 2, timing: 'reaction', target: 'ally',
    effects: [{ op: 'status', status: 'undying', duration: 'thisRound' }],
    text: 'Undying: HP союзницы не опускается ниже 1 от первого летального удара.',
  },
  eclipse: {
    id: 'eclipse', name: 'Затмение', rarity: 'epic', cost: 2, timing: 'swift', target: 'none',
    effects: [{ op: 'hook', name: 'card.eclipse' }],
    text: 'Луна = Новолуние; ульты обеих сторон в этом раунде стоят +1 Luna.',
  },
  sealBreak: {
    id: 'sealBreak', name: 'Разрыв печати', rarity: 'epic', cost: 2, timing: 'swift', target: 'enemy',
    effects: [{ op: 'hook', name: 'card.sealBreak' }],
    text: 'Снять Shield и все баффы с врага, затем 2 прямого урона.',
  },
  lastWord: {
    id: 'lastWord', name: 'Последнее слово', rarity: 'epic', cost: 1, timing: 'reaction', target: 'ally',
    effects: [{ op: 'hook', name: 'card.lastWord' }],
    text: 'Если она погибает в этом раунде: источник получает 4 прямого урона, сторона +1 Luna.',
  },
  rewriteFate: {
    id: 'rewriteFate', name: 'Переписать судьбу', rarity: 'legendary', cost: 3, timing: 'reaction', target: 'none',
    effects: [{ op: 'hook', name: 'card.rewriteFate' }],
    text: 'Первая смерть союзницы в этом раунде отменяется: 1 HP и немедленный обмен с первой живой героиней резерва; если резерва нет, остаётся на месте.',
  },
};

export const CARD_IDS = Object.keys(CARDS) as CardId[];
