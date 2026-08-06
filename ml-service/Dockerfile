FROM python:3.12-slim

WORKDIR /app

# lightgbm necesita libgomp en tiempo de ejecución
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.docker.txt ./
COPY vendor/ia-inventario ./vendor/ia-inventario
RUN pip install --no-cache-dir -r requirements.docker.txt

COPY . .

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
