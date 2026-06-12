FROM python:3.12.9-slim-bookworm

WORKDIR /app

COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ backend/
COPY data-pipeline/ data-pipeline/

WORKDIR /app/backend

EXPOSE 5000

CMD ["python", "app.py"]
