from fastapi import FastAPI

app = FastAPI(title="clubAI backend")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
