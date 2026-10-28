import type { CardId, HeroAction, HeroId, MoonPhase, Side, Status } from '../../engine/types';

export type ViewHero = { heroId: HeroId; hp: number; maxHp: number; shield: number; statuses: Status[]; alive: boolean; chip?: HeroAction };

export type ViewState = { round: number; moon: MoonPhase; sides: Record<Side, { active: ViewHero[]; reserve: ViewHero[]; energy: number; luna: number; handSize: number; hand?: CardId[]; bloodMoon: boolean }> };
