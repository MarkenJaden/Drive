FROM node:20-alpine

RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY . ./

ENV PORT=4000
ENV DATA_DIR=/app/data

EXPOSE 4000

CMD ["node", "index.js"]
