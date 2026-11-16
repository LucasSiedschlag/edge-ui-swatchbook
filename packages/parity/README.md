# @swatchbook/parity

Playwright checks that every Library keeps Parity: identical content, routes, Mock Dataset, actions, Shell structure and shortcuts, each rendered natively. The same spec files run against any Library and in both languages (projects `en` and `pt-BR`, which differ only by the language preference).

## Run

```bash
corepack pnpm --filter @swatchbook/parity test:e2e
LIBRARY_URL=https://example.test/ant-design/ corepack pnpm --filter @swatchbook/parity test:e2e
```

Without `LIBRARY_URL` the suite starts the Ant Design dev server on port 5199 (or reuses it). With `LIBRARY_URL` it only visits that URL. The root script `corepack pnpm test:parity` does the same. It is not part of the default `test` because it needs a browser (Chromium, installed with `corepack pnpm --filter @swatchbook/parity exec playwright install chromium`).

## Add checks for a Screen

1. Create `tests/<screen>.spec.ts` and import `test`, `expect`, `openScreen`, `byId` and friends from `./harness`.
2. Open the Screen with `openScreen(page, 'ledger')`. It uses the hash route and `?tick=0`, so the clock is frozen.
3. Find elements with `byId(page, TEST_IDS.<screen>.<name>)`. Ids come from `@swatchbook/core`, never typed by hand.
4. Take expected texts from the core dictionaries with `text(language, key)` and expected data from the core Mock Dataset and Simulator, never from the app under test.
5. Use `noConsoleErrors(page)` to fail on console and page errors, and `atMinWidth(page, check)` to repeat a check at 1280 px.

Library specific selectors (for example the select popup) live in `tests/harness.ts` only.

## Comparisons never use pixels

No screenshot comparison. Checks compare content, state and attributes. Libraries are meant to look different.
