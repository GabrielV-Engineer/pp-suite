# Second experiment: does the slice specification matter?

**Verdict by the rules fixed in advance: the slice spec matters.** Runs counted: 33.

| Request-only style | Acceptance gap vs B1 (points) | Production lines (median, B0 vs B1) | Markers (median, B0 vs B1) | Matters? | Slices worse |
| --- | --- | --- | --- | --- | --- |
| B0a | 0 | 29 vs 29 | 1 vs 0 | yes | SL-006, SL-008 |
| B0b | 11.1 | 134 vs 29 | 19 vs 0 | yes | SL-004, SL-006, SL-008 |

| Condition | Runs | Passes the neutral acceptance test | Production lines | Markers | Mutation score, src/ | Cost (USD) | Minutes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| B0a | 9 | 9/9 | 29 [5–30] | 1 [0–1] | n/a [n/a] | 0.21 [0.18–0.24] | 0.73 [0.50–0.88] |
| B0b | 9 | 8/9 | 134 [73–158] | 19 [0–84] | 0.77 [0.77–0.77] | 0.36 [0.30–0.51] | 1.51 [1.18–2.37] |
| B1 | 15 | 15/15 | 29 [5–53] | 0 [0–1] | 0.90 [0.85–1] | 0.29 [0.24–0.31] | 0.97 [0.78–1.16] |

## Every run

| Run | Accepted | Own tests | Production lines | Markers | Mutation src/ | USD |
| --- | --- | --- | --- | --- | --- | --- |
| SL-004-B0a-1 | yes | yes | 30 | 0 | n/a | 0.21 |
| SL-004-B0a-2 | yes | yes | 30 | 0 | n/a | 0.19 |
| SL-004-B0a-3 | yes | yes | 30 | 0 | n/a | 0.21 |
| SL-004-B0b-1 | yes | yes | 114 | 0 | 0.77 | 0.51 |
| SL-004-B0b-2 | yes | yes | 73 | 0 | n/a | 0.34 |
| SL-004-B0b-3 | yes | yes | 73 | 0 | n/a | 0.30 |
| SL-006-B0a-1 | yes | yes | 30 | 1 | n/a | 0.24 |
| SL-006-B0a-2 | yes | yes | 29 | 1 | n/a | 0.24 |
| SL-006-B0a-3 | yes | yes | 29 | 1 | n/a | 0.23 |
| SL-006-B0b-1 | yes | yes | 134 | 11 | n/a | 0.47 |
| SL-006-B0b-2 | no | yes | 155 | 33 | n/a | 0.43 |
| SL-006-B0b-3 | yes | yes | 136 | 19 | n/a | 0.45 |
| SL-008-B0a-1 | yes | yes | 12 | 1 | n/a | 0.18 |
| SL-008-B0a-2 | yes | yes | 5 | 1 | n/a | 0.22 |
| SL-008-B0a-3 | yes | yes | 6 | 1 | n/a | 0.21 |
| SL-008-B0b-1 | yes | yes | 137 | 82 | n/a | 0.35 |
| SL-008-B0b-2 | yes | yes | 91 | 45 | n/a | 0.31 |
| SL-008-B0b-3 | yes | yes | 158 | 84 | n/a | 0.36 |
| SL-004-B1-1 | yes | yes | 42 | 0 | 0.88 | 0.24 |
| SL-004-B1-2 | yes | yes | 53 | 0 | 0.85 | 0.29 |
| SL-004-B1-3 | yes | yes | 49 | 0 | 0.91 | 0.27 |
| SL-004-B1-4 | yes | yes | 43 | 0 | 0.90 | 0.31 |
| SL-004-B1-5 | yes | yes | 44 | 0 | 0.91 | 0.29 |
| SL-006-B1-1 | yes | yes | 29 | 0 | 0.85 | 0.24 |
| SL-006-B1-2 | yes | yes | 29 | 0 | 0.85 | 0.26 |
| SL-006-B1-3 | yes | yes | 30 | 1 | 0.85 | 0.29 |
| SL-006-B1-4 | yes | yes | 26 | 0 | 0.85 | 0.27 |
| SL-006-B1-5 | yes | yes | 24 | 0 | 0.85 | 0.25 |
| SL-008-B1-1 | yes | yes | 6 | 0 | 1 | 0.29 |
| SL-008-B1-2 | yes | yes | 5 | 0 | 1 | 0.29 |
| SL-008-B1-3 | yes | yes | 5 | 0 | 1 | 0.29 |
| SL-008-B1-4 | yes | yes | 6 | 0 | 1 | 0.31 |
| SL-008-B1-5 | yes | yes | 5 | 0 | 1 | 0.30 |
