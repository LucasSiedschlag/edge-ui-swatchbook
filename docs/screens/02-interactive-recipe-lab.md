# 2. Interactive Recipe Lab

Route `/recipes`. For Engineers. Browse Recipes, edit a Draft and check it before saving.

## Shows

- **Recipe library.** Every Recipe with its Product, Line type (Extrusion, Roll forming, Stamping, CNC, Assembly), latest Recipe Version number and status (Draft or Approved). Filter by Line type and status, and search by name.
- **Recipe Version view.** Its Steps in order, each with its Parameters (name, setpoint, minimum, maximum, unit).
- **Dependency check panel.** The four Dependency Rules, each Passing or Failing. A failing rule names the Parameters involved and the limit broken.

## Dependency Rules

1. **Barrel temperature window.** Applies to Extrusion Recipes. Barrel zones 1 to 5 stay inside 165 to 195 °C, both ends included, and adjacent zones differ by at most 15 °C.
2. **Die pressure limit.** Applies to Extrusion Recipes. Die pressure may equal but not exceed its limit at the set screw speed, where the limit is 150 + 4 × screw speed (rpm), in bar. At 10 rpm, 190 bar passes and 190.1 bar fails.
3. **Weld window.** Applies to Assembly Recipes. Weld temperature stays inside 240 to 270 °C and weld time inside 20 to 40 s, both ends included.
4. **Takt limit.** Applies to Assembly Recipes. Cycle time stays strictly under the 120 s takt: 119.9 s passes and 120 s fails.

A rule that does not apply to the Recipe's Line type shows as Not applicable. Roll forming, Stamping and CNC Recipes show all four rules as Not applicable.

## Actions

| Action | Effect |
|--------|--------|
| Open a Recipe Version | Shows it. An Approved version is read-only. |
| New Draft | Copies an Approved version into a new Draft. Logged. Version numbers keep increasing after a Discard: discarding v3 makes the next Draft v4. While a Draft exists, New Draft on an older Approved version stays focusable with `aria-disabled` and the core reason. |
| Add, remove or reorder Steps | Draft only. |
| Edit Parameter values | Draft only. A value commits on Enter or blur, never per keystroke, so typing 180 never applies 1 or 18. Minimum must not exceed setpoint, and setpoint must not exceed maximum, or the committed value is rejected and the field shows an error. A decimal comma is read as a decimal point in pt-BR. |
| Save Draft | Blocked while any Dependency Rule fails. Logged. A Save that changes nothing logs nothing. |
| Approve | Allowed only for a Draft with no failing rule. It does not require a prior Save. The version becomes read-only. Logged. |
| Discard Draft | Deletes the Draft. Logged. |

The dependency check runs on every edit, and again before Save and Approve. Its summary announces rule status changes politely, while each rule keeps its status as text. Missing required Parameters name the Parameter, show an unknown actual and the returned zero sentinel rule limit.

The Screen starts with `RECIPE_DEFAULT_FILTERS` (no filters), `RECIPE_DEFAULT_SELECTION` (no open Recipe Version) and `RECIPE_DEFAULT_STEP_KIND` (no explicit Step choice). Core supplies the first addable Step kind as the suggested choice. Version choices show the Recipe id, version number and status in descending number order, for example "R01 v3 · Draft". Step kinds come from `STEP_KINDS` and Approved templates. When none is addable, explain that removing a Step lets it be added again from the Approved template.

Move up and Move down are explicit keyboard actions. The first and last Steps explain why they cannot move further. Approved fields and actions expose the read-only reason on hover and focus. Discard asks whether to discard the Draft and its working changes, with Cancel returning focus to Discard and confirmation returning focus to search.

The full-width Recipe library sits above the Version and shows all seven columns without horizontal scrolling at desktop widths. Line type, status and search share one row; the library scrolls vertically through about six to seven rows. Recipe names may ellipsize with the full text in a title. Clicking a row, pressing Enter on it or using Open Recipe Version opens its latest Version. The selected Recipe stays highlighted and exposes its selection through `aria-selected` and `aria-current` even while an older Version is open. Each row and its Open button are named after the Recipe, and each Parameter input is named with its Parameter and field, for example "Barrel zone 3, Minimum".

Below the library, the Version and sticky Dependency check panel share a two-to-one layout. If the Screen content cannot fit both, the panel appears above the Version. Step controls sit in each Step header, and its kind appears once. Move up and Move down keep focus on the same button of the moved Step. Blocked Save and Approve stay focusable with `aria-disabled`, ignore activation, and describe the core refusal and all failing rule names on hover and focus.

## States

- Library filter with no match: `recipes.library-empty`. If no Recipe Version is open either, show one whole Screen `recipes.empty` instead.
- Draft with failing rules, Draft with all rules passing, Approved read-only.
- Successful Save Draft shows `recipes.draft-saved` as a polite info status, announced again on every Save and cleared on any edit or opening another Version. A Save that changes nothing shows `recipes.no-changes` instead, with the same announcement and clearing.
- Field error (min, setpoint, max out of order) appears when a Parameter edit is committed with Enter or blur and rejected. It stays after blur restores the committed value, and clears when the field is focused again, on any input event, after a successful edit to the same Parameter, or when another Version is opened, saved or discarded.

## Required test IDs

`recipes.library`, `recipes.filter-line-type`, `recipes.filter-status`, `recipes.search`, `recipes.version`, `recipes.version-choice`, `recipes.step`, `recipes.step-choice`, `recipes.parameter`, `recipes.parameter-error`, `recipes.rule-1`, `recipes.rule-2`, `recipes.rule-3`, `recipes.rule-4`, `recipes.new-draft`, `recipes.add-step`, `recipes.save`, `recipes.approve`, `recipes.discard`, `recipes.empty`, `recipes.library-empty`.

## Out of scope

Comparing versions side by side, importing or exporting Recipes, sending a Recipe to a Line.
