Merge branch 'frontend' into main

* frontend:
  server(static): respect CLIENT_DIR env override and log a short sample of client files at startup
  server(static): robust clientDir detection — search common build locations and log if not found
  server(db): read DATABASE_URL from env first; fallback to legacy /local/config.json if absent
