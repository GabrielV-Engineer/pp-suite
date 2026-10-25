# Experiment results

**Verdict by the rules fixed in advance: not supported.** Runs counted: 45.

| T beats… | Beats? | Pooled median (T vs baseline) | Slices won |
| --- | --- | --- | --- |
| B1 on mutation score of src/ (H1) | no | 0.87 vs 0.90 | none |
| B2 on mutation score of src/ (H1) | no | 0.87 vs 0.89 | SL-006 |
| B1 on out-of-scope markers (H2, fewer) | no | 0 vs 0 | none |
| B2 on out-of-scope markers (H2, fewer) | no | 0 vs 0 | none |

Never worse on test edits (H3): B1 yes, B2 yes. Cost of T over B1 (median): 2.52x (limit: under 3x).

## SL-004

| Measure | B1 median [range] | B2 median [range] | T median [range] |
| --- | --- | --- | --- |
| Mutation score, src/ (H1) | 0.90 [0.85–0.91] | 0.89 [0.86–0.94] | 0.87 [0.86–0.87] |
| Mutation score, all files measured | 0.90 [0.62–0.91] | 0.87 [0.65–0.94] | 0.86 [0.59–0.87] |
| Out-of-scope markers | 0 [0–0] | 0 [0–0] | 0 [0–0] |
| Commits editing tests after the first | 0 [0–0] | 0 [0–0] | 0 [0–0] |
| Lines to read | 150 [120–162] | 203 [142–225] | 141 [127–154] |
| Cost (USD) | 0.29 [0.24–0.31] | 0.33 [0.22–0.35] | 0.73 [0.71–0.75] |
| Minutes | 0.99 [0.83–1.16] | 1.49 [1.26–1.76] | 2.82 [2.30–3.58] |
| Passes the neutral acceptance test | 5/5 | 5/5 | 5/5 |
| Passes its own tests | 5/5 | 5/5 | 5/5 |

## SL-006

| Measure | B1 median [range] | B2 median [range] | T median [range] |
| --- | --- | --- | --- |
| Mutation score, src/ (H1) | 0.85 [0.85–0.85] | 0.81 [0.80–0.85] | 0.83 [0.83–0.83] |
| Mutation score, all files measured | 0.85 [0.85–0.85] | 0.81 [0.80–0.85] | 0.83 [0.83–0.83] |
| Out-of-scope markers | 0 [0–1] | 0 [0–1] | 0 [0–0] |
| Commits editing tests after the first | 0 [0–0] | 0 [0–0] | 0 [0–0] |
| Lines to read | 132 [122–140] | 144 [140–169] | 139 [122–162] |
| Cost (USD) | 0.26 [0.24–0.29] | 0.27 [0.27–0.30] | 0.73 [0.68–0.75] |
| Minutes | 0.81 [0.78–1.01] | 1.17 [0.94–1.22] | 2.54 [2.16–2.69] |
| Passes the neutral acceptance test | 5/5 | 5/5 | 5/5 |
| Passes its own tests | 5/5 | 5/5 | 5/5 |

## SL-008

| Measure | B1 median [range] | B2 median [range] | T median [range] |
| --- | --- | --- | --- |
| Mutation score, src/ (H1) | 1 [1–1] | 1 [1–1] | 1 [1–1] |
| Mutation score, all files measured | 1 [1–1] | 1 [0.16–1] | 1 [0.16–1] |
| Out-of-scope markers | 0 [0–0] | 0 [0–0] | 0 [0–0] |
| Commits editing tests after the first | 0 [0–0] | 0 [0–0] | 0 [0–0] |
| Lines to read | 156 [135–164] | 209 [194–217] | 238 [194–285] |
| Cost (USD) | 0.29 [0.29–0.31] | 0.34 [0.28–0.36] | 0.78 [0.70–0.81] |
| Minutes | 1.00 [0.91–1.09] | 1.30 [0.88–1.50] | 2.80 [2.44–3.10] |
| Passes the neutral acceptance test | 5/5 | 5/5 | 5/5 |
| Passes its own tests | 5/5 | 5/5 | 5/5 |

## All slices pooled

| Measure | B1 median [range] | B2 median [range] | T median [range] |
| --- | --- | --- | --- |
| Mutation score, src/ (H1) | 0.90 [0.85–1] | 0.89 [0.80–1] | 0.87 [0.83–1] |
| Mutation score, all files measured | 0.90 [0.62–1] | 0.86 [0.16–1] | 0.86 [0.16–1] |
| Out-of-scope markers | 0 [0–1] | 0 [0–1] | 0 [0–0] |
| Commits editing tests after the first | 0 [0–0] | 0 [0–0] | 0 [0–0] |
| Lines to read | 140 [120–164] | 194 [140–225] | 154 [122–285] |
| Cost (USD) | 0.29 [0.24–0.31] | 0.33 [0.22–0.36] | 0.74 [0.68–0.81] |
| Minutes | 0.97 [0.78–1.16] | 1.26 [0.88–1.76] | 2.69 [2.16–3.58] |
| Passes the neutral acceptance test | 15/15 | 15/15 | 15/15 |
| Passes its own tests | 15/15 | 15/15 | 15/15 |

## Every run

| Run | Accepted | Own tests | Mutation | src/ only | Markers | Test-edit commits | Lines to read | USD |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SL-004-B1-1 | yes | yes | 0.67 | 0.88 | 0 | 0 | 135 | 0.24 |
| SL-004-B1-2 | yes | yes | 0.62 | 0.85 | 0 | 0 | 120 | 0.29 |
| SL-004-B1-3 | yes | yes | 0.91 | 0.91 | 0 | 0 | 159 | 0.27 |
| SL-004-B1-4 | yes | yes | 0.90 | 0.90 | 0 | 0 | 162 | 0.31 |
| SL-004-B1-5 | yes | yes | 0.91 | 0.91 | 0 | 0 | 150 | 0.29 |
| SL-004-B2-1 | yes | yes | 0.65 | 0.89 | 0 | 0 | 145 | 0.22 |
| SL-004-B2-2 | yes | yes | 0.89 | 0.89 | 0 | 0 | 142 | 0.33 |
| SL-004-B2-3 | yes | yes | 0.86 | 0.86 | 0 | 0 | 224 | 0.35 |
| SL-004-B2-4 | yes | yes | 0.87 | 0.87 | 0 | 0 | 203 | 0.33 |
| SL-004-B2-5 | yes | yes | 0.94 | 0.94 | 0 | 0 | 225 | 0.34 |
| SL-004-T-1 | yes | yes | 0.59 | 0.87 | 0 | 0 | 143 | 0.74 |
| SL-004-T-2 | yes | yes | 0.87 | 0.87 | 0 | 0 | 141 | 0.73 |
| SL-004-T-3 | yes | yes | 0.86 | 0.86 | 0 | 0 | 127 | 0.71 |
| SL-004-T-4 | yes | yes | 0.86 | 0.86 | 0 | 0 | 154 | 0.75 |
| SL-004-T-5 | yes | yes | 0.87 | 0.87 | 0 | 0 | 131 | 0.73 |
| SL-006-B1-1 | yes | yes | 0.85 | 0.85 | 0 | 0 | 132 | 0.24 |
| SL-006-B1-2 | yes | yes | 0.85 | 0.85 | 0 | 0 | 140 | 0.26 |
| SL-006-B1-3 | yes | yes | 0.85 | 0.85 | 1 | 0 | 122 | 0.29 |
| SL-006-B1-4 | yes | yes | 0.85 | 0.85 | 0 | 0 | 139 | 0.27 |
| SL-006-B1-5 | yes | yes | 0.85 | 0.85 | 0 | 0 | 132 | 0.25 |
| SL-006-B2-1 | yes | yes | 0.81 | 0.81 | 0 | 0 | 140 | 0.28 |
| SL-006-B2-2 | yes | yes | 0.85 | 0.85 | 0 | 0 | 169 | 0.27 |
| SL-006-B2-3 | yes | yes | 0.80 | 0.80 | 1 | 0 | 144 | 0.30 |
| SL-006-B2-4 | yes | yes | 0.80 | 0.80 | 0 | 0 | 144 | 0.27 |
| SL-006-B2-5 | yes | yes | 0.84 | 0.84 | 0 | 0 | 143 | 0.27 |
| SL-006-T-1 | yes | yes | 0.83 | 0.83 | 0 | 0 | 157 | 0.73 |
| SL-006-T-2 | yes | yes | 0.83 | 0.83 | 0 | 0 | 162 | 0.75 |
| SL-006-T-3 | yes | yes | 0.83 | 0.83 | 0 | 0 | 139 | 0.68 |
| SL-006-T-4 | yes | yes | 0.83 | 0.83 | 0 | 0 | 122 | 0.75 |
| SL-006-T-5 | yes | yes | 0.83 | 0.83 | 0 | 0 | 122 | 0.68 |
| SL-008-B1-1 | yes | yes | 1 | 1 | 0 | 0 | 161 | 0.29 |
| SL-008-B1-2 | yes | yes | 1 | 1 | 0 | 0 | 148 | 0.29 |
| SL-008-B1-3 | yes | yes | 1 | 1 | 0 | 0 | 164 | 0.29 |
| SL-008-B1-4 | yes | yes | 1 | 1 | 0 | 0 | 135 | 0.31 |
| SL-008-B1-5 | yes | yes | 1 | 1 | 0 | 0 | 156 | 0.30 |
| SL-008-B2-1 | yes | yes | 0.16 | 1 | 0 | 0 | 217 | 0.34 |
| SL-008-B2-2 | yes | yes | 1 | 1 | 0 | 0 | 209 | 0.36 |
| SL-008-B2-3 | yes | yes | 1 | 1 | 0 | 0 | 205 | 0.33 |
| SL-008-B2-4 | yes | yes | 1 | 1 | 0 | 0 | 211 | 0.34 |
| SL-008-B2-5 | yes | yes | 1 | 1 | 0 | 0 | 194 | 0.28 |
| SL-008-T-1 | yes | yes | 0.16 | 1 | 0 | 0 | 194 | 0.74 |
| SL-008-T-2 | yes | yes | 1 | 1 | 0 | 0 | 238 | 0.78 |
| SL-008-T-3 | yes | yes | 1 | 1 | 0 | 0 | 214 | 0.79 |
| SL-008-T-4 | yes | yes | 1 | 1 | 0 | 0 | 249 | 0.70 |
| SL-008-T-5 | yes | yes | 1 | 1 | 0 | 0 | 285 | 0.81 |
