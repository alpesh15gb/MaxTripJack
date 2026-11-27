FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci
FROM dependencies AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm run build:workers
FROM dependencies AS production-dependencies
RUN npm prune --omit=dev
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
RUN addgroup -S -g 10001 travel && adduser -S -u 10001 travel -G travel
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --chown=travel:travel --from=build /app/.next/standalone ./
COPY --chown=travel:travel --from=build /app/.next/static ./.next/static
COPY --chown=travel:travel --from=build /app/public ./public
COPY --chown=travel:travel --from=build /app/dist ./dist
COPY --chown=travel:travel --from=build /app/scripts/standalone-server.mjs ./scripts/standalone-server.mjs
COPY --chown=travel:travel --from=build /app/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --chown=travel:travel --from=build /app/scripts/booking-migrations.mjs ./scripts/booking-migrations.mjs
COPY --chown=travel:travel --from=build /app/scripts/migrate-company-settings.mjs ./scripts/migrate-company-settings.mjs
COPY --chown=travel:travel --from=build /app/scripts/migrate-search-catalogues.mjs ./scripts/migrate-search-catalogues.mjs
COPY --chown=travel:travel --from=build /app/scripts/migrate-checkout-identity.mjs ./scripts/migrate-checkout-identity.mjs
COPY --chown=travel:travel --from=build /app/scripts/provision-runtime-role.mjs ./scripts/provision-runtime-role.mjs
COPY --chown=travel:travel --from=build /app/scripts/release-check.mjs ./scripts/release-check.mjs
COPY --chown=travel:travel --from=build /app/scripts/diagnose-checkout.mjs ./scripts/diagnose-checkout.mjs
COPY --chown=travel:travel --from=build /app/scripts/check-max-ai.mjs ./scripts/check-max-ai.mjs
COPY --chown=travel:travel --from=build /app/scripts/check-safar-enquiries.mjs ./scripts/check-safar-enquiries.mjs
COPY --chown=travel:travel --from=build /app/scripts/configure-safar-enquiries.mjs ./scripts/configure-safar-enquiries.mjs
COPY --chown=travel:travel --from=build /app/db ./db
USER travel
EXPOSE 3000
CMD ["node","server.js"]
