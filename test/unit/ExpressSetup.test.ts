import { getLogger } from "../../src/logger";
import { Express as MockExpress } from "jest-express/lib/express";
import { Express } from "express";
import { ExpressSetup } from "../../src/ExpressSetup";
import { Server } from "node:http";
import { ThumbnailApi } from "../../src/ThumbnailApi";
import * as Sentry from "@sentry/node";
import { NO_STORE_HEADERS } from "../../src/ResponseHelper";

import { jest } from "@jest/globals";

describe("ExpressSetup", () => {
  let expressSetup: ExpressSetup;
  let express: MockExpress;

  beforeEach(() => {
    const logger = getLogger();
    logger.configure({ silent: true });
    express = new MockExpress();
    expressSetup = new ExpressSetup(express as unknown as Express, logger);
  });

  test("morgan installs morgan middleware", () => {
    expressSetup.morgan();
    expect(express.use).toHaveBeenCalled();
  });

  test("sentry installs sentry middleware", () => {
    const sentrySpy = jest.spyOn(Sentry, "setupExpressErrorHandler");
    expressSetup.sentry();
    expect(sentrySpy).toHaveBeenCalledWith(express);
  });

  test("registerHandlers registers all the right handlers.", () => {
    const server = new Server();
    const mockHandleExit = jest.fn(
      (reason: string, server: Server, retVal: number) => {
        expect(reason).toBeDefined();
        expect(server).toBe(server);
        expect(retVal).toBeDefined();
      },
    );
    expressSetup.handleExit = mockHandleExit;
    expect(process.listeners("SIGINT").length).toBe(0);
    expect(process.listeners("SIGQUIT").length).toBe(0);
    expect(process.listeners("SIGTERM").length).toBe(0);
    expect(process.listeners("uncaughtException").length).toBe(0);
    expect(process.listeners("unhandledRejection").length).toBe(0);
    expressSetup.registerHandlers(server);
    expect(process.listeners("SIGINT").length).toBe(1);
    expect(process.listeners("SIGQUIT").length).toBe(1);
    expect(process.listeners("SIGTERM").length).toBe(1);
    expect(process.listeners("uncaughtException").length).toBe(1);
    expect(process.listeners("unhandledRejection").length).toBe(1);

    process.listeners("SIGINT")[0]("SIGINT");
    process.listeners("SIGQUIT")[0]("SIGQUIT");
    process.listeners("SIGTERM")[0]("SIGTERM");
    process.listeners("uncaughtException")[0](
      new Error("foo"),
      "uncaughtException",
    );
    process.listeners("unhandledRejection")[0](
      new Error("foo"),
      Promise.resolve(),
    );
    expect(mockHandleExit).toHaveBeenCalledTimes(5);
  });

  test("handleExit", () => {
    const fakeExit = jest.fn((retVal: number) => {
      expect(retVal).toBe(128);
    });
    expressSetup.exit = fakeExit;

    const fakeServer = new Server();
    const fakeClose = jest.fn((callback: (err?: Error) => void) => {
      callback();
      return fakeServer;
    });
    fakeServer.close = fakeClose;
    expressSetup.handleExit("foo", fakeServer, 128);
    expect(fakeClose).toHaveBeenCalled();
    expect(fakeExit).toHaveBeenCalled();
  });

  test("setRequestTimeout", () => {
    const fakeServer = new Server();
    expressSetup.setRequestTimeout(fakeServer);
    expect(fakeServer.requestTimeout).toBe(3000);
  });

  test("server", () => {
    const fakeServer = new Server();
    const listen = jest.fn((port, callback: () => void) => {
      expect(callback).toBeDefined();
      callback();
      expect(port).toBe(4567);
      return fakeServer;
    });
    express.listen = listen;
    const server = expressSetup.server(4567);
    expect(listen).toHaveBeenCalled();
    expect(server).toBe(fakeServer);
  });

  test("routes", () => {
    const fakeThumbnailApi = {} as unknown as ThumbnailApi;
    expressSetup.routes(fakeThumbnailApi);
    expect(express.get).toHaveBeenCalledWith("/thumb/*", expect.anything());
    expect(express.get).toHaveBeenCalledWith("/health", expect.anything());
  });

  const getThumbRoute = () => {
    const thumbRoute = (express.get as jest.Mock).mock.calls.find(
      (call) => call[0] === "/thumb/*",
    );
    expect(thumbRoute).toBeDefined();
    return thumbRoute?.[1] as (req: unknown, res: unknown) => void;
  };

  const fakeResponse = (headersSent: boolean, writableEnded = false) => {
    const res = {
      headersSent,
      writableEnded,
      timeoutCallback: undefined as (() => void) | undefined,
      setTimeout: jest.fn((_ms: number, cb: () => void) => {
        res.timeoutCallback = cb;
      }),
      set: jest.fn(),
      sendStatus: jest.fn(),
      end: jest.fn(),
      destroy: jest.fn(),
      send: jest.fn(),
      status: jest.fn(() => res),
    };
    return res;
  };

  const failingThumbnailApi = () =>
    ({
      handle: jest.fn(() => Promise.reject(new Error("boom"))),
    }) as unknown as ThumbnailApi;

  test("thumb route answers 502 when the handler throws", async () => {
    expressSetup.routes(failingThumbnailApi());
    const res = fakeResponse(false);

    getThumbRoute()({}, res);
    await new Promise((resolve) => setImmediate(resolve));

    expect(res.set).toHaveBeenCalledWith(NO_STORE_HEADERS);
    expect(res.sendStatus).toHaveBeenCalledWith(502);
    expect(res.end).toHaveBeenCalledTimes(1);
    expect(res.destroy).not.toHaveBeenCalled();
  });

  test("thumb route destroys a half-sent response when the handler throws", async () => {
    expressSetup.routes(failingThumbnailApi());
    const res = fakeResponse(true, false);

    getThumbRoute()({}, res);
    await new Promise((resolve) => setImmediate(resolve));

    expect(res.sendStatus).not.toHaveBeenCalled();
    expect(res.end).not.toHaveBeenCalled();
    expect(res.destroy).toHaveBeenCalledTimes(1);
  });

  test("thumb route leaves a finished response alone when the handler throws", async () => {
    expressSetup.routes(failingThumbnailApi());
    const res = fakeResponse(true, true);

    getThumbRoute()({}, res);
    await new Promise((resolve) => setImmediate(resolve));

    expect(res.sendStatus).not.toHaveBeenCalled();
    expect(res.destroy).not.toHaveBeenCalled();
  });

  test("response timeout sends an uncacheable 504", async () => {
    const neverResolves = {
      handle: jest.fn(() => new Promise<void>(() => undefined)),
    } as unknown as ThumbnailApi;
    expressSetup.routes(neverResolves);
    const res = fakeResponse(false);

    getThumbRoute()({}, res);
    await new Promise((resolve) => setImmediate(resolve));
    expect(res.timeoutCallback).toBeDefined();
    res.timeoutCallback?.();

    expect(res.set).toHaveBeenCalledWith(NO_STORE_HEADERS);
    expect(res.status).toHaveBeenCalledWith(504);
    expect(res.send).toHaveBeenCalledWith("Gateway Timeout");
  });
});
