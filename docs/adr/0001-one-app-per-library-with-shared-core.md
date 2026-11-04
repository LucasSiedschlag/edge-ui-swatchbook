# One app per Library with a shared core

Each Library gets its own small Vite app, and all of them depend on a shared `core` package (Mock Dataset, Simulator, Plant State logic, translations, Tour, shortcut bindings). Apps are deployed under sub-paths of one GitHub Pages site, and the Shell switcher links to the same Screen in another app. Libraries ship global CSS resets and conflicting theme systems, so isolating them avoids cross-contamination. The cost is that switching Library is a navigation, not an in-page swap.

## Considered Options

- **One app routing between Libraries:** an in-page swap, but style and theme conflicts between Libraries and a bundle that grows with every Library.
