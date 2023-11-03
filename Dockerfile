# syntax=docker/dockerfile:1

FROM node:18-alpine
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn
COPY . .
ENV NODE_ENV production
CMD ["yarn", "start"]