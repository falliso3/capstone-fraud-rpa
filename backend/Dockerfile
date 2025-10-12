# Use a slim Python 3.12 image as the base
FROM python:3.12-slim

# Set the working directory inside the container to /app
WORKDIR /app

# Copy only requirements first to leverage Docker layer caching
COPY requirements.txt .

# Install Python dependencies without caching wheels (keeps image small)
RUN pip install --no-cache-dir -r requirements.txt

# Now copy the actual application code (placed after deps for caching)
COPY app ./app

# Make Python output unbuffered so logs appear instantly in "docker logs"
ENV PYTHONUNBUFFERED=1

# Default command: run the FastAPI app with Uvicorn
CMD ["uvicorn","app.main:app","--host","0.0.0.0","--port","8000"]
