from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from database import get_db
from models.models import Match, MatchParticipant, MatchSet, Player, TournamentParticipant, Group
from schemas import MatchCreate, MatchOut, MatchUpdate
from routers.auth import verify_token
import random

router = APIRouter()

# Fixed table per group — all matches in a group share the same table
GROUP_TABLE_MAP = {
    "Group A": 1,
    "Group B": 2,
    "Group C": 1,
    "Group D": 2,
}


def require_admin(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    verify_token(authorization.split(" ")[1])


def _load_match(match_id: int, db: Session) -> Match:
    m = (
        db.query(Match)
        .filter(Match.match_id == match_id)
        .options(
            joinedload(Match.participants).joinedload(MatchParticipant.player),
            joinedload(Match.sets),
        )
        .first()
    )
    if not m:
        raise HTTPException(status_code=404, detail="Match not found")
    return m


def _sets_to_win(stage: str) -> int:
    """
    group / quarter  →  best-of-3  (first to 2 sets)
    semi / final     →  best-of-5  (first to 3 sets)
    """
    return 3 if stage in ("semi", "final") else 2


def _set_winner(p1: int, p2: int) -> Optional[int]:
    """
    Returns 1 or 2 when a set is over, None if still in progress.
    7-0 is an instant win; otherwise first to 11 with a 2-point lead.
    """
    if p1 == 7 and p2 == 0: return 1
    if p2 == 7 and p1 == 0: return 2
    if p1 >= 11 and p1 - p2 >= 2: return 1
    if p2 >= 11 and p2 - p1 >= 2: return 2
    return None


def _ko_stage_label(n: int) -> str:
    if n >= 8: return "quarter"
    if n >= 4: return "semi"
    return "final"


# ── Group round advancement ────────────────────────────────────
def _group_performance_rank(player_ids: list, all_group_matches: list) -> list:
    """
    Rank player_ids by wins → sets_won → score_diff from completed matches.
    Returns sorted list best→worst.
    """
    pid_set = set(player_ids)
    stats = {pid: {"wins": 0, "sets_won": 0, "diff": 0} for pid in player_ids}
    for m in all_group_matches:
        if m.status not in ("done", "completed"):
            continue
        parts = sorted(m.participants, key=lambda x: x.position)
        for p in parts:
            if p.player_id not in pid_set:
                continue
            if p.is_winner:
                stats[p.player_id]["wins"] += 1
            stats[p.player_id]["sets_won"] += p.score
        if len(parts) == 2:
            for s in m.sets:
                if parts[0].player_id in pid_set:
                    stats[parts[0].player_id]["diff"] += s.score_p1 - s.score_p2
                if parts[1].player_id in pid_set:
                    stats[parts[1].player_id]["diff"] += s.score_p2 - s.score_p1
    return sorted(player_ids,
                  key=lambda pid: (-stats[pid]["wins"], -stats[pid]["sets_won"], -stats[pid]["diff"]))


def _make_matches_for_pool(ordered_ids: list, tournament_id: int, group_id: int,
                            table: int, round_num: int, db) -> int:
    """
    Given an ordered list of player_ids (best→worst), create bracket matches.
    Odd players: bottom two play each other FIRST so top seeds never get a bye.
    Returns count of matches created.
    """
    created = 0
    ids = list(ordered_ids)

    if len(ids) % 2 == 1 and len(ids) >= 3:
        odd_p1, odd_p2 = ids[-2], ids[-1]
        ids = ids[:-2]
        m = Match(
            tournament_id=tournament_id, group_id=group_id,
            round=round_num, status="scheduled", stage="group",
            table_number=table, sets_to_win=2,
        )
        db.add(m); db.flush()
        db.add_all([
            MatchParticipant(match_id=m.match_id, player_id=odd_p1,
                             position=1, score=0, is_winner=False),
            MatchParticipant(match_id=m.match_id, player_id=odd_p2,
                             position=2, score=0, is_winner=False),
        ])
        created += 1

    lo, hi = 0, len(ids) - 1
    while lo < hi:
        m = Match(
            tournament_id=tournament_id, group_id=group_id,
            round=round_num, status="scheduled", stage="group",
            table_number=table, sets_to_win=2,
        )
        db.add(m); db.flush()
        db.add_all([
            MatchParticipant(match_id=m.match_id, player_id=ids[lo],
                             position=1, score=0, is_winner=False),
            MatchParticipant(match_id=m.match_id, player_id=ids[hi],
                             position=2, score=0, is_winner=False),
        ])
        created += 1
        lo += 1; hi -= 1
    return created


def _get_bye_players(tournament_id: int, group_id: int, round_num: int,
                     sub_group: str, db,
                     pid_to_sub: dict = None) -> list:
    """
    Returns player_ids who have a bye this round:
    registered in the group for this sub_group but not in any match this round.
    pid_to_sub: optional pre-built {player_id: sub_group} dict for efficiency.
    """
    round_matches = db.query(Match).filter(
        Match.tournament_id == tournament_id,
        Match.group_id == group_id,
        Match.round == round_num,
        Match.stage == "group",
    ).options(joinedload(Match.participants)).all()

    players_in_matches = {
        p.player_id
        for m in round_matches
        for p in m.participants
    }

    if pid_to_sub is None:
        tps = db.query(TournamentParticipant).filter(
            TournamentParticipant.tournament_id == tournament_id,
            TournamentParticipant.group_id == group_id,
        ).all()
        pid_to_sub = {tp.player_id: getattr(tp, "sub_group", None) for tp in tps}

    bye_players = []
    for pid, tp_sub in pid_to_sub.items():
        if pid in players_in_matches:
            continue
        if sub_group and tp_sub != sub_group:
            continue
        bye_players.append(pid)

    return bye_players


def _advance_group_round(match: object, tournament_id: int, db) -> None:
    """
    Called when a group match completes.

    Correct bye semantics:
      A bye player is a registered player who had no opponent this round.
      They automatically advance as a "winner" of that round.
      Next round is generated with: match_winners + bye_players combined.

    Group A handles boys and women as separate sub-pools.
    Groups B/C/D treat all players as one pool.
    """
    group_id  = match.group_id
    if not group_id:
        return

    group = db.query(Group).filter(Group.group_id == group_id).first()
    if not group:
        return

    table     = GROUP_TABLE_MAP.get(group.name, 1)
    round_num = match.round

    # All matches in this group+round must be done before advancing
    round_matches = (
        db.query(Match)
        .filter(Match.tournament_id == tournament_id,
                Match.group_id == group_id,
                Match.round == round_num,
                Match.stage == "group")
        .options(joinedload(Match.participants), joinedload(Match.sets))
        .all()
    )

    if not all(m.status in ("done", "completed") for m in round_matches):
        return

    # No next-round matches should already exist
    next_round = round_num + 1
    if db.query(Match).filter(
        Match.tournament_id == tournament_id,
        Match.group_id == group_id,
        Match.round == next_round,
        Match.stage == "group",
    ).first():
        return

    # All group matches so far (for performance ranking)
    all_group_matches = (
        db.query(Match)
        .filter(Match.tournament_id == tournament_id,
                Match.group_id == group_id,
                Match.stage == "group")
        .options(joinedload(Match.participants), joinedload(Match.sets))
        .all()
    )

    # Determine sub-pools for this group
    if group.name in ("Group A", "Group D"):
        sub_pools    = ["boys", "women"]
        qualifiers_per_pool = 1
    else:
        sub_pools    = [None]   # None means all players, no sub_group filter
        qualifiers_per_pool = 2

    total_created = 0

    # Build a map of player_id → sub_group for quick lookup
    all_tps = db.query(TournamentParticipant).filter(
        TournamentParticipant.tournament_id == tournament_id,
        TournamentParticipant.group_id == group_id,
    ).all()
    pid_to_sub = {tp.player_id: getattr(tp, "sub_group", None) for tp in all_tps}

    for sub in sub_pools:
        # For Group A, only consider matches/players in this sub-group
        if sub:
            sub_player_ids = {pid for pid, sg in pid_to_sub.items() if sg == sub}
            sub_matches = [
                m for m in round_matches
                if any(p.player_id in sub_player_ids for p in m.participants)
            ]
        else:
            sub_player_ids = set(pid_to_sub.keys())
            sub_matches = round_matches

        match_winners = []
        for m in sorted(sub_matches, key=lambda x: x.match_id):
            w = next((p.player_id for p in m.participants if p.is_winner), None)
            if w:
                match_winners.append(w)

        # Add bye players — they auto-advance as winners this round
        bye_players = _get_bye_players(tournament_id, group_id, round_num, sub, db, pid_to_sub)
        all_advancing = match_winners + bye_players

        if len(all_advancing) < 2:
            continue  # ≤1 advancing → KO trigger handles this

        if len(all_advancing) <= qualifiers_per_pool:
            continue  # Exact right number → KO trigger handles qualification

        # Rank by performance (byes have 0 wins but still advance;
        # if all are tied at 0, order is preserved from original seeding)
        ranked = _group_performance_rank(all_advancing, all_group_matches)
        created = _make_matches_for_pool(ranked, tournament_id, group_id, table, next_round, db)
        total_created += created

    if total_created:
        db.commit()


# ── Knockout auto-generation ──────────────────────────────────
def _top_n_performers(player_ids: list, group_matches: list, n: int) -> list:
    """
    Returns the top-n player_ids ranked by wins → sets_won → score_diff.
    If there are ≤ n players, returns all of them (auto-qualify, no match needed).
    """
    if not player_ids:
        return []
    if len(player_ids) <= n:
        return list(player_ids)   # all qualify automatically

    stats = {pid: {"wins": 0, "sets_won": 0, "diff": 0} for pid in player_ids}
    pid_set = set(player_ids)

    for m in group_matches:
        parts = sorted(m.participants, key=lambda x: x.position)
        relevant = [p for p in parts if p.player_id in pid_set]
        if len(relevant) < 2:
            continue
        for p in relevant:
            if p.is_winner:
                stats[p.player_id]["wins"] += 1
            stats[p.player_id]["sets_won"] += p.score
        if len(parts) == 2:
            for s in m.sets:
                if parts[0].player_id in pid_set:
                    stats[parts[0].player_id]["diff"] += s.score_p1 - s.score_p2
                if parts[1].player_id in pid_set:
                    stats[parts[1].player_id]["diff"] += s.score_p2 - s.score_p1

    ranked = sorted(
        player_ids,
        key=lambda pid: (-stats[pid]["wins"], -stats[pid]["sets_won"], -stats[pid]["diff"])
    )
    return ranked[:n]


def _check_and_trigger_knockout(tournament_id: int, db: Session):
    """
    Qualification rules:
      Group A  : top 1 boy  (sub_group="boys")  + top 1 woman (sub_group="women")  = 2
      Group B  : top 2 performers = 2
      Group C  : top 2 performers = 2
      Group D  : top 2 performers = 2
      Total    : 8 qualifiers → clean QF bracket, no playoff needed

    Auto-qualify: if a sub-group/group has ≤ required number, all qualify without needing a match.

    KO bracket seeding: 1v8, 2v7, 3v6, 4v5 so top seeds cannot meet until final.
    Overall ranking across all qualifiers: wins → sets_won → score_diff within their group matches.
    """
    group_matches = (
        db.query(Match)
        .filter(Match.tournament_id == tournament_id, Match.stage == "group")
        .options(joinedload(Match.participants), joinedload(Match.sets))
        .all()
    )

    # Check all existing group matches are done (zero matches = all byes = trivially done)
    if group_matches and not all(m.status in ("done", "completed") for m in group_matches):
        return
    if db.query(Match).filter(
        Match.tournament_id == tournament_id,
        Match.stage != "group",
    ).first():
        return  # KO already exists

    # Need at least some players registered to proceed
    total_participants = db.query(TournamentParticipant).filter(
        TournamentParticipant.tournament_id == tournament_id
    ).count()
    if total_participants < 2:
        return

    groups = db.query(Group).filter(Group.tournament_id == tournament_id).all()

    # Collect (player_id, group_rank) tuples
    # group_rank = position within their group qualifier slot (1 = best in group)
    qualifiers = []   # list of (player_id, wins, sets_won, diff) for final seeding

    for group in sorted(groups, key=lambda g: g.name):
        tps = db.query(TournamentParticipant).filter(
            TournamentParticipant.tournament_id == tournament_id,
            TournamentParticipant.group_id == group.group_id,
        ).all()

        if not tps:
            continue

        gms = [m for m in group_matches if m.group_id == group.group_id]

        def pid_stats(pid):
            s = {"wins": 0, "sets_won": 0, "diff": 0}
            for m in gms:
                parts = sorted(m.participants, key=lambda x: x.position)
                for p in parts:
                    if p.player_id != pid:
                        continue
                    if p.is_winner:
                        s["wins"] += 1
                    s["sets_won"] += p.score
                if len(parts) == 2:
                    for st in m.sets:
                        if parts[0].player_id == pid:
                            s["diff"] += st.score_p1 - st.score_p2
                        elif parts[1].player_id == pid:
                            s["diff"] += st.score_p2 - st.score_p1
            return s

        if group.name in ("Group A", "Group D"):
            boys_pids  = [tp.player_id for tp in tps if getattr(tp, "sub_group", None) == "boys"]
            women_pids = [tp.player_id for tp in tps if getattr(tp, "sub_group", None) == "women"]
            for pool in [boys_pids, women_pids]:
                for pid in _top_n_performers(pool, gms, 1):
                    s = pid_stats(pid)
                    qualifiers.append((pid, s["wins"], s["sets_won"], s["diff"]))
        else:
            all_pids = [tp.player_id for tp in tps]
            for pid in _top_n_performers(all_pids, gms, 2):
                s = pid_stats(pid)
                qualifiers.append((pid, s["wins"], s["sets_won"], s["diff"]))

    if len(qualifiers) < 2:
        return

    # Global seeding: sort all qualifiers best → worst
    qualifiers.sort(key=lambda x: (-x[1], -x[2], -x[3]))
    ids = [q[0] for q in qualifiers]

    # Standard bracket: 1v8, 2v7, 3v6, 4v5
    # Pair lo (best) vs hi (worst) so top seeds meet only in the final
    _create_ko_bracket(tournament_id, ids, db, round_num=1)
    db.commit()


def _create_ko_bracket(tournament_id: int, ids: list, db: Session, round_num: int):
    stage = _ko_stage_label(len(ids))
    stw   = _sets_to_win(stage)
    lo, hi, table = 0, len(ids) - 1, 1
    while lo < hi:
        m = Match(
            tournament_id=tournament_id, group_id=None, round=round_num,
            status="scheduled", stage=stage, table_number=table, sets_to_win=stw,
        )
        db.add(m); db.flush()
        db.add_all([
            MatchParticipant(match_id=m.match_id, player_id=ids[lo],
                             position=1, score=0, is_winner=False),
            MatchParticipant(match_id=m.match_id, player_id=ids[hi],
                             position=2, score=0, is_winner=False),
        ])
        lo += 1; hi -= 1
        table = 2 if table == 1 else 1  # alternate between table 1 and 2


# ── Advance knockout round ────────────────────────────────────
def _advance_knockout(tournament_id: int, db: Session):
    """
    After all matches in a KO stage are done, generate the next round.
    QF → SF (winners) | SF → Final (winners) + 3rd place (losers)
    Uses continue instead of return so both QF and SF are checked each call.
    """
    for stage in ["quarter", "semi"]:
        stage_matches = db.query(Match).filter(
            Match.tournament_id == tournament_id,
            Match.stage == stage,
        ).options(joinedload(Match.participants)).all()

        if not stage_matches:
            continue
        if not all(m.status in ("done", "completed") for m in stage_matches):
            continue  # this stage not done yet, check next

        next_stage = "semi" if stage == "quarter" else "final"

        # Already advanced — skip
        if db.query(Match).filter(
            Match.tournament_id == tournament_id,
            Match.stage == next_stage,
        ).first():
            continue

        sorted_matches = sorted(stage_matches, key=lambda x: x.match_id)
        winners, losers = [], []
        for m in sorted_matches:
            w = next((p for p in m.participants if p.is_winner), None)
            l = next((p for p in m.participants if not p.is_winner), None)
            if w: winners.append(w.player_id)
            if l: losers.append(l.player_id)

        if len(winners) < 2:
            continue

        stw = _sets_to_win(next_stage)

        if len(winners) == 2:
            # One match only (Final or SF with 2 winners)
            m = Match(
                tournament_id=tournament_id, group_id=None,
                round=1, status="scheduled",
                stage=next_stage, table_number=1, sets_to_win=stw,
            )
            db.add(m); db.flush()
            db.add_all([
                MatchParticipant(match_id=m.match_id, player_id=winners[0],
                                 position=1, score=0, is_winner=False),
                MatchParticipant(match_id=m.match_id, player_id=winners[1],
                                 position=2, score=0, is_winner=False),
            ])
        else:
            lo, hi, table = 0, len(winners) - 1, 1
            while lo < hi:
                m = Match(
                    tournament_id=tournament_id, group_id=None,
                    round=1, status="scheduled",
                    stage=next_stage, table_number=table, sets_to_win=stw,
                )
                db.add(m); db.flush()
                db.add_all([
                    MatchParticipant(match_id=m.match_id, player_id=winners[lo],
                                     position=1, score=0, is_winner=False),
                    MatchParticipant(match_id=m.match_id, player_id=winners[hi],
                                     position=2, score=0, is_winner=False),
                ])
                lo += 1; hi -= 1
                table = 2 if table == 1 else 1

        # 3rd place match — only from semi final losers
        if stage == "semi" and len(losers) >= 2:
            if not db.query(Match).filter(
                Match.tournament_id == tournament_id,
                Match.stage == "third",
            ).first():
                m3 = Match(
                    tournament_id=tournament_id, group_id=None,
                    round=1, status="scheduled",
                    stage="third", table_number=2, sets_to_win=2,
                )
                db.add(m3); db.flush()
                db.add_all([
                    MatchParticipant(match_id=m3.match_id, player_id=losers[0],
                                     position=1, score=0, is_winner=False),
                    MatchParticipant(match_id=m3.match_id, player_id=losers[1],
                                     position=2, score=0, is_winner=False),
                ])

        db.commit()



# ── GET /matches/ ─────────────────────────────────────────────
@router.get("/", response_model=List[MatchOut])
def get_matches(tournament_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(Match).options(
        joinedload(Match.participants).joinedload(MatchParticipant.player),
        joinedload(Match.sets),
    )
    if tournament_id:
        q = q.filter(Match.tournament_id == tournament_id)
    return q.order_by(Match.stage, Match.round, Match.match_id).all()


# ── POST /matches/ ────────────────────────────────────────────
@router.post("/", response_model=MatchOut)
def create_match(
    data: MatchCreate,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(None),
):
    require_admin(authorization)
    p1 = db.query(Player).filter(Player.player_id == data.player1_id).first()
    p2 = db.query(Player).filter(Player.player_id == data.player2_id).first()
    if not p1 or not p2:
        raise HTTPException(status_code=404, detail="One or both players not found")
    if data.player1_id == data.player2_id:
        raise HTTPException(status_code=400, detail="A player cannot play against themselves")

    m = Match(
        tournament_id=data.tournament_id, group_id=data.group_id,
        round=data.round, status=data.status, stage=data.stage,
        table_number=data.table_number, sets_to_win=_sets_to_win(data.stage),
    )
    db.add(m); db.flush()
    db.add_all([
        MatchParticipant(match_id=m.match_id, player_id=p1.player_id,
                         position=1, score=0, is_winner=False),
        MatchParticipant(match_id=m.match_id, player_id=p2.player_id,
                         position=2, score=0, is_winner=False),
    ])
    db.commit()
    return _load_match(m.match_id, db)


# ── PATCH /matches/{match_id} ─────────────────────────────────
@router.patch("/{match_id}", response_model=MatchOut)
def update_match(
    match_id: int,
    data: MatchUpdate,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(None),
):
    require_admin(authorization)
    m = (
        db.query(Match)
        .filter(Match.match_id == match_id)
        .options(joinedload(Match.participants), joinedload(Match.sets))
        .first()
    )
    if not m:
        raise HTTPException(status_code=404, detail="Match not found")

    if data.status is not None:
        # When a match goes live, wipe any stale scores from the old scoring system
        if data.status == "live" and m.status != "live":
            for p in m.participants:
                p.score = 0
                p.is_winner = False
            db.query(MatchSet).filter(MatchSet.match_id == match_id).delete()
            db.flush()
        m.status = data.status
    if data.table_number is not None:
        m.table_number = data.table_number
    if data.current_server is not None:
        m.current_server = data.current_server

    # ── Record a completed set ─────────────────────────────
    if data.set_update is not None:
        su = data.set_update
        existing = next((s for s in m.sets if s.set_number == su.set_number), None)
        if existing:
            existing.score_p1        = su.score_p1
            existing.score_p2        = su.score_p2
            existing.winner_position = _set_winner(su.score_p1, su.score_p2)
        else:
            ns = MatchSet(
                match_id=match_id, set_number=su.set_number,
                score_p1=su.score_p1, score_p2=su.score_p2,
                winner_position=_set_winner(su.score_p1, su.score_p2),
            )
            db.add(ns); db.flush()

        # Recalculate sets won from DB
        db.flush()
        all_sets = db.query(MatchSet).filter(MatchSet.match_id == match_id).all()
        s_p1 = sum(1 for s in all_sets if s.winner_position == 1)
        s_p2 = sum(1 for s in all_sets if s.winner_position == 2)

        parts = sorted(m.participants, key=lambda x: x.position)
        if len(parts) == 2:
            parts[0].score = s_p1
            parts[1].score = s_p2
            # Update is_winner based on sets won, but do NOT auto-finish the match.
            # The admin must explicitly press "Finish Match" which sends status:"done".
            if s_p1 >= m.sets_to_win:
                parts[0].is_winner = True
                parts[1].is_winner = False
            elif s_p2 >= m.sets_to_win:
                parts[1].is_winner = True
                parts[0].is_winner = False
            else:
                parts[0].is_winner = False
                parts[1].is_winner = False

    # ── Undo a confirmed set ───────────────────────────────
    if data.undo_set is not None:
        db.query(MatchSet).filter(
            MatchSet.match_id == match_id,
            MatchSet.set_number == data.undo_set,
        ).delete()
        db.flush()

        # Recalculate sets won after deletion
        remaining = db.query(MatchSet).filter(MatchSet.match_id == match_id).all()
        s_p1 = sum(1 for s in remaining if s.winner_position == 1)
        s_p2 = sum(1 for s in remaining if s.winner_position == 2)

        parts = sorted(m.participants, key=lambda x: x.position)
        if len(parts) == 2:
            parts[0].score = s_p1
            parts[1].score = s_p2
            parts[0].is_winner = False
            parts[1].is_winner = False
            # Only restore to done if still enough sets won
            if s_p1 >= m.sets_to_win:
                parts[0].is_winner = True
            elif s_p2 >= m.sets_to_win:
                parts[1].is_winner = True
            else:
                # Match is no longer done — revert to live
                if m.status in ("done", "completed"):
                    m.status = "live"

    db.commit()

    if m.status in ("done", "completed") and m.stage == "group":
        # Auto-round advancement disabled — admin creates fixtures manually
        # _advance_group_round(m, m.tournament_id, db)
        _check_and_trigger_knockout(m.tournament_id, db)

    if m.status in ("done", "completed") and m.stage in ("quarter", "semi"):
        _advance_knockout(m.tournament_id, db)

    return _load_match(match_id, db)


# ── DELETE /matches/{match_id} ────────────────────────────────
@router.delete("/{match_id}")
def delete_match(
    match_id: int,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(None),
):
    require_admin(authorization)
    m = db.query(Match).filter(Match.match_id == match_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Match not found")
    db.delete(m)
    db.commit()
    return {"ok": True}


# ── POST /matches/{match_id}/rematch ─────────────────────────
@router.post("/{match_id}/rematch", response_model=MatchOut)
def rematch(
    match_id: int,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(None),
):
    require_admin(authorization)
    m = (
        db.query(Match)
        .filter(Match.match_id == match_id)
        .options(joinedload(Match.participants), joinedload(Match.sets))
        .first()
    )
    if not m:
        raise HTTPException(status_code=404, detail="Match not found")
    m.status = "scheduled"
    m.current_server = None
    for p in m.participants:
        p.score = 0
        p.is_winner = False
    db.query(MatchSet).filter(MatchSet.match_id == match_id).delete()
    db.commit()
    return _load_match(match_id, db)



# ── POST /matches/trigger-ko/{tournament_id} ──────────────────
@router.post("/trigger-ko/{tournament_id}")
def trigger_knockout(
    tournament_id: int,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(None),
):
    """
    Manually trigger KO bracket generation.
    Useful when all groups have exactly 2 players (all byes) so no group
    matches exist to auto-trigger it.
    """
    require_admin(authorization)
    # First try to generate QF from group stage
    _check_and_trigger_knockout(tournament_id, db)
    # Then try to advance any completed KO rounds (QF→SF, SF→Final)
    _advance_knockout(tournament_id, db)
    _advance_knockout(tournament_id, db)  # call twice in case QF just generated above
    ko_matches = db.query(Match).filter(
        Match.tournament_id == tournament_id,
        Match.stage != "group",
    ).count()
    return {"ok": True, "ko_matches_created": ko_matches}


# ── POST /matches/bye/{tournament_id} ────────────────────────
@router.post("/bye/{tournament_id}")
def create_bye(
    tournament_id: int,
    player_id: int,
    group_id: Optional[int] = None,
    round_num: int = 1,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(None),
):
    """
    Give a player a bye for a specific round.
    A player can receive byes in multiple rounds (one per round).
    """
    require_admin(authorization)
    player = db.query(Player).filter(Player.player_id == player_id).first()
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")

    # Check no existing bye for this player in this round
    existing = (
        db.query(Match)
        .filter(
            Match.tournament_id == tournament_id,
            Match.stage == "bye",
            Match.group_id == group_id,
            Match.round == round_num,
        )
        .options(joinedload(Match.participants))
        .all()
    )
    for m in existing:
        if any(p.player_id == player_id for p in m.participants):
            raise HTTPException(status_code=400, detail="Player already has a bye this round")

    m = Match(
        tournament_id=tournament_id,
        group_id=group_id,
        round=round_num,
        status="done",
        stage="bye",
        table_number=None,
        sets_to_win=1,
    )
    db.add(m); db.flush()
    db.add(MatchParticipant(
        match_id=m.match_id,
        player_id=player_id,
        position=1, score=0, is_winner=True,
    ))
    db.commit()
    return _load_match(m.match_id, db)


# ── POST /matches/generate/{tournament_id} ────────────────────
@router.post("/generate/{tournament_id}")
def generate_fixtures(
    tournament_id: int,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(None),
):
    """
    Group-stage fixture generation rules:

    SEEDING (1-5 only):
      Seeds sort the ordered player list (seed 1 = top).
      Unseeded players fill the remaining slots randomly.
      Seeds are for ordering only — post-match ranking uses performance.

    ODD PLAYERS:
      If a group has an odd number of unmatched players, the bottom two
      (lowest priority — always unseeded or lowest seed) are paired together
      first. Every seeded player is guaranteed a real opponent, never a bye.

    TABLE ASSIGNMENT:
      All matches in a group use the same table number (A→1, B→2, C→3, D→4).

    SETS:
      All group matches are best-of-3 (sets_to_win = 2).
    """
    require_admin(authorization)

    groups = (
        db.query(Group)
        .filter(Group.tournament_id == tournament_id)
        .order_by(Group.name)
        .all()
    )
    if not groups:
        raise HTTPException(status_code=400, detail="No groups found. Add players first.")

    created = 0

    for group in groups:
        table = GROUP_TABLE_MAP.get(group.name, 1)

        all_participants = (
            db.query(TournamentParticipant)
            .filter(
                TournamentParticipant.tournament_id == tournament_id,
                TournamentParticipant.group_id == group.group_id,
            )
            .all()
        )
        if len(all_participants) < 2:
            continue

        # Group A: boys play boys, women play women — separate pools
        # Groups B, C, D: single pool (everyone plays everyone within group)
        if group.name == "Group A":
            sub_pools = {
                "boys":  [tp for tp in all_participants if getattr(tp, "sub_group", None) == "boys"],
                "women": [tp for tp in all_participants if getattr(tp, "sub_group", None) == "women"],
            }
        else:
            sub_pools = {"all": all_participants}

        for pool_key, participants in sub_pools.items():
            if len(participants) < 2:
                continue

            # Exactly 2 players → bye, both auto-qualify, no match needed
            if len(participants) == 2:
                continue

            # Skip players already matched in round 1
            existing_r1 = db.query(Match).filter(
                Match.tournament_id == tournament_id,
                Match.group_id == group.group_id,
                Match.round == 1,
                Match.stage == "group",
            ).options(joinedload(Match.participants)).all()

            already_matched = {p.player_id for m in existing_r1 for p in m.participants}
            unmatched = [tp for tp in participants if tp.player_id not in already_matched]
            if len(unmatched) < 2:
                continue

            # Round 1: use seeds 1-5 for ordering. Seeds outside 1-5 or duplicates
            # within this pool are treated as unseeded.
            for tp in unmatched:
                if tp.seed is not None and tp.seed not in range(1, 6):
                    tp.seed = None

            # Deduplicate seeds within this pool — keep only the first occurrence
            # of each seed value; extras fall to unseeded
            seen_seeds = set()
            truly_seeded, truly_unseeded = [], []
            for tp in sorted([tp for tp in unmatched if tp.seed is not None], key=lambda x: x.seed):
                if tp.seed not in seen_seeds:
                    seen_seeds.add(tp.seed)
                    truly_seeded.append(tp)
                else:
                    truly_unseeded.append(tp)
            truly_unseeded += [tp for tp in unmatched if tp.seed is None]
            random.shuffle(truly_unseeded)

            # Standard seeding bracket: seed1 vs lowest, seed2 vs second-lowest etc.
            # This ensures top seeds can only meet in the final.
            seeded_ids   = [tp.player_id for tp in truly_seeded]
            unseeded_ids = [tp.player_id for tp in truly_unseeded]

            # Interleave: fill bracket slots top-to-bottom with seeds,
            # then fill remaining slots bottom-to-top with unseeded
            n = len(seeded_ids) + len(unseeded_ids)
            slots = [None] * n
            for i, pid in enumerate(seeded_ids):
                slots[i] = pid           # top slots: seed1, seed2, seed3...
            unseeded_rev = list(reversed(unseeded_ids))
            j = 0
            for i in range(n - 1, -1, -1):
                if slots[i] is None:
                    slots[i] = unseeded_rev[j]
                    j += 1
                    if j >= len(unseeded_rev):
                        break
            ordered = [s for s in slots if s is not None]

            # Use shared helper — handles odd players correctly
            n = _make_matches_for_pool(ordered, tournament_id, group.group_id, table, 1, db)
            created += n

    db.commit()
    return {"ok": True, "matches_created": created}