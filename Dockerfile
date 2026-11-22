# Production Cloud Container for StrideTrack Backend
# Multi-stage lightweight Python 3.11 image with OpenCV & MediaPipe dependencies
FROM python:3.11-slim

# Prevent Python from writing .pyc files and enable unbuffered logging
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=9002

# Install system dependencies required by OpenCV, MediaPipe, and GL
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency definition
COPY server/requirements.txt ./requirements.txt

# Install Python packages
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy server application code and assets
COPY server/ ./server/
COPY assets/ ./assets/

# Download MediaPipe pose model at build time so runtime startup is instant
RUN python -m server.download_model

# Ensure data directory exists for SQLite persistent volume mount
RUN mkdir -p /data /app/server/data

# Default persistent database paths can be pointed to /data on Railway/Render
ENV CALORIE_DB_PATH=/data/calories.sqlite3
ENV COUNTRY_QUEST_DB_PATH=/data/country-quests.sqlite3
ENV COMMUNITY_GOALS_DB_PATH=/data/community-goals.sqlite3

EXPOSE 9002

# Run production Uvicorn server bound to 0.0.0.0
CMD uvicorn server.app:app --host 0.0.0.0 --port ${PORT:-9002} --ws-max-size 2900000
