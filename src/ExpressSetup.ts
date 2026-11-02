import morgan from "morgan";
import { Logger } from "winston";
import express, { Express } from "express";
import * as Http from "node:http";
import { ThumbnailApi } from "./ThumbnailApi";
import { Server } from "node:http";
import { REQUEST_TIMEOUT_MS, RESPONSE_TIMEOUT_MS } from "./timeoutConfig";
import { NO_STORE_HEADERS } from "./ResponseHelper";

export class ExpressSetup {
  app: Express;
  logger: Logger;

  constructor(app: Express, logger: Logger) {
    this.app = app;
    this.logger = logger;
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
    server.requestTimeout = REQUEST_TIMEOUT_MS;
  }

  // Listen callback makes Express 5 swallow the first server error after startup.
  server(port: number): Http.Server {
    const server = this.app.listen(port);
    server.once("listening", () => {
      this.logger.info(`Server is listening on ${String(port)}`);
    });
    return server;
  }

  routes(thumbnailApi: ThumbnailApi) {
    const handler = async (req: express.Request, res: express.Response) => {
      // Sentry's Express instrumentation and stream.pipeline add over 10 "close" listeners.
      res.setMaxListeners(20);
      res.setTimeout(RESPONSE_TIMEOUT_MS, () => {
        if (res.writableEnded) {
          return;
        }
        if (res.headersSent) {
          res.destroy();
          return;
        }
        res.set(NO_STORE_HEADERS);
        res.status(504).send("Gateway Timeout");
      });
      try {
        await thumbnailApi.handle(req, res);
      } catch (error) {
        this.logger.error("Unexpected Error fetching thumb:", error);
        // Answer now; if the body was already streaming, close the socket.
        if (!res.headersSent) {
          res.set(NO_STORE_HEADERS);
          res.sendStatus(502);
          res.end();
        } else if (!res.writableEnded) {
          res.destroy();
        }
      }
    };

    this.app.get(
      "/thumb/{*splat}",
      (req: express.Request, res: express.Response) => {
        handler(req, res)
          .then(() => Promise.resolve())
          .catch((reason: unknown) => {
            this.logger.error("Caught error from handler: %s", reason);
          });
      },
    );

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
