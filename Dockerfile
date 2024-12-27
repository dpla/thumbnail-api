FROM node:jod-alpine

WORKDIR /opt/thumbnail-api
COPY . /opt/thumbnail-api
RUN chown -R node:node /opt/thumbnail-api
USER node
EXPOSE 3000
RUN npm run clean \
    && npm ci --ignore-scripts \
    && npm run build
CMD ["npm", "run", "start"]
