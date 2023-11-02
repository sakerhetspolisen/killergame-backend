# syntax=docker/dockerfile:1

FROM node:18-alpine
WORKDIR /setup-db-app
COPY package.json yarn.lock ./
RUN yarn
COPY . .
CMD ["yarn", "start"]