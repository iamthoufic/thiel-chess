# Dataset card: `PeterThiel` move-policy corpus

## Summary

This corpus represents the public game history of the Chess.com username
`PeterThiel`. It supports experiments in predicting that account's move from a
legal chess position. It does not establish the account holder's real-world
identity, and a trained model should be described as a behavioral chess model,
not as the person or an exact clone.

## Source and authorization

Games come from the official Chess.com Published-Data API. The project
maintainer obtained prior authorization from Chess.com for this training use;
the authorization itself is not stored here. The game records are **not**
redistributed in this repository: `pipeline/` rebuilds them. Anyone running
the pipeline needs their own authorization under Chess.com's User Agreement.
Repository visitors receive no rights to Chess.com content.

## Intended use

- offline next-move prediction research
- fine-tuning a human-style chess policy
- evaluation of style similarity on held-out historical games
- play against a clearly labeled simulation in a private or approved setting

Do not use the model for assistance during human games or connect it to a
normal player account. Follow the target platform's fair-play and bot rules.

## Construction

1. Merge the existing archive with new official PubAPI archive records.
2. Deduplicate by canonical Chess.com game URL.
3. Sort games by their PGN UTC timestamp.
4. Parse and replay every move with `chess.js`; invalid games cause the build
   to fail instead of being silently discarded.
5. Remove clock comments and nonessential headers from the clean PGN.
6. Split chronologically at the game level (90%/5%/5%).
7. Emit both sequence-level and position-level compressed JSONL.

Exact counts and checksums are recorded in the adjacent manifests after each
build.

## Limitations

- A username is not proof of the public figure's identity.
- Most source games use a short time control, so the learned policy will mainly
  imitate fast-play decisions rather than general chess skill.
- Historical ratings, opponents, openings, and platform matchmaking create
  sampling bias.
- A position-only policy cannot reproduce clock pressure, mood, mouse behavior,
  or unobserved intent. The corpus therefore cannot support a claim of an
  "exact" clone.
- Chronological distribution shift is expected: recent play may differ from
  older play.

## Recommended evaluation

Report top-1 and top-k move accuracy, legal-move-normalized cross entropy, and
opening-vs-middlegame-vs-endgame performance on the held-out test games. Compare
against rating-matched human-policy and generic engine baselines. Do not select
hyperparameters using the test split.
