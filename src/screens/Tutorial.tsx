import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { isFinished } from '../game/session';
import { createRunner, current, dismissSay } from '../game/tutorial/runner';
import { STARTER_DECK_ID, TUTORIAL_UNLOCKS, starterDeck } from '../game/tutorial/rewards';
import { SCRIPTS } from '../game/tutorial/scripts';
import type { TutorialScript, UiAnchor } from '../game/tutorial/types';
import { ru } from '../i18n/ru';
import { navigate } from '../router';
import { useStore } from '../store';
import { Button } from '../ui/Button';
import { Overlay } from '../ui/Overlay';
import type { AnchorRect } from '../ui/Overlay';
import { Battle } from './Battle/Battle';
import styles from './Tutorial.module.css';

type Id = 1 | 2 | 3;

/** testid элемента, на который указывает шаг (см. `src/ui/*`). */
function anchorTestId(anchor: UiAnchor): string {
  switch (anchor.kind) {
    case 'hero': return `hero-${anchor.ref.side}-${anchor.ref.slot}`;
    case 'reserve': return `reserve-${anchor.side}-${anchor.index}`;
    case 'card': return `card-${anchor.handIndex}`;
    case 'confirm': return 'confirm';
    case 'moon': return 'moon';
    case 'energy': return 'energy';
  }
}

/** Прямоугольник якоря на экране; undefined, если элемента нет или у него нет размера (jsdom). */
function measure(anchor: UiAnchor | undefined): AnchorRect | undefined {
  if (!anchor) return undefined;
  const el = document.querySelector(`[data-testid="${anchorTestId(anchor)}"]`);
  const r = el?.getBoundingClientRect();
  if (!r || (r.width === 0 && r.height === 0)) return undefined;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function startScript(script: TutorialScript): void {
  const s = useStore.getState();
  s.startMatch(script.decks.A, {
    opponentDeck: script.decks.B, seed: script.seed, mode: 'tutorial', tutorialId: script.id, enemy: script.enemy,
    ...(script.enemyHp ? { opponentHp: script.enemyHp } : {}),
  });
  s.setTutorialRunner(createRunner(script));
}

/** Победа в бою обучения: прогресс, новые героини, после третьего боя — первая колода (спека §5.1). */
function grantRewards(id: Id): void {
  const s = useStore.getState();
  s.completeTutorial(id);
  s.unlock(TUTORIAL_UNLOCKS[id]);
  if (id === 3 && !s.decks.some((d) => d.id === STARTER_DECK_ID)) {
    s.upsertDeck({ id: STARTER_DECK_ID, name: ru.tutorial.starterDeck, deck: starterDeck() });
    s.setActiveDeck(STARTER_DECK_ID);
  }
}

/** Бой обучения: экран боя под управлением сценария и оверлей подсказок (спека §5). */
export function Tutorial({ id }: { id: Id }) {
  const script = SCRIPTS[id];
  const session = useStore((s) => s.session);
  const phase = useStore((s) => s.phase);
  const tutorial = useStore((s) => s.tutorial);
  const sheet = useStore((s) => s.sheet);
  const setTutorialRunner = useStore((s) => s.setTutorialRunner);

  const restart = useCallback(() => startScript(script), [script]);

  // Незавершённый бой этого сценария продолжается (в т.ч. после перезагрузки), иначе начинается заново.
  useEffect(() => {
    const s = useStore.getState();
    const ours = s.session?.mode === 'tutorial' && s.session.tutorialId === id;
    if (!ours || !s.tutorial || isFinished(s.session!)) restart();
  }, [id, restart]);

  // Конец боя: победа — награды и экран результата; поражение остаётся здесь с кнопкой перезапуска.
  useEffect(() => {
    if (phase !== 'finished') return;
    const s = useStore.getState().session;
    if (s?.mode !== 'tutorial' || s.tutorialId !== id || s.state.result?.winner !== 'A') return;
    grantRewards(id);
    navigate({ name: 'result' });
  }, [phase, id]);

  const ours = session?.mode === 'tutorial' && session.tutorialId === id && tutorial !== null;
  const step = ours && phase === 'planning' ? current(tutorial) : null;
  const anchor = step && 'anchor' in step ? step.anchor : undefined;

  const [rect, setRect] = useState<AnchorRect | undefined>(undefined);
  useLayoutEffect(() => {
    const update = () => setRect(measure(anchor));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [anchor, sheet]);

  // Чужой матч в сторе ещё не заменён эффектом выше: не показываем его ни кадра.
  if (!ours) return null;

  if (phase === 'finished' && session.state.result?.winner !== 'A') {
    return (
      <main className={styles.screen} data-testid="tutorial-lost">
        <h1 className={styles.title}>{ru.result.loss}</h1>
        <p className={styles.text}>{ru.tutorial.lost}</p>
        <Button variant="primary" size="lg" onClick={restart}>
          {ru.tutorial.retry}
        </Button>
      </main>
    );
  }

  return (
    <>
      <Battle />
      {step && (
        'require' in step ? (
          <Overlay text={step.say} {...(rect ? { anchorRect: rect } : {})} />
        ) : (
          <Overlay
            text={step.say}
            {...(rect ? { anchorRect: rect } : {})}
            onNext={() => setTutorialRunner(dismissSay(tutorial))}
          />
        )
      )}
    </>
  );
}
