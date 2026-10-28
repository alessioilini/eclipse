import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { isFinished } from '../game/session';
import { createRunner, current, dismissSay } from '../game/tutorial/runner';
import { SCRIPTS } from '../game/tutorial/scripts';
import type { SlotRef } from '../engine';
import type { Requirement, TutorialScript, TutorialStep, UiAnchor } from '../game/tutorial/types';
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

/** Цель, которую требует шаг (если требует). */
function requiredTarget(step: TutorialStep): SlotRef | undefined {
  if (!('require' in step)) return undefined;
  const req = (step as Extract<TutorialStep, { require: Requirement }>).require;
  return req !== 'confirm' && 'target' in req ? req.target : undefined;
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

/** Бой обучения: экран боя под управлением сценария и оверлей подсказок (спека §5). */
export function Tutorial({ id }: { id: Id }) {
  const script = SCRIPTS[id];
  const session = useStore((s) => s.session);
  const phase = useStore((s) => s.phase);
  const tutorial = useStore((s) => s.tutorial);
  const sheet = useStore((s) => s.sheet);
  const setTutorialRunner = useStore((s) => s.setTutorialRunner);

  const restart = useCallback(() => startScript(script), [script]);

  // Незавершённый бой этого сценария продолжается (в т.ч. после перезагрузки); завершённый победой ведёт
  // на результат, поражением — остаётся на экране повтора; чужой матч или его отсутствие — новый бой.
  useEffect(() => {
    const s = useStore.getState();
    const ours = s.session?.mode === 'tutorial' && s.session.tutorialId === id && s.tutorial !== null;
    if (!ours) restart();
    else if (isFinished(s.session!) && s.session!.state.result?.winner === 'A') navigate({ name: 'result' });
  }, [id, restart]);

  // Конец боя: победа — экран результата (награды уже выданы стором при подтверждении последнего раунда;
  // повторная выдача ничего не меняет); поражение остаётся здесь с кнопкой перезапуска.
  useEffect(() => {
    if (phase !== 'finished') return;
    const s = useStore.getState().session;
    if (s?.mode !== 'tutorial' || s.tutorialId !== id || s.state.result?.winner !== 'A') return;
    useStore.getState().applyTutorialRewards(id);
    navigate({ name: 'result' });
  }, [phase, id]);

  const ours = session?.mode === 'tutorial' && session.tutorialId === id && tutorial !== null;
  const step = ours && phase === 'planning' ? current(tutorial) : null;
  const anchor = step && 'anchor' in step ? step.anchor : undefined;
  const target = step ? requiredTarget(step) : undefined;
  // Для сквозного теста: testid якоря и требуемой цели (data-anchor, data-anchor-target).
  const ids = {
    ...(anchor ? { anchorId: anchorTestId(anchor) } : {}),
    ...(target ? { targetId: anchorTestId({ kind: 'hero', ref: target }) } : {}),
  };

  const [rect, setRect] = useState<AnchorRect | undefined>(undefined);
  useLayoutEffect(() => {
    const update = () => setRect(measure(anchor));
    update();
    // Прокрутка любого контейнера (не всплывает — ловим на погружении) сдвигает якорь на экране.
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
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
          <Overlay text={step.say} {...ids} {...(rect ? { anchorRect: rect } : {})} />
        ) : (
          <Overlay
            text={step.say}
            {...ids}
            {...(rect ? { anchorRect: rect } : {})}
            onNext={() => setTutorialRunner(dismissSay(tutorial))}
          />
        )
      )}
    </>
  );
}
