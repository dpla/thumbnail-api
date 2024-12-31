import { nodeProfilingIntegration } from "@sentry/profiling-node";
import * as process from "node:process";
import { init } from "@sentry/node";

// Ensure to call this before importing any other modules!

init({
  debug: process.env.SENTRY_DEBUG === "true",
  dsn: process.env.SENTRY_DSN,
  integrations: [
    // Add our Profiling integration
    nodeProfilingIntegration(),
  ],

  // Add Tracing by setting tracesSampleRate
  // We recommend adjusting this value in production
  tracesSampleRate: 1.0,

  // Set sampling rate for profiling
  // This is relative to tracesSampleRate
  profilesSampleRate: 1.0,
});
