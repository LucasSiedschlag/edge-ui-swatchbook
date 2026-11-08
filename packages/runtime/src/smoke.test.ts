import { expect, it } from 'vitest';
import { generateMockDataset } from '@swatchbook/core';

it('can import core', () => {
  expect(generateMockDataset().lines).toHaveLength(7);
});
