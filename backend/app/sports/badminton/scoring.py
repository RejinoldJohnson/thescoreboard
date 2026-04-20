"""
Badminton scoring engine.
Rules: Best of 3 sets. Each set first to 21, win by 2.
If tied at 29-29, next point wins (30 is the cap).
"""
from typing import Optional
from app.sports.base import BaseSport


class Badminton(BaseSport):

    def get_default_config(self) -> dict:
        return {
            "sets_to_win": 2,           # best of 3 → need 2 sets
            "points_per_set": 21,       # first to 21
            "win_margin": 2,            # win by 2
            "deuce_starts_at": 20,      # deuce kicks in at 20-20
            "max_points": 30,           # cap at 30 — next point wins
            "serve_changes_on_point": True,  # server changes every point (rally scoring)
        }

    def validate_config(self, config: dict) -> dict:
        c = self.get_default_config()
        c.update({k: v for k, v in config.items() if k in c})
        if c["sets_to_win"] not in [2]:
            raise ValueError("Badminton is best of 3 — sets_to_win must be 2")
        if c["points_per_set"] not in [15, 21]:
            raise ValueError("points_per_set must be 15 or 21")
        return c

    def check_set_winner(self, score_p1: int, score_p2: int, config: dict) -> Optional[int]:
        pts     = config.get("points_per_set", 21)
        margin  = config.get("win_margin", 2)
        max_pts = config.get("max_points", 30)
        deuce   = config.get("deuce_starts_at", 20)

        for pos, mine, theirs in [(1, score_p1, score_p2), (2, score_p2, score_p1)]:
            # Normal win: reached target and ahead by margin
            if mine >= pts and mine - theirs >= margin:
                return pos
            # Cap win: reached max points (e.g. 30)
            if mine >= max_pts and mine > theirs:
                return pos

        return None

    def check_match_winner(self, sets_won_p1: int, sets_won_p2: int, config: dict) -> Optional[int]:
        needed = config.get("sets_to_win", 2)
        if sets_won_p1 >= needed:
            return 1
        if sets_won_p2 >= needed:
            return 2
        return None

    def check_instant_win(self, score_p1: int, score_p2: int, config: dict) -> Optional[int]:
        # Badminton has no instant win rule
        return None

    def get_server(self, score_p1: int, score_p2: int, first_server: int, config: dict) -> Optional[int]:
        # In rally scoring the server is whoever won the last point.
        # We track this externally via current_server on the match.
        return None

    def get_match_summary(self, match) -> dict:
        return {}

    @property
    def sport_key(self) -> str:
        return "badminton"

    @property
    def display_name(self) -> str:
        return "Badminton"

    @property
    def has_sets(self) -> bool:
        return True