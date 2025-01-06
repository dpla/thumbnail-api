# Our first stage, that is the Builder
FROM node:22-slim AS thumbnail-api-builder
WORKDIR /opt/thumbnail-api
COPY src /opt/thumbnail-api/src
COPY package.json /opt/thumbnail-api
COPY package-lock.json /opt/thumbnail-api
COPY tsconfig.json /opt/thumbnail-api
COPY eslint.config.mjs /opt/thumbnail-api
RUN npm install --ignore-scripts && npm run clean && npm run build

FROM node:22-slim AS thumbnail-api-prod
RUN apt update \
  && apt --no-install-recommends install -y curl \
  && apt clean
WORKDIR /opt/thumbnail-api
COPY package.json .
COPY package-lock.json .
COPY --from=thumbnail-api-builder /opt/thumbnail-api/dist /opt/thumbnail-api/dist
RUN chown -R node:node /opt/thumbnail-api
USER node
EXPOSE 3000
HEALTHCHECK CMD ["curl", "-f", "http://localhost:3000/health"]
RUN npm install --omit=dev --omit=optional --ignore-scripts
CMD ["npm", "run", "start", "-s"]
