# syntax=docker/dockerfile:1

# ---- test: runs the unit tests (not part of the final image) ----
# docker build --target test -t english-grammar-quest:test .
FROM node:24-alpine AS test
WORKDIR /app
COPY package.json ./
COPY js ./js
COPY tests ./tests
COPY english_grammar_question_bank_1000.json beginner_question_bank.json banks.json ./
RUN npm test

# ---- runtime: static files served by nginx (no build step needed) ----
FROM nginxinc/nginx-unprivileged:stable-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY index.html manifest.webmanifest sw.js banks.json /usr/share/nginx/html/
COPY english_grammar_question_bank_1000.json beginner_question_bank.json /usr/share/nginx/html/
COPY css /usr/share/nginx/html/css
COPY js /usr/share/nginx/html/js
COPY icons /usr/share/nginx/html/icons

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
