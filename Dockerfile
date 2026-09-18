FROM node:22-slim AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 HOST=0.0.0.0 PORT=8000 DATA_DIR=/app/data/runtime
WORKDIR /app
COPY requirements.lock ./
RUN pip install --no-cache-dir -r requirements.lock && useradd --uid 10001 --create-home dashboard
COPY backend/app ./backend/app
COPY backend/__init__.py ./backend/__init__.py
COPY start.py ./
COPY data/source ./data/source
COPY --from=frontend /build/dist ./frontend/dist
RUN mkdir -p /app/data/runtime && chown -R dashboard:dashboard /app/data/runtime
USER dashboard
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health')"
CMD ["python", "start.py"]
