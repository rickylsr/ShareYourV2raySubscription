FROM node:24-alpine AS build
WORKDIR /build
COPY cloudflare/package.json cloudflare/package-lock.json ./cloudflare/
RUN npm ci --prefix cloudflare --ignore-scripts
COPY app/templates ./app/templates
COPY app/translations ./app/translations
COPY shared ./shared
COPY cloudflare/build.mjs ./cloudflare/build.mjs
RUN node cloudflare/build.mjs

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /home/app
COPY shared ./shared
COPY docker ./docker
COPY --from=build /build/docker/generated ./docker/generated
RUN mkdir -p /home/app/data
EXPOSE 8000
CMD ["node", "docker/server.js"]
