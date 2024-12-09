FROM node:lts-alpine

WORKDIR /registry

COPY . .

RUN npm install --omit=dev && \
    rm -rf $(npm get cache)

ENTRYPOINT [ "npm", "start" ]