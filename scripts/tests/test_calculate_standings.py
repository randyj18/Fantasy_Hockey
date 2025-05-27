import unittest
import json
import os
from unittest.mock import patch, mock_open

# Adjust sys.path to allow direct import of the script under test
import sys
SCRIPTS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, SCRIPTS_DIR)

# Assuming calculate_standings is the main logic function in calculate_standings.py
from calculate_standings import calculate_standings

class TestCalculateStandings(unittest.TestCase):

    def _run_calculate_standings_with_mock_data(self, mock_player_data_list):
        """Helper function to run calculate_standings with mocked file content."""
        m_open = mock_open(read_data=json.dumps(mock_player_data_list))
        with patch('builtins.open', m_open):
            # The path "dummy_path.json" is just a placeholder as open is mocked
            standings = calculate_standings("dummy_path.json")
        return standings

    def test_empty_player_list(self):
        """Test that an empty player list results in empty standings."""
        standings = self._run_calculate_standings_with_mock_data([])
        self.assertEqual(len(standings), 0, "Standings should be empty for an empty player list.")

    def test_basic_scoring_skaters(self):
        """Test basic scoring for skaters (Goals + Assists)."""
        mock_data = [
            {"playerId": "1", "FantasyTeam": "Team A", "currentPlayoffStats": {"Goals": 2, "Assists": 3, "Wins": 0, "Shutouts": 0}}, # 5 points
            {"playerId": "2", "FantasyTeam": "Team A", "currentPlayoffStats": {"Goals": 1, "Assists": 0, "Wins": 0, "Shutouts": 0}}  # 1 point
        ]
        standings = self._run_calculate_standings_with_mock_data(mock_data)
        self.assertEqual(len(standings), 1)
        self.assertEqual(standings[0][0], "Team A")
        self.assertEqual(standings[0][1]["Total Points"], 6)
        self.assertEqual(standings[0][1]["Skaters"]["Points"], 6)
        self.assertEqual(standings[0][1]["Goalies"]["Points"], 0)

    def test_basic_scoring_goalies(self):
        """Test basic scoring for goalies (Wins*2 + Shutouts*1)."""
        mock_data = [
            {"playerId": "3", "FantasyTeam": "Team B", "Position": "G", "currentPlayoffStats": {"Goals": 0, "Assists": 0, "Wins": 1, "Shutouts": 1}}, # 2*1 + 1 = 3 points
            {"playerId": "4", "FantasyTeam": "Team B", "Position": "G", "currentPlayoffStats": {"Goals": 0, "Assists": 0, "Wins": 2, "Shutouts": 0}}  # 2*2 + 0 = 4 points
        ]
        standings = self._run_calculate_standings_with_mock_data(mock_data)
        self.assertEqual(len(standings), 1)
        self.assertEqual(standings[0][0], "Team B")
        self.assertEqual(standings[0][1]["Total Points"], 7)
        self.assertEqual(standings[0][1]["Goalies"]["Points"], 7)
        self.assertEqual(standings[0][1]["Skaters"]["Points"], 0)

    def test_mixed_roster(self):
        """Test a team with both skaters and goalies."""
        mock_data = [
            {"playerId": "1", "FantasyTeam": "Team C", "Position": "LW", "currentPlayoffStats": {"Goals": 3, "Assists": 1}}, # 4 points
            {"playerId": "5", "FantasyTeam": "Team C", "Position": "G", "currentPlayoffStats": {"Wins": 1, "Shutouts": 0}}     # 2 points
        ]
        standings = self._run_calculate_standings_with_mock_data(mock_data)
        self.assertEqual(len(standings), 1)
        self.assertEqual(standings[0][0], "Team C")
        self.assertEqual(standings[0][1]["Total Points"], 6)
        self.assertEqual(standings[0][1]["Skaters"]["Points"], 4)
        self.assertEqual(standings[0][1]["Goalies"]["Points"], 2)
        self.assertEqual(standings[0][1]["Skaters"]["Count"], 1)
        self.assertEqual(standings[0][1]["Goalies"]["Count"], 1)

    def test_points_before_acquiring(self):
        """Test subtraction of points earned before player acquisition."""
        mock_data = [
            {"playerId": "6", "FantasyTeam": "Team D", "Position": "C", 
             "currentPlayoffStats": {"Goals": 5, "Assists": 5}, # Current Total: 10 points
             "pointsBeforeAcquiring": 3, "playoffRoundDrafted": 2, "preAcqRound": 2} # Effective: 10 - 3 = 7 points
        ]
        standings = self._run_calculate_standings_with_mock_data(mock_data)
        self.assertEqual(standings[0][1]["Total Points"], 7)

    def test_points_before_acquiring_not_subtracted_if_round_1(self):
        """Points before acquiring should not be subtracted if drafted in round 1."""
        mock_data = [
            {"playerId": "7", "FantasyTeam": "Team E", "Position": "RW", 
             "currentPlayoffStats": {"Goals": 4, "Assists": 2}, # 6 points
             "pointsBeforeAcquiring": 2, "playoffRoundDrafted": 1, "preAcqRound": 1} # Should still be 6 points
        ]
        standings = self._run_calculate_standings_with_mock_data(mock_data)
        self.assertEqual(standings[0][1]["Total Points"], 6)

    def test_points_before_acquiring_stale_preacqround(self):
        """Points before acquiring should not be subtracted if preAcqRound is less than playoffRoundDrafted."""
        mock_data = [
            {"playerId": "8", "FantasyTeam": "Team F", "Position": "D",
             "currentPlayoffStats": {"Goals": 2, "Assists": 2}, # 4 points
             "pointsBeforeAcquiring": 1, "playoffRoundDrafted": 3, "preAcqRound": 2} # Should still be 4 points as preAcq is old
        ]
        standings = self._run_calculate_standings_with_mock_data(mock_data)
        self.assertEqual(standings[0][1]["Total Points"], 4)


    def test_standings_order(self):
        """Ensure teams are sorted correctly by total points (descending)."""
        mock_data = [
            {"playerId": "9", "FantasyTeam": "Team Alpha", "Position": "C", "currentPlayoffStats": {"Goals": 1}}, # 1 point
            {"playerId": "10", "FantasyTeam": "Team Bravo", "Position": "G", "currentPlayoffStats": {"Wins": 3}}, # 6 points
            {"playerId": "11", "FantasyTeam": "Team Charlie", "Position": "LW", "currentPlayoffStats": {"Assists": 3}} # 3 points
        ]
        standings = self._run_calculate_standings_with_mock_data(mock_data)
        self.assertEqual(len(standings), 3)
        self.assertEqual(standings[0][0], "Team Bravo") # 6 points
        self.assertEqual(standings[1][0], "Team Charlie") # 3 points
        self.assertEqual(standings[2][0], "Team Alpha") # 1 point

    def test_multiple_teams(self):
        """Test with players from multiple fantasy teams."""
        mock_data = [
            {"playerId": "1", "FantasyTeam": "Team X", "Position": "C", "currentPlayoffStats": {"Goals": 2}},
            {"playerId": "2", "FantasyTeam": "Team Y", "Position": "G", "currentPlayoffStats": {"Wins": 1}},
            {"playerId": "3", "FantasyTeam": "Team X", "Position": "D", "currentPlayoffStats": {"Assists": 1}},
        ]
        standings = self._run_calculate_standings_with_mock_data(mock_data)
        self.assertEqual(len(standings), 2)
        team_x_standings = next(s for s in standings if s[0] == "Team X")
        team_y_standings = next(s for s in standings if s[0] == "Team Y")
        self.assertEqual(team_x_standings[1]["Total Points"], 3) # 2 + 1
        self.assertEqual(team_y_standings[1]["Total Points"], 2) # 1 * 2

    def test_missing_player_data_id(self):
        """Test graceful skipping of players with missing 'playerId'."""
        mock_data = [
            {"FantasyTeam": "Team A", "currentPlayoffStats": {"Goals": 1}}, # Missing playerId
            {"playerId": "1", "FantasyTeam": "Team A", "currentPlayoffStats": {"Goals": 2}}
        ]
        standings = self._run_calculate_standings_with_mock_data(mock_data)
        self.assertEqual(len(standings), 1)
        self.assertEqual(standings[0][1]["Total Points"], 2)

    def test_missing_player_data_team(self):
        """Test graceful skipping of players with missing 'FantasyTeam'."""
        mock_data = [
            {"playerId": "1", "currentPlayoffStats": {"Goals": 1}}, # Missing FantasyTeam
            {"playerId": "2", "FantasyTeam": "Team B", "currentPlayoffStats": {"Goals": 3}}
        ]
        standings = self._run_calculate_standings_with_mock_data(mock_data)
        self.assertEqual(len(standings), 1)
        self.assertEqual(standings[0][0], "Team B")
        self.assertEqual(standings[0][1]["Total Points"], 3)
    
    def test_missing_current_playoff_stats_node(self):
        """Test players missing the 'currentPlayoffStats' node entirely."""
        mock_data = [
            {"playerId": "1", "FantasyTeam": "Team A"}, # Missing currentPlayoffStats
            {"playerId": "2", "FantasyTeam": "Team A", "Position": "C", "currentPlayoffStats": {"Goals": 1, "Assists": 1}} # 2 points
        ]
        standings = self._run_calculate_standings_with_mock_data(mock_data)
        self.assertEqual(len(standings), 1)
        self.assertEqual(standings[0][0], "Team A")
        self.assertEqual(standings[0][1]["Total Points"], 2)

    def test_player_with_no_stats_in_currentplayoffstats(self):
        """Test players with an empty 'currentPlayoffStats' object."""
        mock_data = [
            {"playerId": "1", "FantasyTeam": "Team A", "Position": "C", "currentPlayoffStats": {}}, # Empty stats object
            {"playerId": "2", "FantasyTeam": "Team A", "Position": "D", "currentPlayoffStats": {"Goals": 1, "Assists": 0}} # 1 point
        ]
        standings = self._run_calculate_standings_with_mock_data(mock_data)
        self.assertEqual(len(standings), 1)
        self.assertEqual(standings[0][0], "Team A")
        self.assertEqual(standings[0][1]["Total Points"], 1)


    def test_zero_stats(self):
        """Test players with all zero stats."""
        mock_data = [
            {"playerId": "12", "FantasyTeam": "Team Z", "Position": "C", "currentPlayoffStats": {"Goals": 0, "Assists": 0}},
            {"playerId": "13", "FantasyTeam": "Team Z", "Position": "G", "currentPlayoffStats": {"Wins": 0, "Shutouts": 0}}
        ]
        standings = self._run_calculate_standings_with_mock_data(mock_data)
        self.assertEqual(len(standings), 1)
        self.assertEqual(standings[0][0], "Team Z")
        self.assertEqual(standings[0][1]["Total Points"], 0)
        self.assertEqual(standings[0][1]["Skaters"]["Count"], 1)
        self.assertEqual(standings[0][1]["Goalies"]["Count"], 1)

if __name__ == '__main__':
    unittest.main()
