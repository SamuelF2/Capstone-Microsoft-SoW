from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Cocoon API",
    description="Microsoft SoW Automation - Review API",
    version="0.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"status": "ok", "message": "Cocoon API running"}

@app.get("/health")
def health():
    return {"status": "healthy"}

# TODO: Add SOW endpoints
# TODO: Add graph query endpoints
# TODO: Add AI recommendation endpoints
