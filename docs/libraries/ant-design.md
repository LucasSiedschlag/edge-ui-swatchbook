# Ant Design

Gaps and Translation Burden of the Ant Design Library. Terms follow [GLOSSARY.md](../../GLOSSARY.md).

## Summary

| | |
|---|---|
| Library | Ant Design (`antd`) 6.6.8, with `@ant-design/icons` 6.3.4 and React 19.3.1 |
| Components behind the Gaps | `@rc-component/table` 1.11.1, `select` 1.10.1, `trigger` 3.10.1, `picker` 1.12.2, `input-number` 1.6.2 |
| Built | The Shell and the six Screens, in `apps/ant-design/src` |
| Issues | [#7](https://github.com/LucasSiedschlag/edge-ui-swatchbook/issues/7) (Library), [#35](https://github.com/LucasSiedschlag/edge-ui-swatchbook/issues/35) (this document) |
| Pull requests | #24 Shell, Operations Live Deck (`Deck.tsx`) and Control Room Command (`Control.tsx`); #25 Live Parameter Matrix (`Parameters.tsx`); #26 Plant Performance Center (`Performance.tsx`); #27 Batch & Lot Ledger (`Ledger.tsx`); #28 Interactive Recipe Lab (`Recipes.tsx`) |
| `pt-BR` | Official pack `antd/locale/pt_BR`, loaded with `en_US` in a `ConfigProvider` (`Shell.tsx:7-11,148`). The Ledger passes the pack's `DatePicker` locale and the dayjs `pt-br` locale to its range picker (`Ledger.tsx:250-251`). |
| Density and theme | Native: `theme.compactAlgorithm`, `darkAlgorithm` and the Table `size` prop (`Shell.tsx:145-149`). No Gap. |

## Translation Burden

The official pack translates the strings Ant Design takes from its locale object (Table, Modal, Pagination, DatePicker, `global.close` and others). The strings below are rendered by Ant Design with no locale key, so the pack does not cover them.

### Translated in the core dictionaries

| String Ant Design renders | Core key | Screen | Wired at |
|---|---|---|---|
| Select-all checkbox of Table row selection, fixed English `Select all` (`antd/lib/table/hooks/useSelection.js:367`, not the pack's `Table.selectAll`) | `parameters.select-all-tags` | Live Parameter Matrix | `Parameters.tsx:226` |
| | `ledger.select-all` | Batch & Lot Ledger | `Ledger.tsx:321` |
| | `control.select-all-alarms` | Control Room Command | `Control.tsx:240` |
| Row checkbox of Table row selection, fixed English `Select row N` or `Row N selected` (`useSelection.js:392,426`) | `parameters.select-tag` | Live Parameter Matrix | `Parameters.tsx:227` |
| | `ledger.select-batch` | Batch & Lot Ledger | `Ledger.tsx:322` |
| | `control.select-alarm` | Control Room Command | `Control.tsx:241` |
| Clear button of Select with `allowClear`, fixed English `Clear` (`@rc-component/select` `hooks/useAllowClear.js:28`) | `action.clear-filters` | Live Parameter Matrix | `Parameters.tsx:189,195,201` |
| | | Control Room Command | `Control.tsx:46,54,199,207,215,223` |
| | | Batch & Lot Ledger | `Ledger.tsx:272` |
| | | Interactive Recipe Lab | `Recipes.tsx:42,48` |

### Rendered by Ant Design in English under `pt-BR`, with no override in the app

The pack has no key for these accessible names, and the app cannot set them. They are exposed to assistive technology in `pt-BR` as written.

| String | Where Ant Design renders it | Screens | Evidence |
|---|---|---|---|
| `Increase Value`, `Decrease Value` (names of the stepper buttons) | Steppers of `InputNumber` that keep `controls` | Live Parameter Matrix override value (`Parameters.tsx:270`); Interactive Recipe Lab Parameter fields (`Recipes.tsx:125`) | `@rc-component/input-number` `lib/StepHandler.js:85` sets `aria-label` from a fixed English literal; `controls` accepts only a boolean or `{ upIcon, downIcon }`, which replace the content of the button and not its `aria-label`. See the Gaps table. |

### Hidden instead of translated

| String | Screen | Wired at |
|---|---|---|
| Icon name `close-circle` of the default Alert icon (and `info-circle`) | Operations Live Deck alarm banner | `Deck.tsx:174-176,193-194`; test `names every Line option and the Batch progress for assistive technology, in both languages` (`Deck.test.tsx:52-53`) |
| Icon name `down` of the Select arrow (`role="img"`), through the `suffixIcon` prop with `aria-hidden` | Every Select: the Shell (`Shell.tsx:39,85`) and the six Screens (`Deck.tsx:34`, `Control.tsx:44,52,60,109,197,205,213,221`, `Parameters.tsx:189,195,201,242`, `Performance.tsx:85,92`, `Ledger.tsx:271`, `Recipes.tsx:41,47,211,232`) | One shared `selectArrow` (`decorative-icons.tsx:4`); test `exposes no decorative arrow icon name on any Screen in en` and `in pt-BR` (`icon-names.test.tsx`) |
| Icon names `up` and `down` of the InputNumber steppers, through the `controls` prop with `upIcon` and `downIcon` set to `aria-hidden` icons | Live Parameter Matrix override value (`Parameters.tsx:270`), Interactive Recipe Lab Parameter fields (`Recipes.tsx:125`) | One shared `stepperControls` (`decorative-icons.tsx:9`); tests `names no stepper arrow icon of the override value in en` and `in pt-BR` (`Parameters.test.tsx`), `names no stepper arrow icon of the Parameter fields in en` and `in pt-BR` (`Recipes.test.tsx`) |
| The steppers of the Ledger numeric range filters, through `controls={false}` | Batch & Lot Ledger (`Ledger.tsx:77`) | The filter bounds are optional and empty by default, so a stepper has no value to step from. The Screen spec does not list steppers. Covered by the `icon-names.test.tsx` test for the `ledger` route, which finds no `up` or `down` name. |

Ant Design also renders `calendar`, `swap-right`, `caret-up`, `caret-down` and the Select tag remove icon with `aria-hidden`, so they have no accessible name.

No other string Ant Design renders by itself was found outside the pack. Modal, Drawer and Empty texts come from the pack or from props set from the core dictionaries.

## Gaps

| Capability the Screens need | What Ant Design offers natively | What the app does | Screens | Evidence |
|---|---|---|---|---|
| A virtualized grid (Batches, Tags) that is one ARIA table, with `aria-rowcount`, `aria-colcount`, absolute `aria-rowindex`, `rowgroup`, `row` and `columnheader` | `Table` with `virtual` renders the header as a `<table>` and the body as `div` rows (`@rc-component/table` `VirtualTable/BodyLine.js`). No `role` or `aria-*` attribute is set in `VirtualTable/`. | A wrapper `div role="table"` with counts, `components` that give the header and body wrapper roles, `onHeaderRow` and `onRow` that set `role="row"` and `aria-rowindex`, and `onCell` that sets `role="cell"` | Live Parameter Matrix, Batch & Lot Ledger | `Parameters.tsx:23-41,213-217`; `Ledger.tsx:29-41,302-306`; tests `renders the required blocks, native virtual Table, ordered core rows and all Machine links under StrictMode`, `renders a coherent virtual ARIA table with fixed columns and native density`, `keeps the empty placeholder in an explicit table rowgroup with coherent row and column counts`; PR #25, #27 |
| A tooltip that shows on keyboard focus of a button that a Modal or Drawer focuses while React commits | `Tooltip` with the `focus` trigger. `@rc-component/trigger` 3.10.1 calls `flushSync` when it opens (`lib/index.js:210`), and React reports `flushSync was called from inside a lifecycle method` when focus moves during a commit. | Hover goes through `Tooltip`; focus is plain React state that sets the controlled `open` prop (`ReasonTip`) | Live Parameter Matrix, Batch & Lot Ledger, Interactive Recipe Lab | `Parameters.tsx:55-66`; `Ledger.tsx:64-71`; `Recipes.tsx:88-95`; `afterEach` check that `console.error` has no calls in `Ledger.test.tsx:15` and `Recipes.test.tsx:12`; PR #25 (override Modal) |
| Separate accessible names for the From and To inputs of a date range | `DatePicker.RangePicker` passes its `aria-*` props to both inputs through one shared object (`@rc-component/picker` `PickerInput/Selector/hooks/useInputProps.js:88-89`). Mounted with `aria-label="Periodo"`, both inputs carry `Periodo`. | The picker has no `aria-label`. A wrapper `div role="group"` carries the filter name, and the inputs are named by their `placeholder` (`From`, `To`) | Batch & Lot Ledger | `Ledger.tsx:260-261`; test `renders Portuguese controls and decimal ranges without object-valued Select DOM attributes` (`Ledger.test.tsx:381`); PR #27 |
| An accessible name for each option of a virtualized Select whose visible label is not a string | `Select` renders an option list for assistive technology whose items carry `aria-label` only when the label is a string, and whose text is the raw `value` (`@rc-component/select` `lib/OptionList.js:278,287`). Option data may carry its own `aria-label`. | Each Line option sets `aria-label` to Line id, name and status while the visible label is JSX | Operations Live Deck | `Deck.tsx:36-49`; test `names every Line option and the Batch progress for assistive technology, in both languages`; PR #24 |
| Reordering the Steps of a Recipe Draft | No list or card reordering component. Drag handling in Ant Design exists for `Tree` nodes, `Upload.Dragger`, `Splitter`, `Slider`, `ColorPicker` and `Carousel`. | `Move up` and `Move down` buttons on each Step, with a reason at the first and last Step and focus kept on the moved Step. No dependency added. | Interactive Recipe Lab | `Recipes.tsx:243-244`; test `removes, adds and reorders Steps with keyboard controls, reasons at the ends and focus on the affected item`; PR #28; the Screen spec lists Move up and Move down as the Step actions ([02-interactive-recipe-lab.md](../screens/02-interactive-recipe-lab.md)) |
| Translated accessible names for the up and down buttons of a number input | `InputNumber` sets `aria-label` of each stepper button to the fixed English `Increase Value` or `Decrease Value` (`@rc-component/input-number` `lib/StepHandler.js:85`). `controls` takes a boolean or `{ upIcon, downIcon }`, and the pack (`antd/locale/pt_BR`) has no key for them. | The two buttons keep the English names in `pt-BR`. Their icons are `aria-hidden` (`stepperControls`), so the button name is the only one exposed. Steppers stay where stepping is useful and are off with `controls={false}` on the Ledger range filters. No core key is added, because nothing can consume it. | Live Parameter Matrix, Interactive Recipe Lab (steppers kept), Batch & Lot Ledger (steppers off) | `Parameters.tsx:270`; `Recipes.tsx:125`; `Ledger.tsx:77`; `decorative-icons.tsx:9` |

## How this was checked

- Source read in the installed packages: `antd` 6.6.8 (`table/hooks/useSelection.js`, `locale/pt_BR.js`, `alert/Alert.js`), `@rc-component/table`, `select`, `trigger`, `picker`, `input-number`.
- Rendered DOM in `pt-BR` for the six Screens in happy-dom, listing every `aria-label`, `title` and `placeholder`; a Select, a multiple Select with a chosen tag, a range picker with `aria-label`, and a `Tooltip` with a focus trigger inside a `Modal` (React `flushSync` error reproduced).
- Chromium at 1280 and 1440 px, `en` and `pt-BR`, light and dark, comfortable and compact, as recorded in PR #25, #26, #27 and #28; the real-browser checks of scrolled `aria-rowindex` and page overflow for the Ledger are tracked in #8.
- Test files: `Parameters.test.tsx`, `Ledger.test.tsx`, `Deck.test.tsx`, `Recipes.test.tsx`, `Control.test.tsx` (`apps/ant-design/src`).
