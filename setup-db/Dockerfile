# syntax=docker/dockerfile:1

FROM node:21-alpine
WORKDIR /setup-db-app
COPY package.json package-lock.json ./
RUN npm install
COPY . .
CMD ["npm", "run", "start"]