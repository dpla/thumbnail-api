FROM node:22-slim
RUN apt update \
  && apt --no-install-recommends install -y curl \
  && apt clean
WORKDIR /opt/thumbnail-api
COPY src /opt/thumbnail-api/src
COPY package.json /opt/thumbnail-api
COPY package-lock.json /opt/thumbnail-api
COPY tsconfig.json /opt/thumbnail-api
COPY eslint.config.mjs /opt/thumbnail-api
RUN chown -R node:node /opt/thumbnail-api
USER node
EXPOSE 3000
HEALTHCHECK CMD ["curl", "-f", "http://localhost:3000/health"]
RUN npm run clean \
    && npm ci --ignore-scripts \
    && npm run build
CMD ["npm", "run", "start", "--s"]
