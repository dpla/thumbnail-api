import { DplaApi, SearchResults } from "../../src/DplaApi";

describe("DplaApi", () => {
  const fakeApiUrl = "https://example.com";
  const fakeToken = "12345";

  let api = new DplaApi(fakeApiUrl, fakeToken);

  afterEach(() => {
    api = new DplaApi(fakeApiUrl, fakeToken);
  });

  test("getRequestInit", () => {
    const result = api.getRequestInit();
    expect(result.headers).toStrictEqual({
      Authorization: fakeToken,
    });
  });

  test.each([
    ["foo", false],
    ["gopher:hole", false],
    ["https://foo.com", true],
    ["http://foo.com", true],
    ["https://foo.com", true],
    ["https://", false],
    [undefined, false],
  ])("isProbablyURL", (input: string | undefined, output) => {
    expect(api.isProbablyURL(input)).toBe(output);
  });

  test.each([
    { count: 1, docs: [{ object: "https://foo.com" }] } as SearchResults,
    {
      count: 2,
      docs: [{ object: "https://foo.com" }, { object: "https://bar.com" }],
    } as SearchResults,
  ])("throwOnSearchResults: good", (searchResults: SearchResults) => {
    api.throwOnSearchResults(searchResults);
  });

  test("throwOnSearchResults: bad", () => {
    const searchResults = {
      count: 0,
      docs: [],
    } as unknown as SearchResults;
    expect(() => {
      api.throwOnSearchResults(searchResults);
    }).toThrow("DPLA item not found.");
  });

  test("throwOnApiError: good", () => {
    const headers = new Headers([["content-type", "application/json"]]);
    const response = {
      ok: true,
      status: 200,
      headers: headers,
    } as unknown as Response;
    api.throwOnApiError(response);
  });

  test("throwOnApiError: bad content type", () => {
    const response = {
      ok: true,
      status: 200,
      headers: new Headers([["content-type", "text/plain"]]),
    } as unknown as Response;
    expect(() => {
      api.throwOnApiError(response);
    }).toThrow("Wrong content type from DPLA API.");
  });

  test("throwOnApiError: bad status", () => {
    const response = {
      ok: false,
      status: 500,
      headers: new Headers([["content-type", "application/json"]]),
    } as unknown as Response;
    expect(() => {
      api.throwOnApiError(response);
    }).toThrow("DPLA API error.");
  });

  test("getApiUrl", () => {
    const result = api.getApiUrl("foo");
    expect(result).toBe(`${fakeApiUrl}/v2/items/foo`);
  });
});
