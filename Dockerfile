FROM python:3.13-slim

COPY /app /home/app
WORKDIR /home/app

RUN RUN apt-get update && apt-get install -y build-essential gcc && 、
    pip install --no-cache-dir -r requirements.txt && \
    mkdir data

CMD ["gunicorn", "-w", "1", "-b", "0.0.0.0", "wsgi:app"]