FROM python:3.13-slim

COPY /app /home/app
COPY requirements.txt /home/app/requirements.txt
WORKDIR /home/app
