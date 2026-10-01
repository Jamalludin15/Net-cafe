#!/bin/bash
set -e

psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=app_password="$POSTGRES_APP_PASSWORD" <<'SQL'
CREATE ROLE netcafe_app LOGIN PASSWORD :'app_password';
ALTER DATABASE netcafe OWNER TO netcafe_app;
SQL