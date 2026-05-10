"""
Group-stage + knockout utilities.
Independent of the direct-knockout implementation — reuses bracket primitives only.
"""
import random
from itertools import combinations
from typing import List, Tuple

from sqlalchemy.orm import Session

from app.models.group import Group, Standing
from app.sports.table_tennis.knockout import build_bracket, stage_for_size  # noqa: F401 (re-export)


def assign_players_to_groups(
    player_ids: List,
    num_groups: int,
    *,
    shuffle: bool = True,
) -> List[List]:
    """
    Distribute player_ids as evenly as possible across num_groups.
    Returns a list of lists, one per group, in snake-draft order.

    Example — 9 players, 3 groups:
        slot 0: A, B, C  (forward pass)
        slot 1: C, B, A  (backward pass — keeps totals even)
        slot 2: A, B, C
    This mirrors a tournament seed draw.
    """
    ids = list(player_ids)
    if shuffle:
        random.shuffle(ids)

    groups: List[List] = [[] for _ in range(num_groups)]
    for i, pid in enumerate(ids):
        groups[i % num_groups].append(pid)
    return groups


def build_round_robin_pairs(player_ids: List) -> List[Tuple]:
    """Return all unique unordered pairs for a round-robin within one group."""
    return list(combinations(player_ids, 2))


def get_qualified_players(
    event_id: int,
    qualifiers_per_group: int,
    db: Session,
) -> List:
    """
    Extract the top `qualifiers_per_group` players from each group using the
    Standing table (must be up-to-date before calling this).

    Sort order within a group: wins DESC → set_diff DESC → point_diff DESC.

    Seeding interleave — A1, B1, C1, …, A2, B2, C2, … — so top seeds from
    different groups are distributed across opposite halves of the bracket.
    """
    groups = (
        db.query(Group)
        .filter(Group.event_id == event_id)
        .order_by(Group.name)
        .all()
    )

    # bucket[seed_index] = [pid_from_group_A, pid_from_group_B, ...]
    buckets: List[List] = [[] for _ in range(qualifiers_per_group)]

    for group in groups:
        standings = (
            db.query(Standing)
            .filter(
                Standing.event_id == event_id,
                Standing.group_id == group.group_id,
            )
            .all()
        )
        # Sort with tiebreakers applied in Python (SQLAlchemy expression arithmetic
        # on nullable columns can be unreliable across databases).
        def _sort_key(s: Standing):
            set_diff   = (s.sets_won or 0) - (s.sets_lost or 0)
            point_diff = (s.points_for or 0) - (s.points_against or 0)
            return (-(s.wins or 0), -set_diff, -point_diff)

        standings = sorted(standings, key=_sort_key)

        for rank, s in enumerate(standings[:qualifiers_per_group]):
            pid = s.team_id or s.player_id
            if pid:
                buckets[rank].append(pid)

    # Interleave: first-place finishers, then second-place, etc.
    result = []
    for bucket in buckets:
        result.extend(bucket)
    return result
