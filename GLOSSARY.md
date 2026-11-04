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

## Plant domain

The fictional site is a PVC window and door frame maker in the Joinville/SC region. Extrusion makes the profiles, metalworking makes steel reinforcements and hardware, and assembly welds and assembles the frames.

**Site**:
The single fictional plant. It contains Areas.

**Area**:
A production zone of the Site: Extrusion, Metalworking or Assembly.
_Avoid_: Department, sector

**Line**:
An ordered group of Machines that produces one kind of output inside an Area. A Batch runs on one Line.
_Avoid_: Cell, production line

**Machine**:
A piece of equipment on a Line, such as an extruder, puller, press, CNC or assembly station.
_Avoid_: Unit, device, equipment

**Product**:
A window or door frame configuration that a Batch produces.
_Avoid_: SKU, item

**Recipe**:
The versioned set of Steps and Parameters that tells a Line how to make a Product.
_Avoid_: Formula, program, setup

**Recipe Version**:
One revision of a Recipe, either Draft or Approved. An Approved version is read-only, and editing it creates a new Draft.
_Avoid_: Revision, release

**Step**:
One ordered operation in a Recipe Version, such as preheat, ramp, run or cooldown.
_Avoid_: Stage, phase

**Parameter**:
A named value in a Step with a setpoint, a minimum, a maximum and a unit.
_Avoid_: Variable, setting

**Dependency Rule**:
A named check that blocks saving a Recipe Version when its Parameters are unsafe or impossible together.
_Avoid_: Validation, constraint

**Batch**:
One production run on one Line, using one Recipe Version, producing one Lot.
_Avoid_: Run, job, work order

**Lot**:
The traceable identifier of the material a Batch produces.
_Avoid_: Serial, code

**Genealogy**:
The chain that links a Lot to what it came from: material lot, extrusion run, metalwork lot, assembly serial.
_Avoid_: Traceability, history

**Tag**:
A named live measurement or setpoint on a Machine, such as a barrel zone temperature or die pressure.
_Avoid_: Signal, point, sensor

**Setpoint Override**:
A manual change to a Tag's target value, recorded in the Event Log.
_Avoid_: Manual change, tweak

**Alarm**:
A condition on a Machine that needs attention. It has a Priority (Critical, High, Medium, Low) and a state (active unacknowledged, active acknowledged, returned to normal unacknowledged, cleared).
_Avoid_: Alert, warning, fault

**Event Log**:
The chronological record of who changed what and when, including Alarm acknowledgements and Setpoint Overrides.
_Avoid_: Audit trail, history

**Shift**:
One of three 8-hour work periods (06:00 to 14:00, 14:00 to 22:00, 22:00 to 06:00) in the São Paulo time zone.
_Avoid_: Turn, period

**User**:
A fictional person with a Role (Operator, Engineer, Technician or Manager). Roles label people and never restrict actions.
_Avoid_: Account, login
