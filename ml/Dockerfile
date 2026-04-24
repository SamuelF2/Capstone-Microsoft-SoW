FROM python:3.12-slim

WORKDIR /app

# Runtime libs: build-essential for any wheels that need compilation,
# libgomp1 for OpenMP symbols used by torch / numpy (pulled in by
# sentence-transformers).
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Install dependencies first for layer caching
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

# Copy application source
COPY . .

EXPOSE 8001

CMD ["uv", "run", "uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8001"]
