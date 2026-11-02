import { nodeProfilingIntegration } from "@sentry/profiling-node";
import * as process from "node:process";
import { init } from "@sentry/node";

// Ensure to call this before importing any other modules!

init({
  debug: process.env.SENTRY_DEBUG === "true",
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT ?? "development",

  // Keep client IPs and cookies out of Sentry.
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: {
      request: {
        deny: ["forwarded", "client-ip", "real-ip", "viewer-address"],
      },
      response: true,
    },
  },
  integrations: [
    // Add our Profiling integration
    nodeProfilingIntegration(),
  ],

  // Sample only request-rooted traces.
  tracesSampler: ({ attributes }) =>
    attributes["sentry.op"] === "http.server" ? 1.0 : 0,

  // Profiles while a sampled span is active; sampled once per process.
  profileSessionSampleRate: 1.0,
  profileLifecycle: "trace",
});
