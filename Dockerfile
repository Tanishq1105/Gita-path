FROM node:24-alpine AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 GITA_HOST=0.0.0.0 PORT=5000
COPY backend/requirements-lock.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./backend/
COPY run.py project_tools.py ./
COPY --from=frontend /build/dist ./frontend/dist/
# Accounts and announcements live in this folder: mount a persistent disk or volume here.
RUN mkdir -p /data && chown 10001:10001 /data
ENV GITA_DB_PATH=/data/gita.db
VOLUME /data
USER 10001:10001
EXPOSE 5000
CMD ["python", "run.py"]
