import { ResponseHelper } from "../../src/ResponseHelper";

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
});
