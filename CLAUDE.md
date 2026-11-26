# Blank for Christmas — notes for Claude

- `public/index.html` is the whole game. The same file also runs as a Claude artifact
  (slug d7307997-1fd1-4dba-8d01-9fca6f145765). Inside Claude it uses `window.claude` (db, sample,
  downloads); on the public site `initWeb()` swaps in this repo's server (WebDb rooms over
  `/api/room/CODE`, AI via `/api/ai`, browser downloads). Keep both paths working.
- `src/worker.js`: Cloudflare Worker + `Room` Durable Object (one per game code; also used as AI
  rate-limit counters). Settings live in `wrangler.toml` [vars]; the API key is the
  `ANTHROPIC_API_KEY` secret in Cloudflare, never in the repo.
- AI is OFF by Danny's choice: `AI_FEATURES=false` in index.html (never hands the game a sample caller, in Claude
  or on the web) and `AI_ENABLED="false"` in wrangler.toml. Don't add AI-powered features back unless he asks.
- Hall of Fame: `HallOfFame` Durable Object (SQLite, one instance). /api/hof (public, approved only), /api/hof/submit,
  /api/hof/admin (x-admin-password header vs ADMIN_PASSWORD secret). Client views `hof` (/hall-of-fame) and `admin` (/admin), web only.
  Suggestions: POST /api/notes -> `notes` table in the same DO; read on /admin under the Notes tab.
- Pushing to `main` deploys automatically via Cloudflare Workers Builds. Don't push big changes
  during party hours (evenings/weekends in December).
- Danny owns this project; Marco's Funhouse is the brand. No emojis in the UI.
