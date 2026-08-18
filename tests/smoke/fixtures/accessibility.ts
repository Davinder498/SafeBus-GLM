import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

export async function expectNoWcagAaViolations(page: Page, surface: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze();
  const evidence = violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    helpUrl: violation.helpUrl,
    nodes: violation.nodes.map((node) => ({
      target: node.target,
      summary: node.failureSummary,
    })),
  }));

  expect(evidence, `${surface} must have no automated WCAG 2.2 A/AA violations`).toEqual([]);
}
