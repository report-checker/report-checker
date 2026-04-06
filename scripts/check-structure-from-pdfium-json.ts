import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { defaultCheckerConfig } from '../src/lib/checker-config';
import { evaluateParsedPdf } from '../src/lib/rules-engine/engine';
import type { ParsedPdfResult, RuleResult } from '../src/lib/rules-engine/types';

function findById(nodes: RuleResult[], id: string): RuleResult | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = findById(node.children, id);
    if (child) return child;
  }
  return null;
}

function main() {
  const dir = resolve('/tmp/pdfium-parsed');
  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b, 'en'));

  for (const file of files) {
    const parsed = JSON.parse(readFileSync(join(dir, file), 'utf8')) as ParsedPdfResult;
    const result = evaluateParsedPdf(parsed, defaultCheckerConfig);
    const tocPresence = findById(result.rules, 'toc-presence');
    const tocBodyMatch = findById(result.rules, 'toc-body-match');
    const section = findById(result.rules, 'section-headings-format');

    console.log(`\n${file}`);
    console.log(`  toc-presence: ${tocPresence?.status}`);
    console.log(`  toc-body-match: ${tocBodyMatch?.status} :: ${tocBodyMatch?.message}`);
    console.log(`  section-headings-format: ${section?.status} :: ${section?.message}`);
  }
}

main();
