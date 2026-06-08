FROM python:3.12-slim

RUN apt-get update && apt-get install -y libpq-dev gcc curl && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

COPY uv.lock pyproject.toml /workspace/
COPY backend/pyproject.toml /workspace/backend/

WORKDIR /workspace

RUN uv sync --frozen --no-dev

COPY backend/ /workspace/backend/

WORKDIR /workspace/backend

ENV PATH="/workspace/.venv/bin:$PATH"

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
