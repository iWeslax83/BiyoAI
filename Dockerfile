FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next ./.next
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
# Needed by `npm run seed:teacher` (tsx scripts/seed-teacher.ts), which is run
# inside this container per OPERATIONS.md.
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/lib ./lib
COPY --from=build /app/tsconfig.json ./tsconfig.json
EXPOSE 3000
CMD ["npm", "start"]
