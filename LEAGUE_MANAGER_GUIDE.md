# League Manager Guide: Draft Round Management

## Overview
This guide outlines the step-by-step process for managing fantasy hockey draft rounds, ensuring proper point calculations, and maintaining accurate standings throughout the playoff tournament.

## Key Concepts

### Pre-Acquisition Points
When players are drafted in rounds 2+, they may already have accumulated playoff points. These "pre-acquisition" points must be tracked and excluded from the manager's total to ensure fair scoring.

### Round Completion Process
After each draft round concludes, specific actions must be taken to:
1. Calculate pre-acquisition stats for newly drafted players
2. Update current playoff stats for all players  
3. Recalculate standings with proper point adjustments

## Workflow Instructions

### Initial Draft Setup (One-time)
**When:** Before the first draft round opens

**Steps:**
1. Go to Actions tab in GitHub
2. Run workflow: "Draft Management Actions"
3. Select action: `setup-initial-draft`
4. Click "Run workflow"

**What this does:**
- Generates initial playerlist from Firebase
- Prepares the system for draft rounds

---

### After Each Draft Round Completes

**When:** Immediately after a draft round concludes and before opening the next round

**Steps:**
1. Go to Actions tab in GitHub
2. Run workflow: "Draft Management Actions"  
3. Select action: `complete-current-round`
4. Enter the round number that just completed (1, 2, 3, etc.)
5. Click "Run workflow"

**What this does:**
- Calculates pre-acquisition stats for newly drafted players
- Fetches current playoff stats for all players
- Recalculates standings with point adjustments
- Updates all data files

**Important:** Always run this workflow after each round before opening the next round!

---

### Daily Stats Updates (Automatic)

**When:** Runs automatically daily at 8:00 UTC, or can be triggered manually

**What this does:**
- Updates pre-acquisition calculations
- Fetches latest playoff stats
- Recalculates standings
- Commits updated data

**Manual trigger:** Use "Daily Stats Update" workflow if needed

---

### Emergency/Maintenance Actions

#### Force Complete Stats Update
**Use when:** Data seems out of sync or manual refresh needed
- Action: `force-stats-update`
- Does complete refresh of all stats and standings

#### Reset Pre-Acquisition Stats  
**Use when:** Pre-acquisition calculations need to be recalculated
- Action: `reset-pre-acquisition-stats`
- Regenerates all pre-acquisition point calculations

## Workflow Summary

```
Initial Setup → Round 1 → Complete Round 1 → Round 2 → Complete Round 2 → Round 3 → Complete Round 3 → etc.
     ↓              ↓            ↓              ↓            ↓              ↓            ↓
Setup Draft    Draft Opens   Run Workflow   Draft Opens   Run Workflow   Draft Opens   Run Workflow
```

## Important Notes

### ⚠️ Critical Rules
1. **Always complete round processing before opening next round**
2. **Never skip the completion workflow between rounds**
3. **Verify standings are correct after each round completion**

### 📊 Data Files Updated
- `playerlist.json` - Current drafted players
- `playerlist_drafted_with_pre_acq_stats.json` - Players with pre-acquisition data
- `updatedstats-[date].json` - Daily stats snapshots
- `standings-[date].json` - Daily standings

### 🔍 Verification Steps
After each round completion:
1. Check that new players appear in the application
2. Verify standings reflect proper point adjustments
3. Confirm pre-acquisition points are excluded from totals

### 📞 Troubleshooting
If workflows fail:
1. Check the Actions tab for error details
2. Ensure Firebase connection is working
3. Try the "force-stats-update" action
4. Contact technical support if issues persist

## Quick Reference

| Action | When to Use | Required Input |
|--------|-------------|----------------|
| `setup-initial-draft` | Before first round | None |
| `complete-current-round` | After each round ends | Round number |
| `force-stats-update` | Data sync issues | None |
| `reset-pre-acquisition-stats` | Recalculate pre-acq | None |