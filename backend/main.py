from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import init_db
from routes.upload import router as upload_router
from routes.files import router as files_router
from routes.transcribe import router as transcribe_router
from routes.export_ import router as export_router
from routes.projects import router as projects_router
from routes.eye_contact import router as eye_contact_router

init_db()

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload_router)
app.include_router(files_router)
app.include_router(transcribe_router)
app.include_router(export_router)
app.include_router(projects_router)
app.include_router(eye_contact_router)
