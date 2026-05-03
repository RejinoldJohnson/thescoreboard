"""
Direct-knockout bracket generator for Table Tennis.

Handles every player count correctly:

  n=2  → Final
  n=3  → Semi + Final
  n=4  → 2×Semi + Final
  n=5  → 1×Quarter + 2×Semi + Final
  n=6  → 2×Quarter + 2×Semi + Final
  n=7  → 3×Quarter + 2×Semi + Final
  n=8  → 4×Quarter + 2×Semi + Final
  n=9  → 1×Knockout + 4×Quarter + 2×Semi + Final
  n=12 → 4×Knockout + 4×Quarter + 2×Semi + Final
  …

Rules:
  • Byes happen ONLY in round 1 to balance the bracket to the next power-of-2.
  • From round 2 onward every slot produces a match (participants may be TBD).
  • Stage label is determined by the number of participants in THAT round:
      2  → "final"
      4  → "semi"
      8  → "quarter"
      16+ → "knockout"
  • Round-1 matches are labeled by the size of round 2 (same rule applied to
    half_bracket), so they always flow into the correctly-named next stage.
"""
import math
import random
from typing import List, Optional, Tuple


# ── Public helpers ────────────────────────────────────────────

def stage_for_size(n: int) -> str:
    """Map the number of participants in a round to its stage name."""
    if n <= 2: return "final"
    if n <= 4: return "semi"
    if n <= 8: return "quarter"
    return "knockout"


def build_bracket(
    player_ids: List,
    *,
    shuffle: bool = True,
    third_place: bool = False,
) -> List[dict]:
    """
    Return an ordered list of match-specs for a direct-knockout tournament.

    Each spec is a dict:
        pid1   : player/team ID or None (= TBD placeholder)
        pid2   : player/team ID or None (= TBD placeholder)
        stage  : "knockout" | "quarter" | "semi" | "final" | "third_place"
        round  : 1-based integer

    Matches are ordered chronologically (earlier rounds first).
    """
    ids = list(player_ids)
    if len(ids) < 2:
        return []

    if shuffle:
        random.shuffle(ids)

    n = len(ids)
    bracket_size = 2 ** math.ceil(math.log2(n)) if n > 1 else 2
    half_bracket = bracket_size // 2          # participants in round 2

    # How many players play a real match in round 1 vs get a bye
    r1_match_count = n - half_bracket         # e.g. n=12 → 4 matches
    bye_count      = half_bracket - r1_match_count  # e.g. n=12 → 4 byes

    bye_players = ids[:bye_count]              # advance directly to round 2
    r1_players  = ids[bye_count:]              # play in round 1

    # R1 label = stage that round 2 feeds INTO (determined by half_bracket size)
    r1_stage = stage_for_size(half_bracket)

    specs: List[dict] = []

    # ── Round 1 ──────────────────────────────────────────────
    round_num = 1
    r1_winners = []  # None = match winner TBD, real ID = odd-player free pass

    for i in range(0, len(r1_players), 2):
        a = r1_players[i]
        b = r1_players[i + 1] if i + 1 < len(r1_players) else None

        if b is not None:
            specs.append({"pid1": a, "pid2": b, "stage": r1_stage, "round": round_num})
            r1_winners.append(None)
        else:
            # Odd number of round-1 players: last one gets a free pass
            r1_winners.append(a)

    # ── Rounds 2 + (power-of-2, no more byes) ────────────────
    # Bye players fill the first half of the round-2 seed list;
    # round-1 winners (or TBDs) fill the second half.
    # The combined list always has exactly half_bracket entries (a power of 2).
    current: List[Optional] = list(bye_players) + r1_winners
    round_num = 2

    while len(current) > 1:
        stage    = stage_for_size(len(current))
        next_rnd = []

        for i in range(0, len(current), 2):
            if i + 1 >= len(current):
                # Truly no partner (odd length — should never happen in a
                # power-of-2 bracket, but handled defensively).
                next_rnd.append(current[i])
                continue

            a = current[i]
            b = current[i + 1]
            # a and/or b may be None (TBD) — always create the match slot.
            specs.append({"pid1": a, "pid2": b, "stage": stage, "round": round_num})
            next_rnd.append(None)

        current = next_rnd
        round_num += 1

    # ── Optional 3rd-place match ──────────────────────────────
    if third_place and n >= 4:
        specs.append({"pid1": None, "pid2": None, "stage": "third_place", "round": round_num})

    return specs


# ── Convenience: expected match counts ───────────────────────

def expected_match_count(n: int, third_place: bool = False) -> int:
    """Return the number of matches that build_bracket will produce."""
    if n < 2:
        return 0
    # Every player except the champion loses exactly once → n-1 matches
    count = n - 1
    if third_place and n >= 4:
        count += 1
    return count
