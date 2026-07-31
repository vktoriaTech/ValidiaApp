# Validia — Project Guidelines for Claude

This file contains the working conventions and directives that Claude must follow in every session on this project.

---

## Git Workflow

- **Never commit directly to `main`.** All code changes must go through a feature branch and a Pull Request.
- Branch naming conventions:
  - `feat/<short-description>` — new features
  - `fix/<short-description>` — bug fixes or UI corrections
  - `chore/<short-description>` — maintenance, refactors, dependency updates, docs
- **PR titles and descriptions must be written in English**, concise and descriptive.
- PR description should include: what changed, why it changed, and any migration or deployment notes.

Example branch + PR flow:
```bash
git checkout -b feat/sectors-crud-page
# ... make changes, commit ...
git push -u origin feat/sectors-crud-page
# Open PR on GitHub: feat/sectors-crud-page → main
```

---

## Code Language

- All code, comments, variable names, commit messages, PR titles, and PR descriptions must be in **English**.
- UI-facing text (labels, buttons, error messages, placeholder text) is in **Spanish**, since the product serves Colombian users.

---

## Development Methodology (SDD)

- Spec first, then implementation. Specs live in `docs/specs/` and must be committed to `main` before Claude Code begins implementation.
- Claude Code runs autonomously with `--dangerously-skip-permissions`. Bryan reviews and approves before any commit or PR merge.
- Each feature is implemented end-to-end (backend model → migration → schema → API → frontend service → UI) before moving to the next.

---

## Stack

- **Backend**: FastAPI + SQLAlchemy 2.0 (`mapped_column` pattern) + PostgreSQL 16 + Alembic
- **Frontend**: React + Vite + TailwindCSS
- **Infrastructure**: Docker Compose (local), AWS EC2 t3.micro (staging)
- **Migrations**: Alembic chained revisions — always `alembic upgrade head` after adding a migration

---

## UX & Data Standards

- All DB records must display `created_at` and `updated_at` in list/detail views.
- All list views default to descending order by `created_at`.
- Confirmation modals are required before any destructive action.
- Terms & Conditions are required to *activate* an activity, not to *create* one.
- Wizard step 0 always selects the client (tenant) before creating an activity.

---

## Brand

- Primary color: magenta `#FF0080` (CSS var: `v-magenta`)
- Dark: `#0D0D0D` (CSS var: `v-night`)
- Typography: Poppins (body) + Montserrat (accent/logo)
