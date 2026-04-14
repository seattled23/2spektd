/**
 * Go lexer helpers shared by hallucination.ts and hollow-tests.ts.
 *
 * Not a real lexer — just the minimum "aware-enough" scanning we need:
 * strip comments while preserving string literals + line numbers, and
 * brace-match from an open `{` to its balanced close, ignoring braces
 * inside strings / comments.
 *
 * Why not tree-sitter-go: §8.3 explicitly allows pragmatic parser choice
 * per pack. Go's import and func-declaration syntax is rigid enough that
 * this targeted scanner handles every case we test against, with zero
 * extra npm deps and no native-build step.
 */

export interface ScanPos {
  /** Zero-indexed character offset into the original source. */
  index: number;
  /** 1-indexed line number. */
  line: number;
}

/**
 * Strip // line comments and slash-star block comments from Go source,
 * replacing them with whitespace so character offsets and line numbers
 * stay stable for downstream regex scans.
 *
 * Preserves string literals (regular "..." with escapes, raw `...`)
 * unchanged — these may contain // or slash-star sequences that must
 * NOT be treated as comments.
 */
export function stripGoComments(code: string): string {
  let out = '';
  let i = 0;
  const n = code.length;
  while (i < n) {
    const c = code[i];
    const nxt = code[i + 1];

    // Line comment — consume through EOL, preserve the newline.
    if (c === '/' && nxt === '/') {
      while (i < n && code[i] !== '\n') {
        out += ' ';
        i++;
      }
      continue;
    }

    // Block comment — consume through star-slash. Replace with spaces/newlines
    // to preserve line-count and offsets.
    if (c === '/' && nxt === '*') {
      out += '  ';
      i += 2;
      while (i < n && !(code[i] === '*' && code[i + 1] === '/')) {
        out += code[i] === '\n' ? '\n' : ' ';
        i++;
      }
      if (i < n) {
        out += '  ';
        i += 2;
      }
      continue;
    }

    // Regular string literal — copy verbatim, respecting \-escapes.
    if (c === '"') {
      out += c;
      i++;
      while (i < n && code[i] !== '"') {
        if (code[i] === '\\' && i + 1 < n) {
          out += code[i] + code[i + 1];
          i += 2;
        } else if (code[i] === '\n') {
          // Unterminated string — Go forbids this but we tolerate for scanning.
          break;
        } else {
          out += code[i];
          i++;
        }
      }
      if (i < n && code[i] === '"') {
        out += '"';
        i++;
      }
      continue;
    }

    // Raw string literal — copy verbatim, only terminates on backtick.
    if (c === '`') {
      out += c;
      i++;
      while (i < n && code[i] !== '`') {
        out += code[i];
        i++;
      }
      if (i < n && code[i] === '`') {
        out += '`';
        i++;
      }
      continue;
    }

    // Rune literal — copy verbatim.
    if (c === "'") {
      out += c;
      i++;
      while (i < n && code[i] !== "'") {
        if (code[i] === '\\' && i + 1 < n) {
          out += code[i] + code[i + 1];
          i += 2;
        } else {
          out += code[i];
          i++;
        }
      }
      if (i < n && code[i] === "'") {
        out += "'";
        i++;
      }
      continue;
    }

    out += c;
    i++;
  }
  return out;
}

/**
 * Given code where `openBraceIdx` points at a `{`, return the index of the
 * matching `}`. Walks forward, counting nested braces, skipping strings
 * and comments. Returns -1 if unbalanced.
 *
 * Expects `code` to be pre-stripped of comments OR handles them inline —
 * this implementation handles strings AND comments inline so it can be
 * called on raw source.
 */
export function findMatchingBrace(code: string, openBraceIdx: number): number {
  if (code[openBraceIdx] !== '{') return -1;
  let depth = 0;
  let i = openBraceIdx;
  const n = code.length;
  while (i < n) {
    const c = code[i];
    const nxt = code[i + 1];

    // Comments — skip without counting braces inside.
    if (c === '/' && nxt === '/') {
      while (i < n && code[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && nxt === '*') {
      i += 2;
      while (i < n && !(code[i] === '*' && code[i + 1] === '/')) i++;
      if (i < n) i += 2;
      continue;
    }

    // Strings — skip.
    if (c === '"') {
      i++;
      while (i < n && code[i] !== '"') {
        if (code[i] === '\\' && i + 1 < n) i += 2;
        else if (code[i] === '\n') break;
        else i++;
      }
      if (i < n && code[i] === '"') i++;
      continue;
    }
    if (c === '`') {
      i++;
      while (i < n && code[i] !== '`') i++;
      if (i < n && code[i] === '`') i++;
      continue;
    }
    if (c === "'") {
      i++;
      while (i < n && code[i] !== "'") {
        if (code[i] === '\\' && i + 1 < n) i += 2;
        else i++;
      }
      if (i < n && code[i] === "'") i++;
      continue;
    }

    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

/** Line number (1-indexed) for a character offset. */
export function lineOf(code: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < code.length; i++) {
    if (code[i] === '\n') line++;
  }
  return line;
}
