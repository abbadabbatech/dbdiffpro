# Build stage
FROM node:20-slim AS build
WORKDIR /app

# Install client dependencies
COPY client/package*.json ./client/
RUN cd client && npm install --legacy-peer-deps

# Copy client source and build
COPY client/ ./client/
RUN cd client && npm run build

# Production stage
FROM node:20-slim
WORKDIR /app

# Install server dependencies
COPY server/package*.json ./server/
RUN cd server && npm install --production

# Copy server source
COPY server/ ./server/

# Copy built client from build stage
COPY --from=build /app/client/dist ./client/dist

EXPOSE 8080
ENV PORT 8080

CMD ["node", "server/index.js"]
