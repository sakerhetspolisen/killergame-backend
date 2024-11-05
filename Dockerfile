# syntax=docker/dockerfile:1

FROM node:alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY . .
ENV NODE_ENV production
CMD ["npm", "run", "start"]