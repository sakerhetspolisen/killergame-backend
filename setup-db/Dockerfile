# syntax=docker/dockerfile:1

FROM node:alpine
WORKDIR /setup-db-app
COPY package.json package-lock.json ./
RUN npm install
COPY . .
CMD ["npm", "run", "start"]