/**
 * Lightweight rehype syntax-highlighting plugin with a curated language subset.
 *
 * Replaces the default `rehype-highlight` which always imports the `common`
 * preset (37 grammars from highlight.js, ~180 KB minified). This version
 * registers only the ~19 languages most frequently encountered in AI chat,
 * cutting the vendor-markdown chunk by ~40-50%.
 *
 * highlight.js automatically registers aliases when grammars are loaded:
 *   javascript → js, jsx, mjs, cjs
 *   typescript → ts, tsx
 *   bash       → sh
 *   xml        → html, xhtml, svg, rss, atom
 *   yaml       → yml
 *   rust       → rs
 *   markdown   → md, mkdown, mkd
 *   cpp        → cc, c++, h++, hpp, hh, hxx, cxx
 *   c          → h
 *   csharp     → cs, c#
 */

import type { Root, Element, ElementContent } from 'hast';
import { createLowlight } from 'lowlight';
import { toText } from 'hast-util-to-text';
import { visit } from 'unist-util-visit';

// ── Curated grammars (sorted by expected frequency in AI chat) ──
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import sql from 'highlight.js/lib/languages/sql';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import java from 'highlight.js/lib/languages/java';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import yaml from 'highlight.js/lib/languages/yaml';
import diff from 'highlight.js/lib/languages/diff';
import markdown from 'highlight.js/lib/languages/markdown';
import shell from 'highlight.js/lib/languages/shell';
import scss from 'highlight.js/lib/languages/scss';
import plaintext from 'highlight.js/lib/languages/plaintext';

const lowlight = createLowlight({
  javascript, typescript, python, bash, json, xml, css, sql,
  go, rust, java, c, cpp, csharp, yaml, diff, markdown, shell,
  scss, plaintext,
});

/**
 * Extract language name from a `<code>` element's className list.
 * Returns `false` for explicit no-highlight, `undefined` for no language hint.
 */
function extractLang(node: Element): string | false | undefined {
  const list = node.properties?.className;
  if (!Array.isArray(list)) return undefined;

  for (const value of list) {
    const s = String(value);
    if (s === 'no-highlight' || s === 'nohighlight') return false;
    if (s.startsWith('language-')) return s.slice(9);
    if (s.startsWith('lang-')) return s.slice(5);
  }
  return undefined;
}

/**
 * Rehype plugin: apply syntax highlighting to fenced code blocks.
 *
 * Only highlights `<code>` inside `<pre>` with an explicit language class.
 * Silently skips unregistered languages (user may paste niche code).
 */
export default function rehypeHighlightLite() {
  return function (tree: Root): void {
    visit(tree, 'element', function (node: Element, _index, parent) {
      if (
        node.tagName !== 'code' ||
        !parent ||
        parent.type !== 'element' ||
        parent.tagName !== 'pre'
      ) {
        return;
      }

      const lang = extractLang(node);
      if (lang === false || !lang) return; // no-highlight or no language hint

      if (!Array.isArray(node.properties.className)) {
        node.properties.className = [];
      }
      if (!node.properties.className.includes('hljs')) {
        node.properties.className.unshift('hljs');
      }

      try {
        const text = toText(node, { whitespace: 'pre' });
        const result = lowlight.highlight(lang, text);
        if (result.children.length > 0) {
          node.children = result.children as ElementContent[];
        }
      } catch {
        // Unknown language — skip silently
      }
    });
  };
}
