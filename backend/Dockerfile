# Use a slim Python 3.12 image as the base
FROM python:3.12-slim

# For unbuffered logs + make /app importable
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=/app

# Workdir inside the image
WORKDIR /app

# 1) Install deps first (better caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 2) Copy app package + alembic config + entrypoint
# (main.py lives inside app/, so this copies it too)
COPY app ./app
COPY alembic.ini .
COPY alembic ./alembic
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# 3) Default command
CMD ["/entrypoint.sh"]
