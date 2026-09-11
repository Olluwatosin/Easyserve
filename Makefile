# EasyServe — local development.
#
# Two traps cost most of a working day, and both are structural rather than
# careless, so they are fixed here rather than remembered:
#
#   A test run pointed at the live demo database and left eleven test venues in
#   it. `make test` now uses a throwaway database, and the suite refuses to run
#   against anything that is not plainly disposable (see tests/conftest.py).
#
#   `next dev` and `next start` were running at once against the same .next
#   directory, so dev rewrote the build underneath the production server and its
#   chunks began returning 503 — a blank page with no error anywhere. Every
#   target here calls `stop` first, and `dev` and `preview` cannot coexist.
#
#   Stale servers also survived `pkill -f "next start"`, because Next renames
#   itself to `next-server`. Everything below kills by *port*, which is the only
#   thing that reliably identifies what is in the way.
#
# Quick start:
#   make db      one-time (or after `make reset`): throwaway Postgres + demo data
#   make dev     the full stack, hot reload
#   make test    the whole backend suite
#   make stop    put everything down

SHELL := /bin/bash
ROOT := $(shell pwd)
VENV := $(ROOT)/.venv/bin
PGDIR := $(ROOT)/.localdb
PGPORT := 55432
PGSOCK := /tmp
# Two databases on purpose. They used to be one, and `make test` then wiped the
# demo data out from under `make dev` — tests create their own venues and leave
# them behind, and seed.py deletes every row in every table. Keeping the suite
# in its own database means running tests never costs you a working demo.
DB_NAME := easyserve_local
TEST_DB := easyserve_test
DB_URL := postgresql+asyncpg://postgres@127.0.0.1:$(PGPORT)/$(DB_NAME)
TEST_DB_URL := postgresql+asyncpg://postgres@127.0.0.1:$(PGPORT)/$(TEST_DB)
API_PORT := 8000
WEB_PORT := 3000

# Enough to satisfy Settings; deliberately not a real secret.
SECRETS := SECRET_KEY="local-development-secret-key-at-least-32-chars" \
           ENVIRONMENT=development
ENV := DATABASE_URL="$(DB_URL)" $(SECRETS)
TEST_ENV := DATABASE_URL="$(TEST_DB_URL)" $(SECRETS)

.PHONY: help db migrate seed reset api web dev preview test stop status

help:
	@echo ""
	@echo "  make db        start the throwaway databases and load demo data"
	@echo "  make dev       backend + frontend, hot reload      (http://localhost:$(WEB_PORT))"
	@echo "  make preview   backend + a production build of the frontend"
	@echo "  make test      the backend suite, against the throwaway database"
	@echo "  make seed      reload demo data (wipes the local demo database)"
	@echo "  make stop      stop everything this Makefile starts"
	@echo "  make status    what is currently running"
	@echo "  make reset     delete both throwaway databases entirely"
	@echo ""

# ── Database ─────────────────────────────────────────────────────────────────
# Lives in .localdb (gitignored) and listens only on this machine. The socket
# goes in /tmp because a unix socket path over 103 bytes is rejected, and a
# path inside the repo is comfortably over.

$(PGDIR):
	@echo "→ creating a throwaway database in .localdb"
	@initdb -D "$(PGDIR)" -U postgres --auth=trust >/dev/null

db: $(PGDIR)
	@pg_ctl -D "$(PGDIR)" status >/dev/null 2>&1 || { \
		echo "→ starting Postgres on $(PGPORT)"; \
		pg_ctl -D "$(PGDIR)" -o "-p $(PGPORT) -k $(PGSOCK) -h 127.0.0.1" \
			-l "$(PGDIR)/server.log" start >/dev/null; \
		sleep 2; \
	}
	@createdb -h 127.0.0.1 -p $(PGPORT) -U postgres $(TEST_DB) 2>/dev/null || true
	@createdb -h 127.0.0.1 -p $(PGPORT) -U postgres $(DB_NAME) 2>/dev/null \
		&& $(MAKE) --no-print-directory migrate seed \
		|| echo "→ databases ready"

# Run alembic's script through the venv's python rather than as `alembic` or
# `python -m alembic`. The console shim carries an absolute shebang that breaks
# the moment the project directory moves, and the module form picks up
# backend/alembic/ — the migrations directory — instead of the package.
# Executing the script puts .venv/bin on sys.path instead of the cwd, which
# avoids both.
migrate:
	@echo "→ applying migrations"
	@cd backend && $(ENV) $(VENV)/python $(VENV)/alembic upgrade head >/dev/null

seed: migrate
	@echo "→ loading demo data"
	@cd backend && $(ENV) $(VENV)/python seed.py

# ── Processes ────────────────────────────────────────────────────────────────

stop:
	@for port in $(WEB_PORT) $(API_PORT) 3100; do \
		pids=$$(lsof -ti tcp:$$port 2>/dev/null); \
		if [ -n "$$pids" ]; then echo "→ freeing port $$port"; kill -9 $$pids 2>/dev/null; fi; \
	done
	@pg_ctl -D "$(PGDIR)" stop >/dev/null 2>&1 && echo "→ database stopped" || true

status:
	@for port in $(WEB_PORT) $(API_PORT); do \
		pid=$$(lsof -ti tcp:$$port 2>/dev/null | head -1); \
		if [ -n "$$pid" ]; then echo "  port $$port: pid $$pid"; else echo "  port $$port: free"; fi; \
	done
	@pg_ctl -D "$(PGDIR)" status >/dev/null 2>&1 && echo "  database: running" || echo "  database: stopped"

api:
	@cd backend && $(ENV) $(VENV)/python -m uvicorn app.main:app \
		--host 127.0.0.1 --port $(API_PORT) --reload

web:
	@cd frontend && npm run dev

# `dev` and `preview` both start by stopping everything, which is what keeps
# them from ever running at the same time against one .next directory.
dev: stop db
	@echo "→ starting API on $(API_PORT) and web on $(WEB_PORT) (ctrl-c stops both)"
	@trap 'kill 0' EXIT INT TERM; \
	( cd backend && $(ENV) $(VENV)/python -m uvicorn app.main:app \
		--host 127.0.0.1 --port $(API_PORT) --reload ) & \
	( cd frontend && npm run dev ) & \
	wait

preview: stop db
	@echo "→ building the frontend"
	@# Deliberately not `rm -rf .next` first. The stale-chunk problem this guards
	@# against came from dev and prod sharing one .next at the same time, which
	@# `stop` already prevents — while wiping .next throws away Next's cached
	@# font files, so every preview then needs a working connection to
	@# fonts.gstatic.com. On venue wifi that is the difference between a build
	@# and a five-minute hang. `make reset` is there for a genuine clean slate.
	@cd frontend && npm run build >/dev/null
	@echo "→ starting API on $(API_PORT) and web on $(WEB_PORT) (ctrl-c stops both)"
	@trap 'kill 0' EXIT INT TERM; \
	( cd backend && $(ENV) $(VENV)/python -m uvicorn app.main:app \
		--host 127.0.0.1 --port $(API_PORT) ) & \
	( cd frontend && npm run start ) & \
	wait

# ── Tests ────────────────────────────────────────────────────────────────────
# Always the throwaway database. conftest.py refuses anything else, so this
# cannot quietly become a run against production.

test: db
	@cd backend && $(TEST_ENV) $(VENV)/python -m pytest -q

reset:
	@$(MAKE) --no-print-directory stop
	@rm -rf "$(PGDIR)"
	@echo "→ throwaway database deleted; 'make db' will build a fresh one"
