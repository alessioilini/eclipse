import { useState } from 'react';
import { HEROES, HERO_IDS, ULTIMATE_ENERGY_COST } from '../engine';
import type { HeroId } from '../engine';
import { fmt, ru } from '../i18n/ru';
import { navigate } from '../router';
import { useStore } from '../store';
import { Button } from '../ui/Button';
import { HeroArt } from '../ui/HeroArt';
import styles from './Heroes.module.css';
import { useAppBack } from './useAppBack';

/** Последний слот резерва колоды: туда встаёт добавленная героиня (самая глубокая запасная). */
const LAST_SLOT = 5;

/** Спека §7 «Героиня»: характеристики, пассивка, умение, ульта и «В колоду». Неизвестная или закрытая — заглушка. */
export function HeroDetail({ id }: { id: HeroId }) {
  const unlocked = useStore((s) => s.unlocked);
  const decks = useStore((s) => s.decks);
  const activeDeckId = useStore((s) => s.activeDeckId);
  const upsertDeck = useStore((s) => s.upsertDeck);
  const [added, setAdded] = useState(false);

  const toList = () => navigate({ name: 'heroes' });
  // Кнопка «Назад» платформы — как и в шапке, к списку героинь.
  useAppBack(toList);
  const back = <Button variant="ghost" onClick={toList}>{ru.common.back}</Button>;

  if (!HERO_IDS.includes(id)) {
    return (
      <main className={styles.screen}>
        <header className={styles.header}>{back}</header>
        <p className={styles.note}>{ru.common.soon}</p>
      </main>
    );
  }
  if (!unlocked.includes(id)) {
    return (
      <main className={styles.screen}>
        <header className={styles.header}>{back}</header>
        <p className={styles.note}>{ru.heroes.locked}</p>
      </main>
    );
  }

  const hero = HEROES[id];
  const active = decks.find((d) => d.id === activeDeckId) ?? null;
  const inDeck = active !== null && active.deck.heroes.includes(id);
  const disabledReason = active === null ? ru.heroes.noDeck : inDeck ? ru.heroes.inDeck : undefined;

  const addToDeck = () => {
    if (active === null || inDeck) return;
    const heroes = [...active.deck.heroes];
    heroes[Math.min(LAST_SLOT, heroes.length)] = id;
    upsertDeck({ ...active, deck: { ...active.deck, heroes } });
    setAdded(true);
    navigate({ name: 'deck', id: active.id });
  };

  return (
    <main className={styles.screen}>
      <header className={styles.header}>{back}</header>
      <div className={styles.detail}>
        <div className={styles.hero}>
          <HeroArt heroId={id} kind="full" size="xl" />
          <h1 className={styles.heroName}>{hero.name}</h1>
          <span className={styles.note}>{ru.elements[hero.element]} · {ru.roles[hero.role]}</span>
        </div>

        <div className={styles.stats}>
          <span className={styles.stat}>{`${ru.heroes.hp} ${hero.hp}`}</span>
          <span className={styles.stat}>{`${ru.heroes.atk} ${hero.atk}`}</span>
          <span className={styles.stat}>{`${ru.heroes.spd} ${hero.spd}`}</span>
        </div>

        <section className={styles.block}>
          <span className={styles.blockLabel}>{ru.heroes.passive}</span>
          <span className={styles.abilityName}>{hero.passive.name}</span>
          <p className={styles.text}>{hero.passive.text}</p>
        </section>

        <section className={styles.block}>
          <span className={styles.blockLabel}>{ru.heroes.skill}</span>
          <div className={styles.blockHead}>
            <span className={styles.abilityName}>{hero.skill.name}</span>
            <span className={styles.cost}>{fmt(ru.heroes.skillCost, { n: hero.skill.cost })}</span>
          </div>
          <p className={styles.text}>{ru.abilities[id].skill}</p>
        </section>

        <section className={styles.block}>
          <span className={styles.blockLabel}>{ru.heroes.ultimate}</span>
          <div className={styles.blockHead}>
            <span className={styles.abilityName}>{hero.ultimate.name}</span>
            <span className={styles.cost}>{fmt(ru.heroes.ultCost, { energy: ULTIMATE_ENERGY_COST })}</span>
          </div>
          <p className={styles.text}>{ru.abilities[id].ultimate}</p>
        </section>

        <div title={disabledReason}>
          <Button variant="primary" size="lg" disabled={disabledReason !== undefined} onClick={addToDeck} testId="to-deck">
            {ru.heroes.toDeck}
          </Button>
        </div>
        {disabledReason !== undefined && <p className={styles.note}>{disabledReason}</p>}
        {added && <p className={styles.note}>{ru.heroes.added}</p>}
      </div>
    </main>
  );
}
