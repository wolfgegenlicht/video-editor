from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from database import init_db
from routes.upload import router as upload_router
from routes.files import router as files_router
from routes.transcribe import router as transcribe_router
from routes.export_ import router as export_router
from routes.projects import router as projects_router
from routes.eye_contact import router as eye_contact_router
from routes.enhance_audio import router as enhance_audio_router
from routes.blur_bg import router as blur_bg_router
from routes.face_restore import router as face_restore_router
from routes.portrait_relight import router as portrait_relight_router

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
app.include_router(enhance_audio_router)
app.include_router(blur_bg_router)
app.include_router(face_restore_router)
app.include_router(portrait_relight_router)
app.mount("/fonts", StaticFiles(directory=str(Path(__file__).parent / "fonts")), name="fonts")
