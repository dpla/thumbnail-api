FROM node:erbium-alpine
WORKDIR /opt/thumbq
COPY . /opt/thumbq
EXPOSE 3000
RUN npm run build
CMD ["npm", "run", "start"]
