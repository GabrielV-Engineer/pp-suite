# Slices: [FEATURE NAME]

> Index only. Each slice lives in its own file under `.sddpp/slices/`, in the format defined by
> `contract/v0.1/schemas/slice.schema.json`. Do not duplicate slice details here.

| Slice | Title | Type | Depends on |
| --- | --- | --- | --- |
| SL-001 | [Deployable end-to-end skeleton] | skeleton | — |
| SL-002 | [One observable behavior] | feature | SL-001 |

Rules: every slice is a vertical cut through the layers it needs, fits the diff budget in
`.architect/blueprint.yaml`, and states what it leaves out of scope.
