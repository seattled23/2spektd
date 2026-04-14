/**
 * Go quality-tool adapter bundle.
 *
 * Imported by packs/go/manifest.ts; order here is the order adapters run in
 * against a Wave-6-generated file. Fastest adapters first so early failures
 * short-circuit slower ones (gofmt / go vet before golangci-lint / gosec).
 */

import { gofmtAdapter } from './gofmt.js';
import { goVetAdapter } from './govet.js';
import { golangciLintAdapter } from './golangci-lint.js';
import { gosecAdapter } from './gosec.js';

export const goQualityAdapters = [
  gofmtAdapter,
  goVetAdapter,
  golangciLintAdapter,
  gosecAdapter,
];
