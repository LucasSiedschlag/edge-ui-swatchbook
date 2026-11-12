# 2. Interactive Recipe Lab

Route `/recipes`. For Engineers. Browse Recipes, edit a Draft and check it before saving.

## Shows

- **Recipe library.** Every Recipe with its Product, Line type (Extrusion, Roll forming, Stamping, CNC, Assembly), latest Recipe Version number and status (Draft or Approved). Filter by Line type and status, and search by name.
- **Recipe Version view.** Its Steps in order, each with its Parameters (name, setpoint, minimum, maximum, unit).
- **Dependency check panel.** The four Dependency Rules, each Passing or Failing. A failing rule names the Parameters involved and the limit broken.

## Dependency Rules

1. **Barrel temperature window.** Extrusion barrel zones stay inside 165 to 195 °C, and adjacent zones differ by at most 15 °C.
2. **Die pressure limit.** Die pressure stays under its maximum at the set screw speed.
3. **Weld window.** Weld temperature stays inside 240 to 270 °C and weld time inside 20 to 40 s.
4. **Takt limit.** Assembly cycle time stays under the 120 s takt.

A rule that does not apply to the Recipe's Line type shows as Not applicable.

## Actions

| Action | Effect |
|--------|--------|
| Open a Recipe Version | Shows it. An Approved version is read-only. |
| New Draft | Copies an Approved version into a new Draft. Logged. |
| Add, remove or reorder Steps | Draft only. |
| Edit Parameter values | Draft only. Minimum must not exceed setpoint, and setpoint must not exceed maximum, or the field shows an error. |
| Save Draft | Blocked while any Dependency Rule fails. Logged. |
| Approve | Allowed only for a Draft with no failing rule. The version becomes read-only. Logged. |
| Discard Draft | Deletes the Draft. Logged. |

The dependency check runs on every edit, and again before Save and Approve. Its summary announces rule status changes politely, while each rule keeps its status as text. Missing required Parameters name the Parameter, show an unknown actual and the returned zero sentinel rule limit.

The Screen starts with `RECIPE_DEFAULT_FILTERS` (no filters), `RECIPE_DEFAULT_SELECTION` (no open Recipe Version) and `RECIPE_DEFAULT_STEP_KIND` (no explicit Step choice). Core supplies the first addable Step kind as the suggested choice. Version choices show number and status in descending number order. Step kinds come from `STEP_KINDS` and Approved templates. When none is addable, explain that removing a Step lets it be added again from the Approved template.

Move up and Move down are explicit keyboard actions. The first and last Steps explain why they cannot move further. Approved fields and actions expose the read-only reason on hover and focus. Discard asks whether to discard the Draft and its working changes, with Cancel returning focus to Discard and confirmation returning focus to search.

The full-width Recipe library sits above the Version and shows all seven columns without horizontal scrolling at desktop widths. Line type, status and search share one row; the library scrolls vertically through about six to seven rows. Recipe names may ellipsize with the full text in a title. Clicking a row, pressing Enter on it or using Open Recipe Version opens its latest Version. The selected Recipe stays highlighted and exposes its selection even while an older Version is open.

Below the library, the Version and sticky Dependency check panel share a two-to-one layout. If the Screen content cannot fit both, the panel appears above the Version. Step controls sit in each Step header, and its kind appears once. Blocked Save and Approve stay focusable with `aria-disabled`, ignore activation, and describe the core refusal and all failing rule names on hover and focus.

## States

- Library filter with no match: `recipes.library-empty`. If no Recipe Version is open either, show one whole Screen `recipes.empty` instead.
- Draft with failing rules, Draft with all rules passing, Approved read-only.
- Field error (min, setpoint, max out of order).

## Required test IDs

`recipes.library`, `recipes.filter-line-type`, `recipes.filter-status`, `recipes.search`, `recipes.version`, `recipes.step`, `recipes.parameter`, `recipes.parameter-error`, `recipes.rule-1`, `recipes.rule-2`, `recipes.rule-3`, `recipes.rule-4`, `recipes.new-draft`, `recipes.add-step`, `recipes.save`, `recipes.approve`, `recipes.discard`, `recipes.empty`, `recipes.library-empty`.

## Out of scope

Comparing versions side by side, importing or exporting Recipes, sending a Recipe to a Line.
