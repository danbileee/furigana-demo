import * as Sentry from "@sentry/nestjs";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

// Must be called before any other imports that could be instrumented
Sentry.init({
  dsn: process.env["SENTRY_DSN"] ?? "",
  integrations: [nodeProfilingIntegration()],
  tracesSampleRate: process.env["NODE_ENV"] === "production" ? 0.2 : 1.0,
  profilesSampleRate: 1.0,
  enabled: process.env["NODE_ENV"] === "production",
  // Setting this option to true will send default PII data to Sentry.
  // For example, automatic IP address collection on events
  sendDefaultPii: true,
});
