# Production Cloud Container for StrideTrack Backend (rep counter, community features and Footprint AI)
# Multi-stage lightweight Python 3.11 image with OpenCV & MediaPipe dependencies
FROM python:3.11-slim

# Prevent Python from writing .pyc files and enable unbuffered logging
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=9002

# Install system dependencies required by OpenCV, MediaPipe, and GL
# (mediapipe 0.10.30+ loads libGLESv2 / libEGL at startup, even when running on CPU)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    libgl1 \
    libgles2 \
    libegl1 \
    libglib2.0-0 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency definition
COPY server/requirements.txt ./requirements.txt

# Install Python packages
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Text reader for nutrition labels, receipts, recipe photos and pack text (RapidOCR, Apache-2.0; its PP-OCR
# models ship in the wheel). Installed without its opencv-python-headless pin so it shares the OpenCV
# build mediapipe already installed (two OpenCV packages in one image overwrite each other's cv2).
RUN pip install --no-cache-dir --no-deps rapidocr==3.10.0 && \
    pip install --no-cache-dir "pyclipper>=1.2" "shapely>=1.7.1,!=2.0.4" "six>=1.15" "omegaconf>=2.3" colorlog tqdm requests pyyaml

# Copy server application code and assets
COPY server/ ./server/
COPY assets/ ./assets/
# Trained Footprint AI (food photo, meal text, body fat, photo BMI, muscle photos) with its models and USDA data.
# Served by the same process at POST /rep-api/ai, so the cloud needs only this one service.
COPY footprint_ai/ ./footprint_ai/

# Download MediaPipe pose model at build time so runtime startup is instant
RUN python -m server.download_model
# Unpack the branded product database (products.sqlite.gz) and load the text reader once at build time
RUN python -c "from footprint_ai import products, ocr; assert products.available(); ocr.engine()"

# Ensure data directory exists for SQLite persistent volume mount
RUN mkdir -p /data /app/server/data

# Default persistent database paths can be pointed to /data on Railway/Render
ENV CALORIE_DB_PATH=/data/calories.sqlite3
ENV COUNTRY_QUEST_DB_PATH=/data/country-quests.sqlite3
ENV COMMUNITY_GOALS_DB_PATH=/data/community-goals.sqlite3

EXPOSE 9002

# Run production Uvicorn server bound to 0.0.0.0
CMD uvicorn server.app:app --host 0.0.0.0 --port ${PORT:-9002} --ws-max-size 2900000
