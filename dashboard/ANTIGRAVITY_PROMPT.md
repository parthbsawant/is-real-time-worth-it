# Prompt to paste into Antigravity

You are building the React front end of a seminar dashboard. The Python API already exists and is
tested; your job is only the UI in `dashboard/web`.

1. Read `dashboard/SPEC.md` completely first. It defines the stack, look, pages, controls and the
   API calls each view must use. Follow it exactly. Where it is silent, choose the simplest sensible option.
2. Read `dashboard/api/main.py` to see the exact response shapes. Start the API
   (`uvicorn dashboard.api.main:app --port 8000` from the repo root with the Python venv active) and
   open http://localhost:8000/docs to try the endpoints. Use the real responses, not guesses.

Setup (from the repo root):
```
cd dashboard/web
npm create vite@latest . -- --template react      # accept defaults, JavaScript
npm install
npm install recharts
```
Configure the Vite dev server to proxy `/api` to `http://localhost:8000`.
Run with `npm run dev` (port 5173).

Rules
- Only create or edit files inside `dashboard/web`. Do NOT touch `src/`, `dashboard/api/`, `tests/`,
  `results/`, `data/`, `models/` or any config in the repo root.
- Do NOT run any git command (no add, commit, push, branch, reset). I commit myself.
- Do not hard-code any result numbers, accuracy values or conclusions: everything comes from the API.
  The conclusion text must be generated from the data and must never claim a win when the 95% range
  crosses zero.
- Do not add a backend, a database, login, or extra pages beyond the four in the spec.
- Keep dependencies to React, Vite and Recharts.

Work in this order and stop after each so it can be checked: (1) setup + top bar + model toggle +
Overview page; (2) Simulation page; (3) Live Replay page; (4) Who Benefits page.
At the end, run `npm run build` to confirm there are no errors, and list exactly which files you created.
If something in the spec conflicts with the API, tell me instead of silently changing the API.
