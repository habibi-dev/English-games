#!/usr/bin/env bash
# Update the running site after the repo is already checked out at this commit.
# Uses Docker when this user can reach a daemon. Otherwise serves nginx.conf
# with the system nginx binary, as the current user, on port 8080.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
if [ -S "${XDG_RUNTIME_DIR}/bus" ]; then
  export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=${XDG_RUNTIME_DIR}/bus}"
fi

docker_ok() {
  docker info >/dev/null 2>&1
}

deploy_docker() {
  docker compose up -d --build --remove-orphans
  docker image prune -f
}

if docker_ok; then
  deploy_docker
  exit 0
fi

if [ -x "${HOME}/bin/docker" ] && [ -S "${XDG_RUNTIME_DIR}/docker.sock" ]; then
  export PATH="${HOME}/bin:${PATH}"
  export DOCKER_HOST="unix://${XDG_RUNTIME_DIR}/docker.sock"
  if docker_ok; then
    deploy_docker
    exit 0
  fi
fi

NGINX_HOME="${HOME}/.nginx"
mkdir -p "${NGINX_HOME}/body" "${NGINX_HOME}/proxy" "${NGINX_HOME}/fastcgi" \
  "${NGINX_HOME}/uwsgi" "${NGINX_HOME}/scgi" "${NGINX_HOME}/logs"

cat > "${NGINX_HOME}/mime.types" << 'EOF'
types {
  text/html html htm;
  text/css css;
  application/javascript js mjs;
  application/json json;
  image/png png;
  image/svg+xml svg;
  text/plain txt;
  image/x-icon ico;
}
EOF

sed \
  -e "s#/usr/share/nginx/html#${ROOT}#g" \
  -e "s#include /etc/nginx/mime.types;#include ${NGINX_HOME}/mime.types;#" \
  "${ROOT}/nginx.conf" > "${NGINX_HOME}/server.conf"

cat > "${NGINX_HOME}/nginx.conf" << EOF
worker_processes 1;
pid ${NGINX_HOME}/nginx.pid;
error_log ${NGINX_HOME}/logs/error.log;
events { worker_connections 256; }
http {
  include ${NGINX_HOME}/mime.types;
  default_type application/octet-stream;
  client_body_temp_path ${NGINX_HOME}/body;
  proxy_temp_path ${NGINX_HOME}/proxy;
  fastcgi_temp_path ${NGINX_HOME}/fastcgi;
  uwsgi_temp_path ${NGINX_HOME}/uwsgi;
  scgi_temp_path ${NGINX_HOME}/scgi;
  access_log ${NGINX_HOME}/logs/access.log;
  sendfile on;
  include ${NGINX_HOME}/server.conf;
}
EOF

mkdir -p "${HOME}/.config/systemd/user"
cat > "${HOME}/.config/systemd/user/english-games.service" << EOF
[Unit]
Description=English Grammar Quest
After=network.target

[Service]
Type=simple
ExecStart=/usr/sbin/nginx -c ${NGINX_HOME}/nginx.conf -p ${NGINX_HOME} -g "daemon off;"
Restart=on-failure
RestartSec=2

[Install]
WantedBy=default.target
EOF

# A manually started nginx keeps port 8080 and blocks the service.
if [ -f "${NGINX_HOME}/nginx.pid" ]; then
  kill "$(cat "${NGINX_HOME}/nginx.pid")" 2>/dev/null || true
  rm -f "${NGINX_HOME}/nginx.pid"
fi

nginx -t -c "${NGINX_HOME}/nginx.conf" -p "${NGINX_HOME}"
systemctl --user daemon-reload
systemctl --user enable --now english-games.service
systemctl --user restart english-games.service