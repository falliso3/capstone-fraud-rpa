from app.db.session import SessionLocal

# FastAPI dependency that yields a database session per request.
async def get_session():
    # Creates a session for this request and guarantees close/cleanup after.
    async with SessionLocal() as session:
        # yield hands control back to FastAPI; code after yield would run on teardown.
        yield session
