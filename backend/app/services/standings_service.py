"""
Group-stage standings recalculation service.
Called after every completed group match to keep the Standing table current.
"""
from collections import defaultdict
from sqlalchemy.orm import Session, joinedload

from app.models.match import Match, MatchParticipant
from app.models.group import Standing


def recalculate_group_standings(event_id: int, group_id: int, db: Session) -> None:
    """
    Rebuild Standing rows for every participant in a single group from scratch.
    Overwrites all stat columns; creates rows on first appearance.
    """
    matches = (
        db.query(Match)
        .filter(
            Match.event_id == event_id,
            Match.group_id == group_id,
            Match.status == "done",
        )
        .options(
            joinedload(Match.participants),
            joinedload(Match.sets),
        )
        .all()
    )

    # pid → accumulated stats
    stats: dict = defaultdict(lambda: {
        "matches_played": 0,
        "wins": 0,
        "losses": 0,
        "sets_won": 0,
        "sets_lost": 0,
        "points_for": 0,
        "points_against": 0,
        "player_id": None,
        "team_id": None,
    })

    for m in matches:
        by_pos = {p.position: p for p in m.participants}
        mp1 = by_pos.get(1)
        mp2 = by_pos.get(2)
        if not mp1 or not mp2:
            continue

        p1_id = mp1.player_id or mp1.team_id
        p2_id = mp2.player_id or mp2.team_id
        if not p1_id or not p2_id:
            continue

        # Record identity on first encounter
        if stats[p1_id]["player_id"] is None and stats[p1_id]["team_id"] is None:
            stats[p1_id]["player_id"] = mp1.player_id
            stats[p1_id]["team_id"]   = mp1.team_id
        if stats[p2_id]["player_id"] is None and stats[p2_id]["team_id"] is None:
            stats[p2_id]["player_id"] = mp2.player_id
            stats[p2_id]["team_id"]   = mp2.team_id

        # Tally sets and points from MatchSet records
        p1_sets = p2_sets = 0
        p1_pts  = p2_pts  = 0
        for s in m.sets:
            if s.is_complete:
                if s.winner_position == 1:
                    p1_sets += 1
                elif s.winner_position == 2:
                    p2_sets += 1
            p1_pts += s.score_p1
            p2_pts += s.score_p2

        # For aggregate-scored sports with no MatchSet rows, fall back to mp.score
        if not m.sets:
            p1_sets = mp1.score
            p2_sets = mp2.score

        winner_pos = 1 if mp1.is_winner else (2 if mp2.is_winner else None)

        stats[p1_id]["matches_played"] += 1
        stats[p2_id]["matches_played"] += 1
        stats[p1_id]["sets_won"]       += p1_sets
        stats[p1_id]["sets_lost"]      += p2_sets
        stats[p2_id]["sets_won"]       += p2_sets
        stats[p2_id]["sets_lost"]      += p1_sets
        stats[p1_id]["points_for"]     += p1_pts
        stats[p1_id]["points_against"] += p2_pts
        stats[p2_id]["points_for"]     += p2_pts
        stats[p2_id]["points_against"] += p1_pts

        if winner_pos == 1:
            stats[p1_id]["wins"]   += 1
            stats[p2_id]["losses"] += 1
        elif winner_pos == 2:
            stats[p2_id]["wins"]   += 1
            stats[p1_id]["losses"] += 1

    # Upsert one Standing row per participant
    for pid, row in stats.items():
        is_team = row["team_id"] is not None
        if is_team:
            standing = db.query(Standing).filter(
                Standing.event_id == event_id,
                Standing.group_id == group_id,
                Standing.team_id  == pid,
            ).first()
        else:
            standing = db.query(Standing).filter(
                Standing.event_id  == event_id,
                Standing.group_id  == group_id,
                Standing.player_id == pid,
            ).first()

        if not standing:
            standing = Standing(
                event_id=event_id,
                group_id=group_id,
                player_id=row["player_id"],
                team_id=row["team_id"],
            )
            db.add(standing)

        standing.matches_played = row["matches_played"]
        standing.wins           = row["wins"]
        standing.losses         = row["losses"]
        standing.sets_won       = row["sets_won"]
        standing.sets_lost      = row["sets_lost"]
        standing.points_for     = row["points_for"]
        standing.points_against = row["points_against"]
        standing.ranking_points = row["wins"] * 2

    db.flush()
