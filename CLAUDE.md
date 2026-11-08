# CLAUDE.md

Read these first, in order:

1. `GLOSSARY.md` - the project language. Use these terms exactly: Library, Screen, Parity, Gap, Shell, Mock Dataset, Simulator, Tour, Plant State.
2. `docs/idea.md` - goals, non-goals, settled decisions, Library criteria, open questions.
3. `docs/adr/` - why the structure is what it is.

## Rules

- Parity means identical content (Screens, routes, Mock Dataset, information, actions, Shell structure, shortcut bindings) and native rendering. Never make Libraries look the same, and never compare pixels.
- A capability a Library lacks is a Gap. Show it as it is. Do not fake or work around it.
- Do not rank or judge Libraries.
- All data comes from the shared `core` package. Never duplicate or tweak data per Library.
- Every user-facing string is in both `en` and `pt-BR`, stored in the `core` dictionaries. Docs stay in English.
- Use a Library's official `pt-BR` pack when it exists. When it does not, translate its built-in strings in the `core` dictionaries and record the Translation Burden.
- Desktop, keyboard and mouse first. No phone or touch layouts.
- Charts use Apache ECharts with the SVG renderer through the shared chart wrapper, as decided in [ADR 0003](docs/adr/0003-echarts-behind-a-thin-wrapper.md). The wrapper keeps the chart library swappable.
- Plant State resets on reload. Only language, theme and density persist, in `localStorage`.

## Layout and commands

- `packages/core`: shared Mock Dataset, Simulator, Plant State, translations, Tour and shortcuts (`@swatchbook/core`).
- `packages/charts`: the shared chart wrapper over ECharts (`@swatchbook/charts`).
- `apps/<library>`: one Vite app per Library, built on the core. `apps/ant-design` is the first.
- pnpm is not installed globally on this machine. Run it with `corepack pnpm <command>`, for example `corepack pnpm -r typecheck` and `corepack pnpm -r build`.

## Open

The Library lists for v1, v2 and the backlog are in `docs/idea.md`. Do not add or swap a Library without asking.

## Agent skills

### Issue tracker

Issues live in GitHub Issues for this repo, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: one root `GLOSSARY.md` and `docs/adr/`. See `docs/agents/domain.md`.
