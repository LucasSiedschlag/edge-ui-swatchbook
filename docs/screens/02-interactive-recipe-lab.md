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

The dependency check runs on every edit, and again before Save and Approve.

## States

- Library filter with no match: empty state.
- Draft with failing rules, Draft with all rules passing, Approved read-only.
- Field error (min, setpoint, max out of order).

## Required test IDs

`recipes.library`, `recipes.filter-line-type`, `recipes.filter-status`, `recipes.search`, `recipes.version`, `recipes.step`, `recipes.parameter`, `recipes.parameter-error`, `recipes.rule-1` to `recipes.rule-4`, `recipes.new-draft`, `recipes.add-step`, `recipes.save`, `recipes.approve`, `recipes.discard`, `recipes.empty`.

## Out of scope

Comparing versions side by side, importing or exporting Recipes, sending a Recipe to a Line.
