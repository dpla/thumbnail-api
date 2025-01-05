import { ExpressSetup } from "../../src/ExpressSetup";
import { Main } from "../../src/main";
import { Server } from "node:http";
import { ThumbnailApi } from "../../src/ThumbnailApi";
import cluster from "node:cluster";
import { availableParallelism } from "node:os";

describe("index", () => {
  let main: Main;

  beforeEach(() => {
    main = new Main();
    main.logger.configure({ silent: true });
  });

  test("buildThumbnailApi dies if DPLA_API_KEY isn't set", () => {
    expect(() => {
      main.buildThumbnailApi();
    }).toThrow("Env variable DPLA_API_KEY not set.");
  });

  test("App runs if DPLA_API_KEY is set", () => {
    process.env.DPLA_API_KEY = "12345";
    const api = main.buildThumbnailApi();
    expect(api).toBeDefined();
  });

  test("Start forks when isPrimary", () => {
    main.isPrimary = jest.fn(() => true);
    main.mustFork = jest.fn(() => true);
    const doFork = jest.fn();
    main.doFork = doFork;
    main.start();
    expect(doFork).toHaveBeenCalled();
  });

  test("Start builds worker when not primary", () => {
    main.isPrimary = jest.fn(() => false);
    const doWorker = jest.fn();
    main.doWorker = doWorker;
    main.start();
    expect(doWorker).toHaveBeenCalled();
  });

  test("doWorker calls the appropriate methods on ExpressWorker", () => {
    const fakeServer = {} as unknown as Server;
    const server = jest.fn((port: number) => {
      expect(port).toBe(3000);
      return fakeServer;
    });
    const sentry = jest.fn();
    const morgan = jest.fn();
    const routes = jest.fn();
    const registerHandlers = jest.fn();
    const setRequestTimeout = jest.fn();
    const fakeBuildThumbnailApi = {} as unknown as ThumbnailApi;
    const buildThumbnailApi = jest.fn(() => fakeBuildThumbnailApi);
    main.buildThumbnailApi = buildThumbnailApi;
    const expressSetup = {
      sentry,
      morgan,
      server,
      routes,
      registerHandlers,
      setRequestTimeout,
    } as unknown as ExpressSetup;

    main.doWorker(expressSetup);
    expect(sentry).toHaveBeenCalled();
    expect(morgan).toHaveBeenCalled();
    expect(routes).toHaveBeenCalledWith(fakeBuildThumbnailApi);
    expect(buildThumbnailApi).toHaveBeenCalled();
    expect(registerHandlers).toHaveBeenCalledWith(fakeServer);
    expect(setRequestTimeout).toHaveBeenCalledWith(fakeServer);
  });

  test("doFork calls cluster.fork", () => {
    const mockFork = jest.fn();
    cluster.fork = mockFork;
    main.doFork(3);
    expect(mockFork).toHaveBeenCalledTimes(3);
  });

  test("getPort returns 3000 by default", () => {
    const port = main.getPort();
    expect(port).toBe(3000);
  });

  test("getPort is configurable with PORT env variable", () => {
    process.env.PORT = "4000";
    const port = main.getPort();
    expect(port).toBe(4000);
  });

  test("psCount returns avialableParallelism by default", () => {
    const count = availableParallelism();
    expect(main.psCount()).toBe(count);
  });

  test("psCount is configurable with PS_COUNT env variable", () => {
    process.env.PS_COUNT = "42";
    const count = main.psCount();
    expect(count).toBe(42);
  });

  test("mustFork returns false by default", () => {
    const mustFork = main.mustFork();
    expect(mustFork).toBe(false);
  });

  test("mustFork is configurable with MUST_FORK", () => {
    process.env.MUST_FORK = "true";
    const mustFork = main.mustFork();
    expect(mustFork).toBe(true);
    process.env.MUST_FORK = "false";
    const mustFork2 = main.mustFork();
    expect(mustFork2).toBe(false);
  });

  test("mustFork is configurable with NODE_ENV", () => {
    process.env.NODE_ENV = "production";
    const mustFork = main.mustFork();
    expect(mustFork).toBe(true);
    process.env.NODE_ENV = "not-production";
    const mustFork2 = main.mustFork();
    expect(mustFork2).toBe(false);
  });

  test("isPrimary returns true if this is the main process", () => {
    const isPrimary = main.isPrimary();
    expect(isPrimary).toBe(true);
  });
});
