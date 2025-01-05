import "./instrumentation"; //IMPORTANT: keep this first

import express from "express";
import { default as cluster, Worker } from "node:cluster";
import { availableParallelism } from "node:os";
import { getLogger } from "./logger";
import { ExpressSetup } from "./ExpressSetup";
import { ThumbnailApi } from "./ThumbnailApi";
import { S3Client } from "@aws-sdk/client-s3";
import { SQSClient } from "@aws-sdk/client-sqs";
import { DplaApi } from "./DplaApi";
import { ThumbnailStorage } from "./ThumbnailStorage";
import { ResponseHelper } from "./ResponseHelper";
import { ThumbnailCacheQueue } from "./ThumbnailCacheQueue";
import { Logger } from "winston";

export class Main {
  logger: Logger;

  constructor() {
    this.logger = getLogger();
  }

  start() {
    if (this.isPrimary() && this.mustFork()) {
      this.doFork(this.psCount());
    } else {
      const app = express();
      app.disable("x-powered-by");
      const expressSetup = new ExpressSetup(app, this.logger);
      this.doWorker(expressSetup);
    }
  }

  doWorker(expressSetup: ExpressSetup) {
    expressSetup.sentry();
    expressSetup.morgan();
    expressSetup.routes(this.buildThumbnailApi());
    const server = expressSetup.server(this.getPort());
    expressSetup.registerHandlers(server);
    expressSetup.setRequestTimeout(server);
  }

  buildThumbnailApi() {
    const dplaApiKey = process.env.DPLA_API_KEY;

    if (!dplaApiKey) {
      throw new Error("Env variable DPLA_API_KEY not set.");
    }

    const awsRegion = process.env.REGION ?? "us-east-1";
    const bucket = process.env.BUCKET ?? "dpla-thumbnails";
    const sqsUrl =
      process.env.SQS_URL ??
      "https://sqs.us-east-1.amazonaws.com/283408157088/thumbp-image";
    const dplaApiUrl = process.env.DPLA_API_URL ?? "https://api.dp.la";

    const awsOptions = { region: awsRegion };
    const s3Client = new S3Client(awsOptions);
    const sqsClient = new SQSClient(awsOptions);
    const dplaApi = new DplaApi(dplaApiUrl, dplaApiKey);
    const thumbnailStorage = new ThumbnailStorage(s3Client, bucket);
    const thumbnailCacheQueue = new ThumbnailCacheQueue(sqsUrl, sqsClient);
    const responseHelper = new ResponseHelper();

    return new ThumbnailApi(
      dplaApi,
      thumbnailStorage,
      thumbnailCacheQueue,
      responseHelper,
    );
  }

  doFork(childrenCount: number): void {
    cluster
      .on("exit", (worker: Worker): void => {
        this.logger.info(`Worker ${String(worker.process.pid)} died`);
        this.logger.info("Initiating replacement worker.");
        cluster.fork();
      })
      .on("online", (worker: Worker): void => {
        this.logger.info(`worker ${String(worker.process.pid)} online`);
      });
    for (let i = 0; i < childrenCount; i++) {
      cluster.fork();
    }
  }

  getPort(): number {
    const portString = process.env.PORT ?? "3000";
    return Number.parseInt(portString);
  }

  psCount() {
    return Number(process.env.PS_COUNT) || availableParallelism();
  }

  mustFork() {
    return (
      process.env.MUST_FORK === "true" || process.env.NODE_ENV === "production"
    );
  }

  isPrimary() {
    return cluster.isPrimary;
  }
}

if (require.main === module) {
  new Main().start();
}
