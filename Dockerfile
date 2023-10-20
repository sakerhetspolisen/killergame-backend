# syntax=docker/dockerfile:1

FROM node:latest
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn
COPY . .
CMD ["yarn", "dev"]
EXPOSE 9001