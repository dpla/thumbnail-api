import { PassThrough } from "stream";
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

  test("pipe: streams data to response and resolves after flush", async () => {
    const dest = new PassThrough();
    const writeSpy = jest.spyOn(dest, "write");
    const endSpy = jest.spyOn(dest, "end");

    const source = (async function* () {
      yield "1";
      yield "2";
      yield "3";
      yield "4";
      yield "5";
    })();

    const stream = ReadableStream.from(source);

    await responseHelper.pipe(stream, dest as unknown as Response);
    expect(writeSpy).toHaveBeenCalled();
    expect(endSpy).toHaveBeenCalledTimes(1);
  });

  test("pipe: calls end on response when stream errors", async () => {
    const dest = new PassThrough();
    const endSpy = jest.spyOn(dest, "end").mockImplementation(() => dest);

    const erroring = new ReadableStream({
      start(controller) {
        controller.error(new Error("upstream error"));
      },
    });

    await responseHelper.pipe(erroring, dest as unknown as Response);
    expect(endSpy).toHaveBeenCalledTimes(1);
  });
});

describe("ResponseHelper getRemoteImagePromise tests", () => {
  test("getRemoteImagePromise: success", async () => {
    const fakeResult = {
      ok: true,
    };
    const mockFetch = jest.fn(() => Promise.resolve(fakeResult));
    try {
      const responseHelper = new ResponseHelper();
      const imageUrl = "https://example.com/image.jpg";
      global.fetch = mockFetch as unknown as typeof fetch;
      const result = await responseHelper.getRemoteImagePromise(imageUrl);
      expect(result).toBe(fakeResult);
    } finally {
      mockFetch.mockRestore();
    }
  });

  test("getRemoteImagePromise: failure", async () => {
    const fakeResult = {
      ok: false,
      status: 999,
      statusText: "ohnoes",
    };
    const mockFetch = jest.fn(() => Promise.resolve(fakeResult));

    expect.assertions(1);
    try {
      const responseHelper = new ResponseHelper();
      global.fetch = mockFetch as unknown as typeof fetch;
      const imageUrl = "https://example.com/image.jpg";
      await responseHelper.getRemoteImagePromise(imageUrl);
    } catch (error: unknown) {
      expect(error).toBeDefined();
    } finally {
      mockFetch.mockRestore();
    }
  });
});
