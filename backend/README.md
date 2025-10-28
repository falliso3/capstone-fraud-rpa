### Dev quickstart (Git Bash on Windows)
```bash
cd ~/Capstone/capstone-fraud-rpa/backend
source .venv/Scripts/activate
export DATABASE_URL="postgresql+psycopg://fraud:fraudpw@localhost:5432/fraud"
docker compose up -d db
python -m alembic upgrade head
