# Blank for Christmas

The public version of Marco's Funhouse holiday movie party game: **blankforchristmas.com**.

- `public/` is the game: one web page (`index.html`), the PDF maker it uses for the printable kit, and the link-preview picture.
- `src/worker.js` is the small server: live game rooms so friends can join from their phones, and a relay that sends AI requests to Claude without exposing your API key.
- `wrangler.toml` holds Cloudflare's settings, including the AI on/off switch and limits.

Nobody needs an account to play. Rooms delete themselves about a day and a half after the last move. Nothing about players is stored after that.

---

## One-time setup

### 1. Put these files on GitHub
1. Open **github.com/Marcosfunhouse/blank-for-christmas**.
2. Click **uploading an existing file**.
3. Unzip the package on your computer, open the `blank-for-christmas` folder, select **everything inside it** (`public`, `src`, `README.md`, `wrangler.toml`, `package.json`) and drag it onto the GitHub page. Drag the contents, not the folder itself.
4. Click **Commit changes**.

> The hidden `.gitignore` file may not drag on a Mac. That's fine; it only matters if someone later works on the code on a computer.

### 2. Connect Cloudflare to GitHub
1. In Cloudflare: **Workers & Pages → Create application → Import a repository**.
2. Connect GitHub when asked and pick **blank-for-christmas**.
3. Leave the build settings as Cloudflare suggests (the deploy command is `npx wrangler deploy`). Click **Deploy**.
4. In a minute you get a test address ending in `.workers.dev`. The game works there already, minus the AI.

### 3. Add your Claude API key
1. Open the new **blank-for-christmas** project → **Settings → Variables and Secrets → Add**.
2. Type: **Secret**. Name: `ANTHROPIC_API_KEY`. Value: your key from console.anthropic.com.
3. Save. The AI buttons appear on the next page load.

Never put the key in GitHub or in any file. It lives only in this Cloudflare secret.

### 4. Point blankforchristmas.com at Cloudflare (domain is at GoDaddy)
1. In Cloudflare: **Add a domain** → `blankforchristmas.com` → **Free** plan → continue.
2. Copy the two nameservers Cloudflare shows (like `xxx.ns.cloudflare.com`).
3. In GoDaddy: **My Products → blankforchristmas.com → DNS → Nameservers → Change → I'll use my own nameservers**. Paste both and save. If DNSSEC is on in GoDaddy, turn it off first.
4. Wait for Cloudflare's "your domain is active" email (usually under an hour).

### 5. Attach the domain to the game
1. Project → **Settings → Domains & Routes → Add → Custom domain** → `blankforchristmas.com`.
2. Do it again for `www.blankforchristmas.com`.

### 6. Redirect from Marco's site (optional)
In Squarespace: **Settings → Developer tools → URL Mappings**, add:
```
/blankforchristmas -> https://blankforchristmas.com 301
```

### 7. Test before you share the link
- Open the site on a laptop → **Make it your own!** → choose **Everyone on their own phone** → **Open the lobby**.
- On two or three phones: open the site → **Join a game on my phone** → enter the code.
- Play a round, try one **Suggest** button, and download the kit with **Print & Play**.

---

## Updating the game

Any change saved to GitHub goes live automatically in about a minute.

- **The usual case:** Claude gives you a new `index.html`. In GitHub, open the `public` folder → **Add file → Upload files** → drop in the new `index.html` → **Commit changes**.
- **Undo a bad update:** Cloudflare project → **Deployments** → pick the previous one → **Rollback**.
- **Avoid updating during a party.** Games in progress keep going, but a big change could hiccup a room mid-game.

## Switches and limits (in `wrangler.toml`)

| Setting | What it does | Default |
|---|---|---|
| `AI_ENABLED` | `"false"` hides every AI button. The game still works. | `"true"` |
| `AI_ROOM_LIMIT` | AI requests allowed per game | `60` |
| `AI_IP_DAILY_LIMIT` | AI requests per internet connection per day | `120` |
| `MODEL_QUICK` / `MODEL_DEFAULT` | Which Claude model writes suggestions / whole games and posters | Claude Haiku 5.5 |
| `ROOM_TTL_HOURS` | How long an idle room lives before deleting itself | `36` |

Edit these in GitHub (open `wrangler.toml` → pencil icon → change → **Commit changes**). Settings changed only in the Cloudflare dashboard get reset by the next update, so change them here.

Keep a **monthly spending limit** set in console.anthropic.com as the final backstop.

## Costs
- **Cloudflare:** free plan to start (100,000 requests a day). If the game really takes off, the paid plan is $5 a month.
- **Claude AI:** pay per use. A suggestion costs a fraction of a cent; a fully AI-written game is about a fifth of a cent.
- **Domain:** yearly renewal at GoDaddy. After 60 days you can transfer it to Cloudflare, which charges cost price.

## If something's off
- **The AI buttons don't show:** check the `ANTHROPIC_API_KEY` secret and that `AI_ENABLED` is `"true"`, then reload the page.
- **"That's the AI limit for this game":** the per-game limit was reached. Raise `AI_ROOM_LIMIT` if you want.
- **Phones can't find a game:** codes are 4 letters, and the host must have picked *Everyone on their own phone* before opening the lobby.
- **Logs:** Cloudflare project → **Observability** shows recent requests and errors.

## For developers
`npm install`, then put `ANTHROPIC_API_KEY=...` in a `.dev.vars` file and run `npm run dev` to try it locally at http://localhost:8787. The same `public/index.html` also runs inside Claude as an artifact. It uses Claude's built-in rooms and AI there, and this server everywhere else.
