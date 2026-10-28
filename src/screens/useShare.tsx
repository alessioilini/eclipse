import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Deck } from '../engine';
import { challengeFor, displayName, shareText } from '../game/share';
import { ru } from '../i18n/ru';
import { getPlatform } from '../platform';
import { useStore } from '../store';
import { NamePrompt } from './NamePrompt';

type Pending = { deck: Deck; moment: string };

export type ShareFlow = {
  /** Делится вызовом на колоду `deck`; без имени сначала открывает диалог имени. */
  start(deck: Deck, moment: string): void;
  /** Диалог имени, пока он нужен (экран рендерит его у себя); иначе null. */
  prompt: ReactNode;
  /** Текст подсказки об итоге шаринга (`role="status"` рисует экран); иначе null. */
  notice: string | null;
};

/**
 * Шаринг-вызов (спека §5) для экрана результата и меню: имя (Telegram — у пользователя, браузер — из профиля
 * или диалога), код с новым seed, `platform.share`, подсказка по итогу. Подсказка общая в store, поэтому
 * экран сбрасывает её при монтировании: оставшаяся от другого экрана не всплывает.
 */
export function useShare(now: () => number): ShareFlow {
  const name = useStore((s) => s.name);
  const notice = useStore((s) => s.notice);
  const setName = useStore((s) => s.setName);
  const setNotice = useStore((s) => s.setNotice);
  const [pending, setPending] = useState<Pending | null>(null);
  // Ответ платформы может прийти после ухода с экрана: тогда подсказку не ставим.
  const mounted = useRef(true);
  // Пока платформа делится, повторные нажатия игнорируются (иначе два листа шаринга / две записи в буфер).
  const busy = useRef(false);

  useEffect(() => {
    mounted.current = true;
    setNotice(null);
    return () => {
      mounted.current = false;
    };
  }, [setNotice]);

  const send = async ({ deck, moment }: Pending, who: string) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const platform = getPlatform();
      const link = challengeFor(deck, who, now).url(platform);
      setNotice(null);
      const result = await platform.share(shareText({ name: who, moment }), link);
      if (!mounted.current) return;
      if (result === 'clipboard') setNotice('copied');
      else if (result === 'none') setNotice('shareFailed');
    } finally {
      busy.current = false;
    }
  };

  const start = (deck: Deck, moment: string) => {
    if (busy.current) return;
    const who = displayName(getPlatform(), name !== null ? { name } : {});
    if (who === null) setPending({ deck, moment });
    else void send({ deck, moment }, who);
  };

  const prompt = pending && (
    <NamePrompt
      onDone={(entered) => {
        setName(entered);
        setPending(null);
        const saved = useStore.getState().name;
        if (saved !== null) void send(pending, saved);
      }}
      onCancel={() => setPending(null)}
    />
  );

  const text = notice === 'copied' ? ru.platform.copied : notice === 'shareFailed' ? ru.platform.shareFailed : null;
  return { start, prompt, notice: text };
}
