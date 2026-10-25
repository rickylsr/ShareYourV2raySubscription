FROM python:3.13-slim
WORKDIR /home/app
COPY tests/legacy/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY tests/legacy/wsgi.py tests/legacy/i18n.py ./
COPY app/templates ./templates
COPY app/translations ./translations
RUN mkdir -p data
CMD ["gunicorn", "-w", "1", "-b", "0.0.0.0", "wsgi:app"]
