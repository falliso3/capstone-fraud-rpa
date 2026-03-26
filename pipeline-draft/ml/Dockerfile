FROM python:3.11-slim
WORKDIR /app

# system deps (usually not needed for your libs, but harmless)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
  && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
EXPOSE 8000

# Your run command is already like this; keep it.
CMD ["uvicorn", "score_service:app", "--host", "0.0.0.0", "--port", "8000"]
