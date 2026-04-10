from sqlmodel import SQLModel, create_engine, Session
from config import DATA_DIR

DATABASE_URL = f"sqlite+aiosqlite:///{DATA_DIR / 'app.db'}"
SYNC_DATABASE_URL = f"sqlite:///{DATA_DIR / 'app.db'}"

engine = create_engine(SYNC_DATABASE_URL, echo=False)


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
