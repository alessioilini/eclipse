import { useState, type CSSProperties } from 'react';
import { HEROES, HERO_IDS } from '../engine';
import type { Element, Role } from '../engine';
import { ru } from '../i18n/ru';
import { navigate } from '../router';
import { useStore } from '../store';
import { Button } from '../ui/Button';
import { HeroArt } from '../ui/HeroArt';
import { cx } from '../ui/cx';
import styles from './Heroes.module.css';

const ELEMENTS = Object.keys(ru.elements) as Element[];
const ROLES = Object.keys(ru.roles) as Role[];

function Chip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" className={cx(styles.chip, on && styles.chipOn)} aria-pressed={on} onClick={onClick}>
      {label}
    </button>
  );
}

/** Спека §7 «Героини»: сетка 3×4, фильтры стихии и роли, закрытые затемнены, тап по открытой ведёт на её экран. */
export function Heroes() {
  const unlocked = useStore((s) => s.unlocked);
  const [element, setElement] = useState<Element | null>(null);
  const [role, setRole] = useState<Role | null>(null);

  const list = HERO_IDS.filter((h) => (element === null || HEROES[h].element === element)
    && (role === null || HEROES[h].role === role));

  return (
    <main className={styles.screen}>
      <header className={styles.header}>
        <Button variant="ghost" onClick={() => navigate({ name: 'menu' })}>{ru.common.back}</Button>
        <h1 className={styles.title}>{ru.heroes.title}</h1>
      </header>

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

      <ul className={styles.grid}>
        {list.map((id) => {
          const hero = HEROES[id];
          const locked = !unlocked.includes(id);
          const style = { '--tile-color': `var(--el-${hero.element})` } as CSSProperties;
          return (
            <li key={id}>
              <button
                type="button"
                className={cx(styles.tile, locked && 'locked', locked && styles.locked)}
                style={style}
                disabled={locked}
                data-testid={`hero-tile-${id}`}
                onClick={() => navigate({ name: 'hero', id })}
              >
                <HeroArt heroId={id} size="lg" />
                <span className={styles.name}>{hero.name}</span>
                <span className={styles.meta}>{ru.roles[hero.role]}</span>
                {locked && <span className={styles.meta}>{ru.heroes.locked}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
