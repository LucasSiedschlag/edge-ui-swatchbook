# @swatchbook/runtime

Shared React behavior for Library apps, with no UI or Library dependency. Core owns the Mock Dataset, Simulator, Plant State rules, translations, shortcuts and Tour steps. Runtime connects them to React and the browser.

```tsx
import { deckView } from '@swatchbook/core';
import {
  RuntimeProvider, useActions, useI18n, useSimulation,
} from '@swatchbook/runtime';

function Deck() {
  const { state, snapshot, tick } = useSimulation();
  const dispatch = useActions();
  const { t, formatNumber } = useI18n();
  const view = deckView(state, snapshot, 'E2', tick);
  return (
    <>
      <output>{formatNumber(view.kpis.outputThisShift)}</output>
      <button onClick={() => dispatch({ type: 'pause', lineId: 'E2' })}>
        {t('action.pause')}
      </button>
    </>
  );
}

export function App() {
  return (
    <RuntimeProvider libraryId="ant-design">
      <Deck />
    </RuntimeProvider>
  );
}
```

`useSimulation()` shares one tick, Plant State and snapshot across consumers. `usePlantState()` returns only `{ state, dispatch }`, memoised independently of the tick and snapshot so a Screen such as the Recipe Lab form does not re-render every second. `useActions()` returns the dispatch function; it reads a fresh tick and returns core's `ActionResult` unchanged. `actionErrorLabel(result)` returns the refusal dictionary key, or null on success. A new provider mount starts fresh Plant State.

`usePreferences()` supplies language, theme, density, the matching preset, capability flags and setters. `PRESETS` contains `office` (light, comfortable), `control-room` (dark, compact) and `night` (dark, comfortable). Applying a preset always saves both values, even if they match the defaults or the Library cannot render density. The selected preset is derived from these shared stored values. Unsupported density is exposed as `densityUnavailable`, and direct density controls cannot change it. External storage updates retain the shared value. `useI18n()` binds core translations and formatting to the selected language.

`useRoute()` exposes `screen`, the canonical `route` (null for an invalid hash), and `go(screen)` for hash routing. Invalid or empty hashes become `#/deck` without another history entry. Hash queries survive navigation and normalization. `LIBRARIES` describes the v1 Library picker; planned entries should be disabled. `useLibrary()` returns the current registry entry selected by the required `libraryId` prop. The registry owns density support: Ant Design supports it, and UI5 and Siemens iX are marked false until built. Tests can use `supportsDensityOverride`; apps use the registry.

`libraryUrl({ siteBase, libraryId, screen })` keeps the Screen and the current valid frozen tick when switching apps. Get `siteBase` with `siteBaseFrom(import.meta.env.BASE_URL, currentLibrary.id)`: it removes trailing slashes and the final Library path segment, returning a base without a trailing slash (the origin root is an empty string). A base without that final segment is retained. Preferences use core's one `PREFERENCES_KEY` on the shared origin. `LIBRARY_NOT_BUILT_KEY` names `shell.library-not-built`, present in both core dictionaries.

`useShortcut('focus-search', handler)` and `useShortcutHandlers({ acknowledge: handler })` register handlers. Each registration gets its order during its first render, so a child wins over its parent even when they mount in one commit. Re-rendering does not reorder it. Returning false tries the next older handler; void means handled. Default is prevented only when handled. Screen navigation is automatic. Runtime never handles `close` or prevents Escape; each Library's native Drawer, Modal and dialog owns Escape. Core retains the binding for shortcut help. All shortcuts are ignored when the event path contains `aria-modal="true"`, `role="dialog"` or `role="alertdialog"`, including composed paths through shadow DOM. The optional provider predicate `rowFocused(event)` identifies custom focused rows; native controls and text entry still follow core's rules.

`useTour()` shares an in-memory Tour. While active, its index and step come from the route through core's `stepForRoute`; digit navigation and browser Back therefore follow the visible Screen. Start always goes to step zero; next and previous only navigate and stay at the ends. Leaving the six Tour Screens ends the Tour. Finish clears it without navigating away. Inactive Tours have index zero, no step and both boundary flags false.

Dataset, storage, browser languages, the initial URL tick and clock source are captured at mount. The provider accepts `dataset`, `storage`, `languages`, `search` and `now` for tests. It defaults to the browser values and safely handles blocked localStorage. There is no server-rendering adapter. Preferences follow storage events for the shared key, removal or clear, without writing received changes back.

The hidden `?tick=N` test parameter freezes the clock at an integer from zero through core's `MAX_TICK`. `readTestTick()` reads `location.search` first, then the hash query, such as `#/deck?tick=4`. A search `tick` takes precedence even when invalid; it does not fall back to the hash. Repeated parameters, signs, whitespace, fractions and exponent notation are ignored; leading zeroes are accepted. Apps get the tick only from `useSimulation()`; the standalone clock hook and its options are internal to the provider and tests. A fixed tick creates no timer. A live clock uses injectable `performance.now()`, catches up after delays, keeps the highest tick seen even if the source moves backwards, and stops at `MAX_TICK`.

Apps should set `resolve.dedupe: ['react', 'react-dom']` in their Vite config so the app and workspace packages share one React instance.

Run `corepack pnpm test` and `corepack pnpm typecheck` in this package. Tests use happy-dom, React `act`, StrictMode, real keyboard events and fake timers, including a complete session with timer and listener cleanup checks.
