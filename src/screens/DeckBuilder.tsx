import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CARDS, CARD_IDS, HEROES, HERO_IDS } from '../engine';
import type { CardId, Deck, Element, HeroId, Role } from '../engine';
import { deckIssues } from '../game/decks/validation';
import { fmt, ru } from '../i18n/ru';
import { navigate } from '../router';
import { useStore } from '../store';
import { Button } from '../ui/Button';
import { HeroArt } from '../ui/HeroArt';
import { cx } from '../ui/cx';
import styles from './DeckBuilder.module.css';
import { useAppBack } from './useAppBack';

const HERO_SLOTS = 6;
const CARD_SLOTS = 12;
const NAME_MAX = 20;
const ELEMENTS = Object.keys(ru.elements) as Element[];
const ROLES = Object.keys(ru.roles) as Role[];
const COSTS = [0, 1, 2, 3] as const;
/** Карты, двигающие Луну (спека §6.1, «карты Луны»). */
const MOON_CARDS: CardId[] = ['moonTurn', 'moonReverse', 'eclipse'];

type Draft = { name: string; deck: Deck };

/**
 * Модель конструктора: порядок героинь — стартовая тройка, затем резерв в порядке выхода, `starting` всегда [0,1,2].
 * Движок берёт актив по `starting` и резерв — остальные по порядку `heroes`, так что перестановка не меняет смысла.
 */
function normalize(deck: Deck): Deck {
  const st = deck.starting;
  const valid = st.length === 3 && new Set(st).size === 3 && st.every((i) => i >= 0 && i < deck.heroes.length);
  if (!valid) return { heroes: [...deck.heroes], starting: [0, 1, 2], cards: [...deck.cards] };
  const start = st.map((i) => deck.heroes[i]!);
  const rest = deck.heroes.filter((_, i) => !st.includes(i as Deck['starting'][number]));
  return { heroes: [...start, ...rest], starting: [0, 1, 2], cards: [...deck.cards] };
}

const same = (a: Draft, b: Draft): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Ставит `value` в слот `i`; дырки (слот за концом массива) схлопываются. */
function setAt<T>(list: T[], i: number, value: T): T[] {
  const next: (T | undefined)[] = [...list];
  next[i] = value;
  return next.filter((x): x is T => x !== undefined);
}

export function DeckBuilder({ id }: { id: string }) {
  const saved = useStore((s) => s.decks.find((d) => d.id === id));
  const unlocked = useStore((s) => s.unlocked);
  const upsertDeck = useStore((s) => s.upsertDeck);

  const [draft, setDraft] = useState<Draft | null>(() =>
    saved ? { name: saved.name, deck: normalize(saved.deck) } : null,
  );
  const [heroPicker, setHeroPicker] = useState<number | null>(null);
  const [cardPicker, setCardPicker] = useState<number | null>(null);
  const [confirmBack, setConfirmBack] = useState(false);

  useEffect(() => {
    if (!saved) navigate({ name: 'decks' });
  }, [saved]);

  const issues = useMemo(() => (draft ? deckIssues(draft.deck) : []), [draft]);

  const dirty = saved && draft ? !same(draft, { name: saved.name, deck: normalize(saved.deck) }) : false;
  const back = () => {
    if (dirty) setConfirmBack(true);
    else navigate({ name: 'decks' });
  };
  // Кнопка «Назад» платформы — тот же обработчик, что и в шапке.
  useAppBack(back);

  if (!saved || !draft) return null;

  const { deck } = draft;
  const name = draft.name.trim();
  const nameOk = name.length >= 1 && draft.name.length <= NAME_MAX;
  const canSave = issues.length === 0 && nameOk;

  const setDeck = (d: Deck) => setDraft({ ...draft, deck: d });

  const swapHeroes = (i: number, j: number) => {
    const heroes = [...deck.heroes];
    if (heroes[i] === undefined || heroes[j] === undefined) return;
    [heroes[i], heroes[j]] = [heroes[j]!, heroes[i]!];
    setDeck({ ...deck, heroes });
  };

  const save = () => {
    if (!canSave) return;
    upsertDeck({ id, name, deck });
    setDraft({ name, deck });
  };

  return (
    <main className={styles.screen}>
      <header className={styles.header}>
        <Button variant="ghost" onClick={back}>{ru.common.back}</Button>
        <input
          className={styles.name}
          aria-label={ru.decks.name}
          value={draft.name}
          maxLength={NAME_MAX}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
      </header>

      {confirmBack && (
        <div className={styles.confirm} role="alertdialog">
          <span>{ru.decks.discard}</span>
          <Button variant="danger" onClick={() => navigate({ name: 'decks' })}>{ru.decks.yes}</Button>
          <Button variant="secondary" onClick={() => setConfirmBack(false)}>{ru.decks.no}</Button>
        </div>
      )}

      <section className={styles.section}>
        <h2 className={styles.heading}>{ru.decks.heroes}</h2>
        <ol className={styles.heroes}>
          {Array.from({ length: HERO_SLOTS }, (_, i) => {
            const h = deck.heroes[i];
            return (
              <li key={i} className={cx(styles.heroRow, i === 3 && styles.reserveStart)}>
                <button
                  type="button"
                  className={styles.slot}
                  data-testid={`hero-slot-${i}`}
                  onClick={() => setHeroPicker(i)}
                >
                  <span className={cx(styles.tag, i < 3 && styles.tagStart)}>
                    {i < 3 ? ru.decks.starting : ru.decks.reserve}
                  </span>
                  {h ? (
                    <>
                      <HeroArt heroId={h} size="sm" />
                      <span className={styles.slotText}>
                        <span className={styles.slotName}>{HEROES[h].name}</span>
                        <span className={styles.slotMeta}>
                          {fmt(ru.decks.heroMeta, { element: ru.elements[HEROES[h].element], role: ru.roles[HEROES[h].role] })}
                        </span>
                      </span>
                    </>
                  ) : (
                    <span className={styles.slotMeta}>{ru.decks.emptySlot}</span>
                  )}
                </button>
                <button
                  type="button"
                  className={styles.arrow}
                  data-testid={`hero-up-${i}`}
                  aria-label={ru.decks.moveUp}
                  disabled={i === 0 || h === undefined}
                  onClick={() => swapHeroes(i, i - 1)}
                >
                  {ru.decks.up}
                </button>
                <button
                  type="button"
                  className={styles.arrow}
                  data-testid={`hero-down-${i}`}
                  aria-label={ru.decks.moveDown}
                  disabled={i === HERO_SLOTS - 1 || deck.heroes[i + 1] === undefined}
                  onClick={() => swapHeroes(i, i + 1)}
                >
                  {ru.decks.down}
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>{ru.decks.cards}</h2>
        <div className={styles.cards}>
          {Array.from({ length: CARD_SLOTS }, (_, i) => {
            const c = deck.cards[i];
            return (
              <button
                key={i}
                type="button"
                className={styles.card}
                data-testid={`card-slot-${i}`}
                onClick={() => setCardPicker(i)}
              >
                {c ? (
                  <>
                    <span className={styles.cardHead}>
                      <span className={styles.slotName}>{CARDS[c].name}</span>
                      <span className={styles.cost}>{CARDS[c].cost}</span>
                    </span>
                    <span className={styles.slotMeta}>{ru.cardTiming[CARDS[c].timing]}</span>
                  </>
                ) : (
                  <span className={styles.slotMeta}>{ru.decks.emptySlot}</span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <Summary deck={deck} />

      {issues.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.heading}>{ru.decks.errors}</h2>
          <ul className={styles.errors} data-testid="deck-errors">
            {issues.map((e) => <li key={e}>{e}</li>)}
          </ul>
        </section>
      )}

      <div className={styles.footer}>
        <Button variant="primary" size="lg" disabled={!canSave} onClick={save} testId="save-deck">
          {ru.decks.save}
        </Button>
      </div>

      {heroPicker !== null && (
        <HeroPicker
          unlocked={unlocked}
          taken={deck.heroes}
          onPick={(h) => {
            setDeck({ ...deck, heroes: setAt(deck.heroes, heroPicker, h) });
            setHeroPicker(null);
          }}
          onClose={() => setHeroPicker(null)}
        />
      )}

      {cardPicker !== null && (
        <CardPicker
          deck={deck}
          slot={cardPicker}
          issues={issues}
          onPick={(c) => {
            setDeck({ ...deck, cards: setAt(deck.cards, cardPicker, c) });
            setCardPicker(null);
          }}
          onClose={() => setCardPicker(null)}
        />
      )}
    </main>
  );
}

function Summary({ deck }: { deck: Deck }) {
  const byElement = ELEMENTS.map((e) => [e, deck.heroes.filter((h) => HEROES[h].element === e).length] as const)
    .filter(([, n]) => n > 0);
  const byRole = ROLES.map((r) => [r, deck.heroes.filter((h) => HEROES[h].role === r).length] as const);
  const curve = COSTS.map((c) => deck.cards.filter((id) => Math.min(CARDS[id].cost, 3) === c).length);
  const peak = Math.max(1, ...curve);
  const reactions = deck.cards.filter((id) => CARDS[id].timing === 'reaction').length;
  const moon = deck.cards.filter((id) => MOON_CARDS.includes(id)).length;
  return (
    <section className={styles.section} data-testid="deck-summary">
      <h2 className={styles.heading}>{ru.decks.summary}</h2>
      <div className={styles.chips}>
        {byElement.map(([e, n]) => (
          <span key={e} className={styles.stat}>
            <span className={styles.dot} style={{ background: `var(--el-${e})` }} />
            {ru.elements[e]} {n}
          </span>
        ))}
      </div>
      <div className={styles.chips}>
        {byRole.map(([r, n]) => (
          <span key={r} className={styles.stat}>{ru.roles[r]} {n}</span>
        ))}
      </div>
      <div className={styles.curve} aria-label={ru.decks.costCurve} role="group">
        {curve.map((n, c) => (
          <div key={c} className={styles.bar}>
            <span className={styles.barCount}>{n}</span>
            <span className={styles.barFill} style={{ height: `${(n / peak) * 100}%` }} />
            <span className={styles.barLabel}>{c}</span>
          </div>
        ))}
      </div>
      <div className={styles.chips}>
        <span className={styles.stat} data-testid="summary-reaction">{ru.decks.reactions}: {reactions}</span>
        <span className={styles.stat} data-testid="summary-moon">{ru.decks.moonCards}: {moon}</span>
      </div>
    </section>
  );
}

function Sheet({ title, header, children, onClose }: {
  title: string; header?: ReactNode; children: ReactNode; onClose: () => void;
}) {
  return (
    <div className={styles.sheetRoot}>
      <div className={styles.backdrop} data-testid="sheet-backdrop" onClick={onClose} />
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={title}>
        <div className={styles.sheetHead}>
          <h2 className={styles.heading}>{title}</h2>
          <Button variant="ghost" onClick={onClose}>{ru.decks.close}</Button>
        </div>
        {header}
        <div className={styles.sheetList}>{children}</div>
      </div>
    </div>
  );
}

function Chip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" className={cx(styles.chip, on && styles.chipOn)} aria-pressed={on} onClick={onClick}>
      {label}
    </button>
  );
}

function HeroPicker({ unlocked, taken, onPick, onClose }: {
  unlocked: HeroId[]; taken: HeroId[]; onPick: (h: HeroId) => void; onClose: () => void;
}) {
  const [element, setElement] = useState<Element | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const list = HERO_IDS.filter((h) => unlocked.includes(h) && !taken.includes(h)
    && (element === null || HEROES[h].element === element)
    && (role === null || HEROES[h].role === role));
  const header = (
    <>
      <div className={styles.chips}>
        {ELEMENTS.map((e) => (
          <Chip key={e} label={ru.elements[e]} on={element === e} onClick={() => setElement(element === e ? null : e)} />
        ))}
      </div>
      <div className={styles.chips}>
        {ROLES.map((r) => (
          <Chip key={r} label={ru.roles[r]} on={role === r} onClick={() => setRole(role === r ? null : r)} />
        ))}
      </div>
    </>
  );
  return (
    <Sheet title={ru.decks.pickHero} header={header} onClose={onClose}>
      {list.length === 0 && <p className={styles.slotMeta}>{ru.decks.noHeroes}</p>}
      {list.map((h) => (
        <button key={h} type="button" className={styles.item} data-testid={`pick-hero-${h}`} onClick={() => onPick(h)}>
          <HeroArt heroId={h} size="sm" />
          <span className={styles.slotText}>
            <span className={styles.slotName}>{HEROES[h].name}</span>
            <span className={styles.slotMeta}>
              {fmt(ru.decks.heroMeta, { element: ru.elements[HEROES[h].element], role: ru.roles[HEROES[h].role] })}
            </span>
          </span>
        </button>
      ))}
    </Sheet>
  );
}

function CardPicker({ deck, slot, issues, onPick, onClose }: {
  deck: Deck; slot: number; issues: string[]; onPick: (c: CardId) => void; onClose: () => void;
}) {
  return (
    <Sheet title={ru.decks.pickCard} onClose={onClose}>
      {CARD_IDS.map((c) => {
        const card = CARDS[c];
        const count = deck.cards.filter((x) => x === c).length;
        // Лимиты не дублируем: пробуем колоду с этой картой в слоте и смотрим, появились ли новые ошибки.
        const added = deckIssues({ ...deck, cards: setAt(deck.cards, slot, c) }).filter((e) => !issues.includes(e));
        const disabled = added.length > 0;
        return (
          <button
            key={c}
            type="button"
            className={cx(styles.item, disabled && styles.itemOff)}
            data-testid={`pick-card-${c}`}
            disabled={disabled}
            onClick={() => onPick(c)}
          >
            <span className={styles.cost}>{card.cost}</span>
            <span className={styles.slotText}>
              <span className={styles.slotName}>{card.name}</span>
              <span className={styles.slotMeta}>{fmt(ru.decks.cardMeta, { timing: ru.cardTiming[card.timing], text: card.text })}</span>
              {disabled && <span className={styles.reason}>{added[0]}</span>}
            </span>
            <span className={styles.copies}>
              {fmt(ru.decks.copies, { n: count, max: card.rarity === 'legendary' ? 1 : 2 })}
            </span>
          </button>
        );
      })}
    </Sheet>
  );
}
