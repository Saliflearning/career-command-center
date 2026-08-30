# ---------------------------------------------------------------------------
# Stage 1 – Build the TypeScript source into plain JavaScript
# ---------------------------------------------------------------------------
FROM node:20-slim AS builder

WORKDIR /build

# Install dependencies first (layer-cached when package.json unchanged)
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY index.ts tsconfig.json* ./

# Compile TypeScript → JavaScript
RUN npx tsc --outDir dist --module commonjs --target es2020 \
        --esModuleInterop true --skipLibCheck true --strict true \
        index.ts

# ---------------------------------------------------------------------------
# Stage 2 – Runtime image based on TeX Live (full, includes XeLaTeX)
# ---------------------------------------------------------------------------
FROM texlive/texlive:latest

# ---- Install Node.js 20 ----
# We add NodeSource's signed repository for a reproducible Node version.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# ---- Ensure required LaTeX packages are present ----
# texlive:latest ships "full" but we explicitly refresh the package database
# and install the specific CTAN packages we need so the image is reproducible
# even if the base tag is updated.
RUN tlmgr update --self --all --reinstall-forcibly-removed || true && \
    tlmgr install \
        tex-gyre \
        microtype \
        titlesec \
        enumitem \
        hyperref \
        fancyhdr \
        babel-english \
        palatino \
        fontaxes \
    || true

# ---- Application ----
WORKDIR /app

# Copy only production dependencies
COPY --from=builder /build/package.json ./
RUN npm install --omit=dev --ignore-scripts

# Copy compiled JavaScript
COPY --from=builder /build/dist ./dist

# ---- Security & isolation hardening ----
# Create an unprivileged user; xelatex does not need root.
RUN groupadd --system --gid 1001 latex && \
    useradd --system --uid 1001 --gid latex --home-dir /home/latex --create-home latex && \
    mkdir -p /tmp/latex-jobs && \
    chown latex:latex /tmp/latex-jobs

USER latex

# Port exposed by the Express server
EXPOSE 4000

# Health check used by ECS / Cloud Run / Kubernetes
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:4000/health || exit 1

# ---------------------------------------------------------------------------
# Network access during rendering is enforced at the orchestrator level
# (ECS task definition / Cloud Run service with --no-allow-unauthenticated
# and VPC egress controls).  The worker itself never makes outbound calls.
# ---------------------------------------------------------------------------
CMD ["node", "dist/index.js"]
