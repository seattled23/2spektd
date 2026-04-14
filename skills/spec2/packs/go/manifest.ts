/**
 * Go language pack manifest (ROADMAP §8.4).
 *
 * Exports the LanguagePack object; registration with the registry is done
 * by packs/index.ts at the bottom of its module body (ESM-evaluation-order
 * safe — registry must be initialized before registerPack is callable).
 */

import type { LanguagePack } from '../index.js';

import { GO_CODEGEN_PROMPT } from './codegen-prompt.js';
import { detectGoHallucinations } from './hallucination.js';
import { detectGoHollowTests } from './hollow-tests.js';
import { goQualityAdapters } from '../../quality/adapters/go/index.js';

export const goPack: LanguagePack = {
  id: 'go',
  displayName: 'Go',
  extensions: ['go'],
  testFilePattern: /_test\.go$/,
  codegenPromptTemplate: GO_CODEGEN_PROMPT,
  hallucinationDetector: detectGoHallucinations,
  hollowTestDetector: detectGoHollowTests,
  qualityTools: goQualityAdapters,
};
