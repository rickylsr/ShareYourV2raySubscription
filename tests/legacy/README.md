# Legacy compatibility fixture

The former Flask backend is retained here only as an upgrade/rollback reference
for existing JSON volumes and Werkzeug password records. Production Docker and
Cloudflare requests both run `shared/application.js`.

The fixture uses the current shared template/translation sources. Its route and
file-format behavior is exercised by `tests/test_app.py`; real image/volume upgrade
checks additionally verify the packaged Node backend.
