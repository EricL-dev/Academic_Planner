# Academic Planner

A calendar, homework/test/deadline tracker, day-grouped to-do list, and habit
tracker, built as a single React app. Data is saved to your browser's
`localStorage`, so it persists between visits on the same device/browser.

## Run it locally

```bash
npm install
npm run dev
```

Then open the URL it prints (usually `http://localhost:5173`).

## Deploy it for free

The easiest path is **Vercel** or **Netlify** — both auto-detect Vite and
build it for you.

1. Push this folder to a new GitHub repository.
2. Go to vercel.com (or netlify.com) and sign in with GitHub.
3. Click "New Project" / "Add new site" and pick the repo.
4. Leave the build settings as detected (build command `npm run build`,
   output directory `dist`) and deploy.
5. You'll get a live URL like `academic-planner.vercel.app` — free, with
   HTTPS, and it redeploys automatically whenever you push changes.

You can also add a custom domain later from the same dashboard if you want
something other than the free subdomain.

## Notes

- Data lives only in your browser's local storage — it won't sync across
  devices, and clearing your browser data will clear the planner too.
- Nothing in this app calls out to the internet; the "Import from Canvas"
  tab only parses text you paste in yourself.
