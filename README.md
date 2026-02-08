# Guess the Imposter (UI)

A lightweight frontend for the "Guess the Imposter" multiplayer game.

This UI is a polling-based client that interacts with the Game API served by the backend at `/api`.

## Quick Links

- Play : https://game.ayush.ltd

## How it works (overview)

- Players create a game session via `POST /api/game/create`.
- Other players join with `POST /api/game/{session_id}/join`.
- The creator starts the game (`POST /api/game/{session_id}/start`).
- The frontend polls `GET /api/game/{session_id}?player_id={player_id}` to get phase/state updates.
- Phases: `waiting` → `playing` (discussion) → `voting` → `reveal` → `result`.

## Rules of the Game

- Players: 2–16 players per session. One player is the Imposter; others are regular players.
- Objective:
	- Regular players: Identify the Imposter by discussion and voting.
	- Imposter: Blend in during discussion and avoid being voted out.
- Roles & Topics:
	- Each non-imposter receives the same topic word.
	- The Imposter receives a different (variant) topic word.
- Phases:
	- Waiting: Players join the lobby until the creator starts the game.
	- Discussion: Players discuss the topic naturally (no direct revealing of the exact word).
	- Voting: Players vote for who they think is the Imposter.
	- Reveal: Once all votes are in (or voting ends), the creator/any player can reveal the result.
	- Result: The voted-out player is shown and winners are declared.
- Voting rules:
	- Only alive players may vote.
	- Each player gets one vote per round.
	- Votes are tallied; the player with the most votes is voted out.
	- Ties: If there's a tie among top vote-getters, the tie-break behavior is determined by the server (commonly a no-elimination or random pick). Check server logs/behavior for your deployment.
- Winning:
	- If the voted-out player is the Imposter, all other players win.
	- If the Imposter is not voted out, the Imposter wins.
- New round / Play again:
	- The game creator can start a new round using the 'Play Again' action.
	- A new imposter is randomly chosen; players remain the same and are reset to alive.

