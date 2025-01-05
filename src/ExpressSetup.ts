import * as Sentry from "@sentry/node";
import morgan from "morgan";
import { Logger } from "winston";
import express, { Express } from "express";
import * as Http from "node:http";
import { ThumbnailApi } from "./ThumbnailApi";
import { Server } from "node:http";

// How long we wait for a request from a socket
const REQUEST_TIMEOUT = 3000; // 3 secs

// How long we wait on piping a response before we give up
const RESPONSE_TIMEOUT = 10000; // 10 seconds

export class ExpressSetup {
  app: Express;
  logger: Logger;

  constructor(app: Express, logger: Logger) {
    this.app = app;
    this.logger = logger;
  }

  sentry() {
    Sentry.setupExpressErrorHandler(this.app);
  }

  morgan() {
    this.app.use(
      morgan(":method :url :status :res[content-length] - :response-time ms", {
        stream: {
          write: (message: string) => this.logger.info(message.trim()),
        },
      }),
    );
  }

  exit(retVal: number) {
    process.exit(retVal);
  }

  handleExit(reason: string, server: Server, retVal: number) {
    this.logger.info("Received %s. Shutting down.", reason);
    server.close(() => {
      this.exit(retVal);
    });
  }

  registerHandlers(server: Http.Server) {
    process.on("SIGINT", () => {
      this.handleExit("SIGINT", server, 0);
    });

    process.on("SIGQUIT", () => {
      this.handleExit("SIGQUIT", server, 0);
    });

    process.on("SIGTERM", () => {
      this.handleExit("SIGTERM", server, 0);
    });

    process.on("uncaughtException", (err: unknown, origin: string) => {
      this.handleExit(
        "uncaughtException: " + String(err) + ": " + origin,
        server,
        1,
      );
    });

    process.on("unhandledRejection", (err: unknown, origin: string) => {
      this.handleExit(
        "unhandledRejection: " + String(err) + ": " + origin,
        server,
        1,
      );
    });
  }

  setRequestTimeout(server: Http.Server) {
    server.requestTimeout = REQUEST_TIMEOUT;
  }

  server(port: number): Http.Server {
    return this.app.listen(port, (): void => {
      this.logger.info(`Server is listening on ${String(port)}`);
    });
  }

  routes(thumbnailApi: ThumbnailApi) {
    // next two methods are like this to make
    // eslint happy about the async get handler
    const handler = async (req: express.Request, res: express.Response) => {
      res.setTimeout(RESPONSE_TIMEOUT, () => {
        res.status(504);
        res.send("Gateway Timeout");
      });
      try {
        await thumbnailApi.handle(req, res);
      } catch (error) {
        this.logger.error("Unexpected Error fetching thumb:", error);
      }
    };

    this.app.get("/thumb/*", (req: express.Request, res: express.Response) => {
      handler(req, res)
        .then(() => Promise.resolve())
        .catch((reason: unknown) => {
          this.logger.error("Caught error from handler: %s", reason);
        });
    });

    this.app.get(
      "/health",
      (_req: express.Request, res: express.Response): void => {
        const healthcheck = {
          message: "OK",
          uptime: process.uptime(),
          timestamp: Date.now(),
        };
        res.status(200).send(healthcheck).end();
      },
    );
  }
}
