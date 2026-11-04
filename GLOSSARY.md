# edge-ui-swatchbook

A showroom that shows the same industrial software screens built once per UI library, so the libraries can be compared side by side.

## Language

**Library**:
A UI component library under comparison. Each Library is rendered natively, in its own look and behavior.
_Avoid_: Framework, kit, design system

**Screen**:
One of the six industrial software views. A Screen has the same information, actions and route in every Library.
_Avoid_: Page, view, demo

**Parity**:
The rule that all Libraries show the same Screens, routes, Mock Dataset, information and actions, while visuals and component behavior stay native to each Library.
_Avoid_: Pixel-identical, consistency

**Gap**:
A capability a Screen needs that a Library does not offer natively, such as density support. It is shown as it is and never faked or worked around.
_Avoid_: Weakness, limitation, bug

**Translation Burden**:
The `pt-BR` strings a Library renders itself but ships no official pack for, which we translate in the core dictionaries and record against that Library.
_Avoid_: Missing locale, i18n debt

**Shell**:
The frame around a Screen: navigation, Library picker and theme/density toggles. Its structure is the same in every Library, its rendering is native.
_Avoid_: Layout, chrome

**Mock Dataset**:
The single set of fake plant data (batches, recipes, alarms, tags, performance history) that every Library reads unchanged.
_Avoid_: Fixtures, sample data

**Simulator**:
The shared deterministic source of changing values behind live Screens. Every Library shows the same numbers at the same tick.
_Avoid_: Random generator, live feed

**Tour**:
A linear, neutral walkthrough with one step per Screen, defined once as shared data. It points out what to look for and never ranks Libraries.
_Avoid_: Onboarding, wizard, demo script

**Plant State**:
The in-memory state that actions change (alarm acknowledgements, setpoints, recipe edits). Shared across Libraries as logic, reset on reload.
_Avoid_: Store, backend
