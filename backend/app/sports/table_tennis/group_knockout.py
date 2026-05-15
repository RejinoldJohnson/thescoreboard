"""
Table Tennis group-knockout — re-exports sport-agnostic group/bracket utilities.

The actual logic lives in app.sports.bracket.
This module is kept for backward compatibility with any existing imports.
"""
from app.sports.bracket import (  # noqa: F401
    build_bracket,
    stage_for_size,
    assign_players_to_groups,
)
from itertools import combinations
from typing import List, Tuple


def build_round_robin_pairs(player_ids: List) -> List[Tuple]:
    """Return all unique unordered pairs for a round-robin within one group."""
    return list(combinations(player_ids, 2))
