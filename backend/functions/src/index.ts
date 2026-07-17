import { onRequest } from "firebase-functions/v2/https";
import { createApp } from "./app";
import { kioskSecret } from "./config";

/**
 * The WorkTrack REST API v1, served as a single HTTPS function behind
 * `https://api.worktrack.app` (Hosting rewrite or Cloud Load Balancer).
 * Scaling, TLS, and DDoS absorption are delegated to Google Front End.
 */
export const api = onRequest(
  {
    region: "us-central1",
    secrets: [kioskSecret],
    minInstances: 0,
    maxInstances: 100,
    concurrency: 80,
    memory: "512MiB",
    timeoutSeconds: 60,
  },
  createApp(),
);
