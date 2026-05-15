"""
Table Tennis knockout — re-exports the sport-agnostic bracket engine.

The actual bracket logic lives in app.sports.bracket.
This module is kept for backward compatibility with any existing imports.
"""
from app.sports.bracket import (  # noqa: F401
    build_bracket,
    stage_for_size,
    assign_players_to_groups,
    expected_match_count,
    _seeded_slots,
)
