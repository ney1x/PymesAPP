from fastapi import APIRouter
from pydantic import BaseModel

from app.services.predictor import predictor

router = APIRouter()


class PredictRequest(BaseModel):
    itemId: str
    storeId: str
    horizonteDias: int = 7


@router.post("/predict")
def predict(req: PredictRequest):
    return predictor.predict(req.itemId, req.storeId, req.horizonteDias)
