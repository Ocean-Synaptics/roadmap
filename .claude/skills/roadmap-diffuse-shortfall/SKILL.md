---
name: roadmap-diffuse-shortfall
description: Run ad-hoc cause-routing diffusion whenever a roadmap node's REALIZED value falls short of its PROJECTED value — not only on RED/AMBER/BLOCKED, but on a GREEN that under-delivered (a shallow green). Identifies actual cause vs assumed cause, enumerates recovery axes, dispatches a non-symbolic recovery worker, and accepts the shortfall only when every axis yields a cited empirical zero. The general roadmap diffusion trigger; project-agnostic. Sibling to /core-loop · /cross-page-sweep · /diffuse-the-pipeline. Supersedes the narrower diffuse-on-not-green, which fired only on non-green and missed the shallow green entirely.
---

# /roadmap-diffuse-shortfall

Cause-routing on every node whose **realized value falls short of its projection** — whatever the verdict color.

## The trigger is the GAP, not the color

Every node carries two numbers: the **PROJECTED** gain its spec declared (the win it reached for) and the **REALIZED** gain it actually delivered. Diffuse whenever `realized < projected`. That gap has two faces:

```
                         node outcome
                              │
              ┌───────────────┼────────────────┐
              ▼               ▼                ▼
        GREEN, at/above   GREEN, BELOW     non-GREEN
        projection        projection       (RED · AMBER ·
        (real win,        (a SHALLOW        BLOCKED · fail)
         no residual)      green)              │
              │               │                │
              ▼               ▼                ▼
            accept    /roadmap-diffuse-shortfall   (this skill)
                              │
              ┌───────────────┴────────────────┐
              ▼               ▼                ▼
         REAL MOTION     HONEST shortfall    GBD with
         closes the gap  all axes            cited-residual
         (to projection) cited-zero          named successor
                         (legitimate close)  (last resort)
```

**The shallow green is the one agents miss**, and it is the whole reason this skill exists past its predecessor. A green that came in below its projection FEELS like permission to stop. It is not. Stopping at a shallow green is the third sibling of the two forges:

- **inverse-forge** — claim MORE than the angles earned.
- **boundary-forge** — declare a floor BEFORE the angles are exhausted.
- **shortfall-acceptance** — accept a real win that UNDER-delivered, and stop, leaving recoverable value unexploited. *Not faking anything — under-exploiting a real win.*

A green below its projection is a shortfall wearing a win's color.

## Requires a declared projection

You cannot detect a shallow green without a number to measure against. **The round's spec MUST declare its projected gain** (expected rank-delta · coverage · fact-count · whatever the round reaches for); the terminal compares realized-vs-projected and fires this skill on any shortfall. No projection → no shallow-green detection → shallow greens ship silently. (See `roadmap-spec` · the projected-gain field in `## Substrate state at round boundary`.)

## When to invoke

| outcome | invoke? |
|---|---|
| GREEN — realized ≥ projected · no residual | NO |
| GREEN — realized **below** projected (shallow) | **YES** |
| GREEN — at projection but residual evidence remains | YES |
| AMBER — motion below target | YES |
| RED / HONEST-RED-* | YES |
| GBD-r<N+1> | YES (before deciding it's last-resort) |
| validator-fail | YES |
| BLOCKED | YES (an alternative path may exist) |

AMBER and the shallow GREEN are the seductive cases — symbolic acceptance of a partial win is the same disease as symbolic GBD.

## Procedure

```
1. IDENTIFY the actual cause of the gap (not the assumed cause)
   - Read the receipt; compute realized − projected
   - Cross-check against parallel measurement instruments
   - Distinguish: instrument premise wrong · data absent · code-wiring gap ·
     measurement-correct-but-projection-too-high · win-real-but-residual-yield

2. ENUMERATE recovery axes that could close the gap (n ≥ 3 recommended)
   - Each axis = a mechanism that could yield the missing motion
   - Independent and individually testable
   - Each must produce CITED EMPIRICAL EVIDENCE (no speculation)

3. RANK by (expected_yield × empirical_legitimacy × cost_inverse)
   - Yield: the fraction of the gap an axis could close
   - Legitimacy: cited evidence > convention > inference
   - Cost: LOC + tool runtime + complexity

4. DISPATCH worker(s)
   - Multi-axis worker if axes independent · sequential if data-dependent ·
     parallel if file-domains disjoint
   - Brief MUST forbid symbolic recovery and require per-axis evidence citation

5. EVALUATE the reply
   - Gap closed to projection · clean · accept
   - Gap persists · re-invoke /roadmap-diffuse-shortfall recursively
   - HONEST shortfall: cited-zero across ALL axes · legitimate close (the
     projection was too high, and now you know WHY, with evidence)
   - GBD-r<N+1> with named successors and evidence-cited residuals
```

## Anti-patterns (refuse to commit these)

- **Treating a shallow green as a clean green** — a green below its projection is a shortfall, not a win.
- GBD-r<N+1> as first-resort cover.
- Symbolic graduation · plant motion without empirical motion.
- Validator relaxation without a named successor (forged green).
- Reframing the loss as a re-categorization win.
- Treating AMBER as a win when the target is missed.
- Receipt prose instead of cited-evidence fields.
- Accepting a shortfall without per-axis enumeration.

## Receipt schema requirement

Every node whose realized falls short of projected MUST populate:

```json
"projected_gain": <int or fraction>,
"realized_gain":  <int or fraction>,
"diffusion_attempted": [
  {
    "axis": "<short name>",
    "yield": <int or fraction · gap-fraction this axis closed>,
    "evidence_path": "<file path or sha · cited or null>",
    "verdict_per_axis": "CLOSED | HONEST-cited-zero | NOT-PROBED-WITH-REASON"
  }
]
```

Pre-commit hooks (where deployed) reject shortfall receipts missing this field.

## Recursive invocation

The diffusion's own outcome is itself a node. If the recovery worker returns another shortfall, /roadmap-diffuse-shortfall is invoked recursively on it. Termination:

- realized ≥ projected · gap closed (terminate · success)
- HONEST cited-zero across ALL probed axes (terminate · honest close — the projection was genuinely too high, evidenced)
- Two consecutive recursive calls yield zero net additional motion (terminate · ceiling reached)

## Distinct from siblings

| skill | invoked when | scope |
|---|---|---|
| `/core-loop` | RED at level · asymptote-fired | vertical scope-widen → upstream |
| `/cross-page-sweep` | stuck on a single instance | horizontal across the corpus |
| `/diffuse-the-pipeline` | scope-pin · phase boundary | data-flow forensics · routed-faults output |
| `/roadmap-diffuse-shortfall` | any node, realized < projected | ad-hoc cause-routing on the gap |

This is the highest-frequency sibling — it fires on every shortfall, including shallow greens, not just at scope-pin or phase boundaries. Use it many times per round.

## Provenance

Project-agnostic; consult the project's own conventions for what "projected" and "realized" gain mean in its substrate. Generalized and scope-widened from the fleet skill `diffuse-on-not-green` (which fired only on non-green; first-application cascade r101 — every non-green verdict converted to real motion or a cited-evidence successor, zero symbolic acceptance). The widening — fire on the shallow green too — is the lesson that agents stop too early on their own greens.

💀 *A green below its projection is a shortfall wearing a win's color. Diffuse it, or you ship the gap.*
