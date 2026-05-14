"""
Direct-knockout bracket generator — power-of-2 with at-most-1-bye guarantee.

Core rule
─────────
Every participant receives AT MOST ONE bye across the entire tournament.
After a bye, that participant MUST compete in the very next round.
This is achieved by padding the bracket to the next power of 2 and giving
all byes exclusively in round 1 (the "preliminary" round).  From round 2
onward the bracket is a perfect power of 2 — no further byes are ever needed.

How it works
────────────
Given n players:
  1.  Compute the next power-of-2 bracket size B = 2^⌈log₂(n)⌉.
  2.  The "main bracket" starts at B/2 players (half_bracket).
  3.  Preliminary matches needed = n − half_bracket.
      Bye players             = half_bracket − preliminary_matches.
  4.  Round 1: preliminary_matches real matches are played.
      The remaining bye_players skip round 1 and enter the main bracket directly.
  5.  Round 2+: always half_bracket players, always a clean power of 2 — no byes.

Round-1 stage label
───────────────────
  • If bye_count > 0  →  "preliminary"   (some slots are skipped; not a full round)
  • If bye_count == 0 →  stage_for_size(n)  (everyone plays; this IS the named round)

Example outputs
───────────────
  n=2  →  1 final
  n=3  →  1 preliminary  + 1 final            (1 bye → plays final)
  n=4  →  2 semi         + 1 final            (no byes)
  n=5  →  1 preliminary  + 2 semi  + 1 final  (3 byes → play semi)
  n=8  →  4 quarter      + 2 semi  + 1 final  (no byes)
  n=9  →  1 preliminary  + 4 quarter + 2 semi + 1 final  (7 byes → play quarter)
  n=12 →  4 preliminary  + 4 quarter + 2 semi + 1 final  (4 byes → play quarter)
  n=16 →  8 round_of_16  + 4 quarter + 2 semi + 1 final  (no byes)
"""
import math
import random
from typing import Dict, List, Optional


# ── Stage naming ─────────────────────────────────────────────

def stage_for_size(n: int) -> str:
    """Map player count entering a round to its stage name."""
    if n <= 2:  return "final"
    if n <= 4:  return "semi"
    if n <= 8:  return "quarter"
    if n <= 16: return "round_of_16"
    if n <= 32: return "round_of_32"
    return "preliminary"


# ── Seeded slot ordering ──────────────────────────────────────

def _seeded_slots(n: int) -> List[int]:
    """
    Return a slot ordering for a power-of-2 bracket of size n so that:
      - Seed 1 (index 0) and Seed 2 (index 1) are in opposite halves.
      - Seeds 3 and 4 are each in a different quarter from seeds 1 and 2.
      - And so on recursively.

    Example: n=4 → [0, 3, 1, 2]  (seeds 1&2 are slots 0 and 3)
             n=8 → [0, 7, 3, 4, 1, 6, 2, 5]
    """
    if n == 2:
        return [0, 1]
    half = _seeded_slots(n // 2)
    result = []
    for r in half:
        result.append(r)
        result.append(n - 1 - r)
    return result


# ── Bracket builder ───────────────────────────────────────────

def build_bracket(
    player_ids: List,
    *,
    shuffle: bool = True,
    third_place: bool = False,
    seed_scores: Optional[Dict] = None,
) -> List[dict]:
    """
    Return an ordered list of match-specs for a single-elimination tournament.

    Each spec:
        pid1   : player/team ID  or  None (TBD — to be filled by winner propagation)
        pid2   : player/team ID  or  None
        stage  : stage name string
        round  : 1-based integer

    Guarantee: every participant receives at most ONE bye.
    Round 1 may be a "preliminary" round (if the count is not a power of 2).
    Rounds 2+ form a clean power-of-2 bracket with zero byes.
    """
    ids = list(player_ids)
    n   = len(ids)
    if n < 2:
        return []

    if seed_scores:
        # Sort descending by seed score so top seeds get the best bracket positions.
        # Players without a seed score are treated as 0 (lowest priority).
        ids.sort(key=lambda pid: seed_scores.get(pid, 0), reverse=True)
    elif shuffle:
        random.shuffle(ids)

    # ── Bracket sizing ────────────────────────────────────────
    bracket_size = 2 ** math.ceil(math.log2(n)) if n > 1 else 2
    half_bracket = bracket_size // 2          # players entering round 2 (power of 2)

    prelim_count = n - half_bracket           # real matches in round 1
    bye_count    = half_bracket - prelim_count # players who skip round 1

    # When seeding is active and this is a perfect power-of-2 bracket (no byes),
    # reorder players into seeded slots so top seeds end up on opposite halves.
    if seed_scores and bye_count == 0:
        slots = _seeded_slots(n)
        seeded = [None] * n
        for rank, slot in enumerate(slots):
            if rank < len(ids):
                seeded[slot] = ids[rank]
        ids = [pid for pid in seeded if pid is not None]

    bye_players  = ids[:bye_count]            # advance directly to round 2
    r1_players   = ids[bye_count:]            # compete in round 1

    # ── Round 1 stage label ───────────────────────────────────
    # When bye_count > 0 some players skip this round → it is a preliminary.
    # When bye_count == 0 everyone plays → label it by the proper round name.
    if bye_count > 0:
        r1_stage = "preliminary"
    else:
        r1_stage = stage_for_size(n)

    specs: List[dict] = []
    round_num = 1

    # ── Round 1 ───────────────────────────────────────────────
    r1_winners: List[Optional] = []
    for i in range(0, len(r1_players), 2):
        a = r1_players[i]
        b = r1_players[i + 1] if i + 1 < len(r1_players) else None
        if b is not None:
            specs.append({"pid1": a, "pid2": b, "stage": r1_stage, "round": round_num})
            r1_winners.append(None)    # winner is TBD
        else:
            # Odd player among r1_players: gets a free pass into round 2.
            # (Only happens when prelim_count itself is odd, which is rare.)
            r1_winners.append(a)

    # ── Rounds 2+ (clean power-of-2, zero byes) ──────────────
    # Bye players fill the first slots of round 2; round-1 winners fill the rest.
    # Together they always total exactly half_bracket (a power of 2).
    current: List[Optional] = list(bye_players) + r1_winners
    round_num = 2

    while len(current) > 1:
        stage    = stage_for_size(len(current))
        next_rnd: List[Optional] = []

        for i in range(0, len(current), 2):
            if i + 1 >= len(current):
                # Odd length — should never occur in a power-of-2 bracket,
                # but handle defensively.
                next_rnd.append(current[i])
                continue
            a = current[i]
            b = current[i + 1]
            specs.append({"pid1": a, "pid2": b, "stage": stage, "round": round_num})
            next_rnd.append(None)

        current   = next_rnd
        round_num += 1

    # ── Optional 3rd-place match ──────────────────────────────
    if third_place and n >= 4:
        specs.append({"pid1": None, "pid2": None, "stage": "third_place", "round": round_num})

    return specs


# ── Convenience ───────────────────────────────────────────────

def expected_match_count(n: int, third_place: bool = False) -> int:
    """Total matches build_bracket will produce (always n-1, plus 1 for third_place)."""
    if n < 2:
        return 0
    count = n - 1
    if third_place and n >= 4:
        count += 1
    return count
