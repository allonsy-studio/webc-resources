---
"@allons-y/webc-patterns": minor
---

The selected option in `norn-segmented-control` and the selected tab in `norn-code-tabs` now slide to a new choice: one fill or underline, placed by CSS anchor positioning, with its end edge trailing its start edge. Two new tokens set the timing: `ui.motion.slide` (200ms) and `ui.motion.trail` (90ms). Without anchor positioning, with reduced motion, or in forced colors, the selected option draws its own fill as before.
