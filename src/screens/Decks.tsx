import { useEffect, useState } from 'react';
import { newId } from '../game/decks/ids';
import { ARCHETYPE_KEYS, buildPreset, type Archetype } from '../game/decks/presets';
import { fmt, ru } from '../i18n/ru';
import { navigate } from '../router';
import { useStore } from '../store';
import { ActionSheet } from '../ui/ActionSheet';
import { Button } from '../ui/Button';
import { HeroArt } from '../ui/HeroArt';
import { cx } from '../ui/cx';
import styles from './Decks.module.css';

/** Спека §6: список колод, активная отмечена, «Новая колода», «Собрать за меня», удаление с подтверждением. */
export function Decks() {
  const decks = useStore((s) => s.decks);
  const activeDeckId = useStore((s) => s.activeDeckId);
  const unlocked = useStore((s) => s.unlocked);
  const upsertDeck = useStore((s) => s.upsertDeck);
  const deleteDeck = useStore((s) => s.deleteDeck);
  const setActiveDeck = useStore((s) => s.setActiveDeck);
  const notice = useStore((s) => s.notice);
  const setNotice = useStore((s) => s.setNotice);

  // Уведомление из меню («Сначала соберите колоду») живёт, пока открыт этот экран.
  useEffect(() => () => setNotice(null), [setNotice]);

  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [archetypeSheet, setArchetypeSheet] = useState(false);

  const canBuild = unlocked.length >= 6;

  const create = (archetype: Archetype, name: string) => {
    const id = newId();
    upsertDeck({ id, name, deck: buildPreset(archetype, unlocked) });
    if (activeDeckId === null) setActiveDeck(id);
    navigate({ name: 'deck', id });
  };

  return (
    <main className={styles.screen}>
      <header className={styles.header}>
        <Button variant="ghost" onClick={() => navigate({ name: 'menu' })}>{ru.common.back}</Button>
        <h1 className={styles.title}>{ru.decks.title}</h1>
      </header>

      {notice === 'needDeck' && <p className={styles.notice} role="status">{ru.menu.needDeck}</p>}
      {decks.length === 0 && <p className={styles.muted}>{ru.decks.empty}</p>}
      <ul className={styles.list}>
        {decks.map((d) => {
          const active = d.id === activeDeckId;
          return (
            <li key={d.id} className={cx(styles.row, active && styles.active)} data-testid={`deck-row-${d.id}`}>
              <button type="button" className={styles.select} aria-pressed={active} onClick={() => setActiveDeck(d.id)}>
                <span className={styles.name}>{d.name}</span>
                {active && <span className={styles.badge}>{ru.decks.active}</span>}
                <span className={styles.arts} aria-hidden="true">
                  {d.deck.starting.map((i) => {
                    const h = d.deck.heroes[i];
                    return h ? <HeroArt key={h} heroId={h} size="sm" /> : null;
                  })}
                </span>
              </button>
              {confirmId === d.id ? (
                <div className={styles.actions}>
                  <span className={styles.confirm}>{ru.decks.confirmDelete}</span>
                  <Button variant="danger" onClick={() => { deleteDeck(d.id); setConfirmId(null); }}>{ru.decks.yes}</Button>
                  <Button variant="secondary" onClick={() => setConfirmId(null)}>{ru.decks.no}</Button>
                </div>
              ) : (
                <div className={styles.actions}>
                  <Button variant="secondary" onClick={() => navigate({ name: 'deck', id: d.id })}>{ru.decks.edit}</Button>
                  <Button variant="ghost" onClick={() => setConfirmId(d.id)}>{ru.decks.delete}</Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {canBuild ? (
        <div className={styles.footer}>
          <Button
            variant="primary"
            onClick={() => create('balanced', fmt(ru.decks.defaultName, { n: decks.length + 1 }))}
          >
            {ru.decks.new}
          </Button>
          <Button variant="secondary" onClick={() => setArchetypeSheet(true)}>{ru.decks.autoBuild}</Button>
        </div>
      ) : (
        <p className={styles.muted}>{ru.decks.needSix}</p>
      )}

      {archetypeSheet && (
        <ActionSheet
          items={ARCHETYPE_KEYS.map((a) => ({ key: a, label: ru.decks.archetypes[a] }))}
          onPick={(key) => {
            setArchetypeSheet(false);
            const a = key as Archetype;
            create(a, ru.decks.archetypes[a]);
          }}
          onClose={() => setArchetypeSheet(false)}
        />
      )}
    </main>
  );
}
