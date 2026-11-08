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
    <RuntimeProvider libraryId="ant-design" supportsDensity>
      <Deck />
    </RuntimeProvider>
  );
}
```

`useSimulation()` shares one tick, Plant State and snapshot across consumers. `useActions()` returns the dispatch function; it reads a fresh tick and returns core's `ActionResult` unchanged. `actionErrorLabel(result)` returns the refusal dictionary key, or null on success. A new provider mount starts fresh Plant State.

`usePreferences()` supplies language, theme, density, the matching preset, capability flags and setters. `PRESETS` contains `office`, `control-room` and `night`. Unsupported density stays stored and is exposed as unavailable: local density controls and presets cannot change it. External storage updates still retain the shared value. `useI18n()` binds core translations and formatting to the selected language.

`useRoute()` exposes `screen` and `go(screen)` for hash routing. Invalid or empty hashes become `#/deck` without another history entry. `LIBRARIES` describes the v1 Library picker; planned entries should be disabled. `libraryUrl({ siteBase, libraryId, screen })` keeps the Screen when switching apps. Preferences use core's one `PREFERENCES_KEY` on the shared origin. `LIBRARY_NOT_BUILT_KEY` names `shell.library-not-built`, pending its addition to both core dictionaries.

`useShortcut('close', handler)` and `useShortcutHandlers({ close: handler })` register handlers. The latest mounted registration for an action wins and falls back when unmounted; re-rendering does not reorder it. Returning false declines handling and leaves the default action alone; void means handled. A declined top handler does not call older handlers. Screen navigation is automatic. The optional provider predicate `rowFocused(event)` identifies custom focused rows; native controls and text entry still follow core's rules.

`useTour()` shares an in-memory Tour. Start always goes to step zero, next and previous stay at the ends, and finish clears the Tour without navigating away. Inactive Tours have no step and both boundary flags are false.

Dataset, storage, browser languages, search and clock source are captured at mount. The provider accepts `dataset`, `storage`, `languages`, `search` and `now` for tests. It defaults to the browser values and safely handles blocked localStorage. There is no server-rendering adapter. Preferences follow storage events for the shared key, removal or clear, without writing received changes back.

The hidden `?tick=N` test parameter freezes the clock at an integer from zero through core's `MAX_TICK`. Repeated parameters, signs, whitespace, fractions and exponent notation are ignored; leading zeroes are accepted. The standalone `useSimClock({ now, fixedTick })` returns a tick number. A fixed tick creates no timer. A live clock catches up after delays, clamps backward elapsed time to zero, and stops at `MAX_TICK`.

Run `corepack pnpm test` and `corepack pnpm typecheck` in this package. Tests use happy-dom, React `act`, StrictMode, real keyboard events and fake timers, including a complete session with timer and listener cleanup checks.
