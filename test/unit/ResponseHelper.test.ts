import { ResponseHelper } from "../../src/ResponseHelper";
import { Response } from "express";

describe("ResponseHelper", () => {
  let responseHelper = new ResponseHelper();

  afterEach(() => {
    responseHelper = new ResponseHelper();
  });

  test("getHeadersFromTarget", () => {
    const headers = new Headers([
      ["Content-Type", "image/jpeg"],
      ["Last-Modified", "2"],
      ["foo", "bar"],
    ]);
    const result = responseHelper.getHeadersFromTarget(headers);
    expect(result.get("Content-Type")).toBe("image/jpeg");
    expect(result.get("Last-Modified")).toBe("2");
    expect(result.get("foo")).toBeUndefined();
  });

  test.each([
    [200, 200],
    [404, 404],
    [410, 404],
    [999, 502],
  ])("translateStatusCode", (code: number, output: number) => {
    expect(responseHelper.translateStatusCode(code)).toBe(output);
  });

  test("okBody", () => {
    expect(responseHelper.okBody(null)).toBe(false);
    expect(responseHelper.okBody(new ReadableStream())).toBe(true);
  });

  test("okStatus", () => {
    expect(responseHelper.okStatus(200)).toBe(true);
    expect(responseHelper.okStatus(404)).toBe(false);
  });

  test.each([
    [
      new Headers([
        ["content-type", "image/jpeg"],
        ["foo", "bar"],
      ]),
      true,
    ],
    [new Headers([["foo", "bar"]]), false],
    [new Headers([["content-type", "text/plain"]]), false],
    [new Headers([["content-type", "application/octet-stream"]]), true],
  ])("okHeaders", (headers, result) => {
    expect(responseHelper.okHeaders(headers)).toBe(result);
  });

  test("getCacheHeaders", () => {
    const result = responseHelper.getCacheHeaders(123);
    expect(result.get("Cache-Control")).toBe("public, max-age=123");
    const expires = result.get("Expires");
    expect(expires).toBeDefined();
    expect(expires).not.toBeNull();
    const nonNullExpires = expires ? expires : "";
    const expiresDate = new Date(nonNullExpires);
    expect(expiresDate.getTime()).toBeGreaterThan(new Date().getTime());
  });

  test("pipe", async () => {
    const end = jest.fn();
    const on = jest.fn();
    const once = jest.fn();
    const emit = jest.fn();
    const write = jest.fn();

    const expressResponse = {
      end: end,
      on: on,
      once: once,
      emit: emit,
      write: write,
    } as unknown as Response;

    const source = (async function* () {
      yield Promise.resolve("1");
      yield Promise.resolve("2");
      yield Promise.resolve("3");
      yield Promise.resolve("4");
      yield Promise.resolve("5");
    })();

    const stream = ReadableStream.from(source);

    await responseHelper.pipe(stream, expressResponse);
    expect(on).toHaveBeenCalled();
    expect(once).toHaveBeenCalled();
    expect(emit).toHaveBeenCalled();
    expect(end).toHaveBeenCalledTimes(1);
  });
});

describe("ResponseHelper getRemoteImagePromise tests", () => {
  test("getRemoteImagePromise: success", async () => {
    const responseHelper = new ResponseHelper();
    const mockFetch = jest.fn(() => Promise.resolve(fakeResult));
    global.fetch = mockFetch as unknown as typeof fetch;

    const fakeResult = {
      ok: true,
    };

    const imageUrl = "https://example.com/image.jpg";
    const result = await responseHelper.getRemoteImagePromise(imageUrl);
    expect(result).toBe(fakeResult);
    mockFetch.mockRestore();
  });

  test("getRemoteImagePromise: failure", async () => {
    const responseHelper = new ResponseHelper();
    const mockFetch = jest.fn(() => Promise.resolve(fakeResult));
    global.fetch = mockFetch as unknown as typeof fetch;

    const fakeResult = {
      ok: false,
      status: 999,
      statusText: "ohnoes",
    };

    const imageUrl = "https://example.com/image.jpg";
    expect.assertions(1);
    await responseHelper
      .getRemoteImagePromise(imageUrl)
      .catch((error: unknown) => {
        expect(error).toBeDefined();
      });

    mockFetch.mockRestore();
  });
});
