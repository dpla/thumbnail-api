import { getLogger } from "../../src/logger";
import { Express as MockExpress } from "jest-express/lib/express";
import { Express } from "express";
import { ExpressSetup } from "../../src/ExpressSetup";
import { Server } from "node:http";
import { ThumbnailApi } from "../../src/ThumbnailApi";
import * as Sentry from "@sentry/node";

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
});
