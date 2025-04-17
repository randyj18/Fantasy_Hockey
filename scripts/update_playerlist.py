#!/usr/bin/env python3
import os, json, requests, firebase_admin
from firebase_admin import credentials, db

# ——— CONFIG ———
SERVICE_ACCOUNT = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON_PATH", "sa.json")
DATABASE_URL    = "https://your-db.firebaseio.com"  # ← your RTDB URL
LEAGUE_ID       = "YOUR_LEAGUE_ID"
OUTPUT_PATH     = "data/playerlist.json"

# ——— FIREBASE INIT ———
cred = credentials.Certificate(SERVICE_ACCOUNT)
firebase_admin.initialize_app(cred, { "databaseURL": DATABASE_URL })

# ——— FETCHER ———
def fetch_playoff_stats(pid, pos):
    """Get ONLY the playoffs subSeason stats snapshot."""
    url = f"https://api-web.nhle.com/v1/player/{pid}/landing"
    r = requests.get(url); r.raise_for_status()
    po = (r.json().get("featuredStats", {})
           .get("playoffs", {})
           .get("subSeason", {}) or {})

    if pos == "G":
        return {
            "Points Before Acquiring": 0,
            "PreAcq Wins":    po.get("wins", 0),
            "PreAcq Shutouts":po.get("shutouts", 0)
        }
    else:
        return {
            "Points Before Acquiring": po.get("points", 0),
            "PreAcq Wins":    0,
            "PreAcq Shutouts":0
        }

# ——— MAIN ———
def main():
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)

    dp_ref = db.reference(f"leagues/{LEAGUE_ID}/draftedPlayers")
    drafted = dp_ref.get() or {}

    output = []

    for key, rec in drafted.items():
        pid        = rec.get("playerId")
        pos        = rec.get("Position")
        pr_drafted = rec.get("playoffRoundDrafted") or 0
        pre_round  = rec.get("preAcqRound", 0)

        # Base entry shape
        entry = {
            "Player": rec.get("Player"),
            "Player ID": pid,
            "NHL Team": rec.get("NHL Team"),
            "Team": rec.get("Team"),
            "playoffRoundDrafted": pr_drafted,
            "Points for Gordie Howe Hattricks": rec.get("Points for Gordie Howe Hattricks", 0),
            "Points for Conn Smythe":           rec.get("Points for Conn Smythe", 0),
        }

        # Only fetch once, the first time we see pr_drafted > pre_round
        if pr_drafted > 0 and pre_round < pr_drafted:
            stats = fetch_playoff_stats(pid, pos)
            entry.update(stats)

            # Persist back so we never fetch again for this player in this round
            dp_ref.child(key).update({
                "Points Before Acquiring": stats["Points Before Acquiring"],
                "PreAcq Wins":    stats["PreAcq Wins"],
                "PreAcq Shutouts":stats["PreAcq Shutouts"],
                "preAcqRound":    pr_drafted
            })
            print(f"Fetched pre‑acq for {entry['Player']} (round {pr_drafted})")

        else:
            # Carry forward whatever’s already stored
            entry["Points Before Acquiring"] = rec.get("Points Before Acquiring", 0)
            entry["PreAcq Wins"]             = rec.get("PreAcq Wins", 0)
            entry["PreAcq Shutouts"]         = rec.get("PreAcq Shutouts", 0)
            entry["preAcqRound"]             = pre_round

        output.append(entry)

    # Write out the JSON for your other scripts
    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f, indent=2)

    print(f"Wrote {len(output)} entries to {OUTPUT_PATH}")

if __name__ == "__main__":
    main()
