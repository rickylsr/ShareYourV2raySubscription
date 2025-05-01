FROM python:3.13-slim

COPY /app /home/app
WORKDIR /home/app

RUN pip install --no-cache-dir -r requirements.txt

CMD ["gunicorn", "-w", "1", "-b", "0.0.0.0", "wsgi:app"]