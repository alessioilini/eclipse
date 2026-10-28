import type { TutorialScript } from '../types';
import { script1 } from './1';
import { script2 } from './2';
import { script3 } from './3';

export const SCRIPTS: Record<1 | 2 | 3, TutorialScript> = { 1: script1, 2: script2, 3: script3 };
