FROM python:3.11-slim

WORKDIR /app

# install system deps
RUN apt-get update && apt-get install -y build-essential gcc libpq-dev --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# copy requirements and install
COPY requirements-dev.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# copy application
COPY . /app

ENV PYTHONUNBUFFERED=1

EXPOSE 8000

CMD ["uvicorn", "cincy_csl.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
