# edge-ui-swatchbook

A showroom for UI libraries. The same six industrial software screens, built once per library, so you can compare them side by side.

Think of a salesperson spreading out samples in a shop. Here the samples are UI libraries, and the screens are the ones an edge and industrial product needs.

Every library shows the same screens, data and actions, and each one looks and behaves the way it naturally does. The UI is available in English and Brazilian Portuguese.

## Screens

1. Operations Live Deck
2. Interactive Recipe Lab
3. Batch & Lot Ledger
4. Plant Performance Center
5. Live Parameter Matrix
6. Control Room Command

## Status

The shared core provides the Mock Dataset, Simulator, Plant State, selectors and bilingual strings.
The shared React runtime provides the clock, actions, preferences, routing, shortcuts and Tour.
The ECharts wrapper provides themed trends, Pareto and output charts with accessible data tables.
Ant Design has an app scaffold; the six Screens and the UI5 and Siemens iX apps are still to be built.

- [docs/idea.md](docs/idea.md): goals, decisions and library criteria
- [docs/adr/](docs/adr/): architecture decisions
- [GLOSSARY.md](GLOSSARY.md): project language

## License

MIT
