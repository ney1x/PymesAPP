import os

from fastapi import FastAPI
from dotenv import load_dotenv

from app.api.predict import router as predict_router

load_dotenv()

app = FastAPI(
    title="Servicio de Predicción de Demanda",
    description="API de machine learning para predecir demanda y rentabilidad de productos.",
    version="1.0.0",
)

app.include_router(predict_router, tags=["prediccion"])


@app.get("/health")
def health():
    return {"servicio": "ml-demanda", "estado": "ok"}
