FROM node:jod-alpine
WORKDIR /opt/thumbnail-api
COPY . /opt/thumbnail-api
EXPOSE 3000
RUN npm run clean
RUN npm ci
RUN npm install tsc -g
RUN npm run build
CMD ["npm", "run", "start"]
