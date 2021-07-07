# Dependency container
# - loads all dependencies to build the project
# - prevent the reinstallation of node modules at every changes in the source code
FROM node:16-alpine AS deps

WORKDIR /app

#RUN apk add --no-cache g++ git make python2 tzdata pkgconfig 
#RUN npm install -g cross-env node-gyp

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# Build container
# - requires the ARGs to be given in the build command or in the compose.yaml
FROM node:16-alpine as builder
WORKDIR /app

COPY . .
COPY --from=deps /app/node_modules ./node_modules
RUN yarn clean \
  && yarn build \
  && cd build \
  && yarn install --production --ignore-scripts --prefer-offline


# Deployment container
# - uses the build files to create a slim production container
FROM node:16-alpine as deploy
WORKDIR /app

RUN apk add --no-cache tzdata 

COPY --from=builder /app/build/ .

ENV NODE_ENV=production
ENV TZ=Europe/Berlin
ENV PORT=3001

EXPOSE 3001

CMD ["node", "--experimental-specifier-resolution=node", "src/index.js"]