import {
  DplaMap,
  getCacheHeaders,
  getHeadersFromTarget,
  getImageUrlFromSearchResult,
  getItemId,
  getS3Key,
  isProbablyURL,
  sendError,
  ThumbnailApi,
  translateStatusCode,
} from "./ThumbnailApi";

import * as express from "express";
import { Response as ExpressResponse } from "jest-express/lib/response";

jest.mock("@opensearch-project/opensearch");
import { Client } from "@opensearch-project/opensearch";

import { mockClient } from "aws-sdk-client-mock";
import "aws-sdk-client-mock-jest";
import {
  HeadObjectCommand,
  HeadObjectCommandOutput,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  SendMessageCommand,
  SendMessageCommandOutput,
  SendMessageResult,
  SQSClient,
} from "@aws-sdk/client-sqs";

jest.mock("@aws-sdk/s3-request-presigner");
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import * as matchers from "jest-extended";
expect.extend(matchers);

test.each([
  [
    "223ea5040640813b6c8204d1e0778d30",
    "2/2/3/e/223ea5040640813b6c8204d1e0778d30.jpg",
  ],
  [
    "11111111111111111111111111111111",
    "1/1/1/1/11111111111111111111111111111111.jpg",
  ],
])("getS3Key", (input, output) => {
  expect(getS3Key(input)).toBe(output);
});

test.each([
  [
    "/thumb/223ea5040640813b6c8204d1e0778d30",
    "223ea5040640813b6c8204d1e0778d30",
  ],
  [
    "/thumb/11111111111111111111111111111111",
    "11111111111111111111111111111111",
  ],
  ["/thumb//11111111111111111111111111111111", undefined],
  ["/thumb/111111111111111111111111111111111/", undefined],
  ["/thumb/oneoneoneoneoneoneoneoneoneoneon", undefined],
  ["223ea5040640813b6c8204d1e0778d30", undefined],
  ["/thumb", undefined],
  ["/thumb/", undefined],
  ["/thumb/1234", undefined],
])("getItemId", (input: string, output: string | undefined): void => {
  expect(getItemId(input)).toBe(output);
});

test("getImageUrlFromSearchResult: String", (): void => {
  const test = {
    _source: {
      object: "https://google.com",
    },
  } as DplaMap;
  expect(getImageUrlFromSearchResult(test)).toBe("https://google.com");
});

test("getImageUrlFromSearchResult: Array", (): void => {
  const test = {
    _source: {
      object: ["https://google.com"],
    },
  };
  expect(getImageUrlFromSearchResult(test)).toBe("https://google.com");
});

test("getImageUrlFromSearchResult: Bad URL", () => {
  const test = {
    _source: {
      object: ["blah:hole"],
    },
  };
  expect(getImageUrlFromSearchResult(test)).toBe(undefined);
});

test("getImageUrlFromSearchResult: Empty result", () => {
  const test = {};
  expect(getImageUrlFromSearchResult(test)).toBe(undefined);
});

test("getImageUrlFromSearchResult: Wild type", () => {
  const test = {
    _source: {
      object: { whoops: "blah:hole" },
    },
  } as unknown as DplaMap;
  expect(getImageUrlFromSearchResult(test)).toBe(undefined);
});

test("getImageUrlFromSearchResult: Record has no thumbnail", () => {
  const test = {
    _source: {
      foo: ["bar"],
      object: undefined,
    },
  };
  expect(getImageUrlFromSearchResult(test)).toBe(undefined);
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
  expect(isProbablyURL(input)).toBe(output);
});

test("getCacheHeaders", (): void => {
  const result: Map<string, string> = getCacheHeaders(2);
  expect(result.get("Cache-Control")).toBe("public, max-age=2");
  const expires = result.get("Expires");
  expect(expires).toMatch(
    /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun),\W\d{2}\W(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\W\d{4}\W\d{2}:\d{2}:\d{2}\WGMT$/,
  );
});

test("getHeadersFromTarget: no headers", (): void => {
  const headers = new Headers();
  const result = getHeadersFromTarget(headers);
  expect(result.size).toBe(0);
});

test("getHeadersFromTarget: Content-Type", (): void => {
  const headers = new Headers();
  const contentType = "Content-Type";
  const imageJpeg = "image/jpeg";
  headers.append(contentType, imageJpeg);
  const result = getHeadersFromTarget(headers);
  expect(result.size).toBe(1);
  expect(result.get(contentType)).toBe(imageJpeg);
});

test("getHeadersFromTarget: Last-Modified", (): void => {
  const headers = new Headers();
  const lastModified = "Last-Modified";
  const lastModifiedValue = "2";
  headers.append(lastModified, lastModifiedValue);
  const result = getHeadersFromTarget(headers);
  expect(result.size).toBe(1);
  expect(result.get(lastModified)).toBe(lastModifiedValue);
});

test("translateStatusCode", () => {
  expect(translateStatusCode(200)).toBe(200);
  expect(translateStatusCode(404)).toBe(404);
  expect(translateStatusCode(410)).toBe(404);
  expect(translateStatusCode(999)).toBe(502);
});

test("sendError", () => {
  const consoleSpy = jest.spyOn(console, "error").mockImplementation();
  const mockResponse = new ExpressResponse();
  const itemId = "12345";
  const code = 6789;
  const error = new Error("send me");
  sendError(mockResponse as unknown as express.Response, itemId, code, error);
  expect(consoleSpy).toHaveBeenCalledTimes(1);
  expect(mockResponse.sendStatus).toHaveBeenCalledWith(code);
  expect(mockResponse.end).toHaveBeenCalledTimes(1);
  consoleSpy.mockRestore();
});

describe("ThumbnailApi class tests", () => {
  const fakeBucket = "foobar";
  const fakeSQS = "bazbuzz";
  const openSearchClient = new Client({ node: "http://localhost:9200" });
  const mockS3Client = mockClient(S3Client);
  const mockSqsClient = mockClient(SQSClient);
  const api = new ThumbnailApi(
    fakeBucket,
    fakeSQS,
    mockS3Client as unknown as S3Client,
    mockSqsClient as unknown as SQSClient,
    openSearchClient,
  );

  beforeEach(() => {
    mockS3Client.reset();
    mockSqsClient.reset();
    jest.resetAllMocks();
  });

  test("lookupImageInS3", async () => {
    const id = "12345";
    mockS3Client.on(HeadObjectCommand).resolves({} as HeadObjectCommandOutput);
    await api.lookupImageInS3(id);
    expect(mockS3Client).toHaveReceivedCommandWith(HeadObjectCommand, {
      Bucket: fakeBucket,
      Key: "1/2/3/4/12345.jpg",
    });
  });

  test("getS3Url", async () => {
    const id = "12345";
    const url = "https://example.com/12345";
    const mockedGetSignedUrl = jest.mocked(getSignedUrl);
    mockedGetSignedUrl.mockResolvedValue(url);
    const result = await api.getS3Url(id);
    expect(mockedGetSignedUrl).toHaveBeenCalledWith(
      mockS3Client,
      expect.toBeObject(),
    );
    expect(result).toBe(url);
  });

  test("queueToThumbnailCache", async () => {
    const id = "12345";
    const url = "https://example.com/12345";
    mockSqsClient
      .on(SendMessageCommand)
      .resolves({} as SendMessageCommandOutput);
    const result: SendMessageResult = await api.queueToThumbnailCache(id, url);
    expect(result).toStrictEqual({});
    expect(mockSqsClient).toHaveReceivedCommandWith(SendMessageCommand, {
      MessageBody: JSON.stringify({ id: id, url: url }),
      QueueUrl: fakeSQS,
    });
  });

  test("lookupItemInElasticsearch", async () => {
    const fn = jest.fn().mockReturnValue({});
    openSearchClient.get = fn;
    const id = "12345";
    await api.lookupItemInElasticsearch(id);
    expect(fn).toHaveBeenCalledWith({
      id: id,
      index: "dpla_alias",
      _source: ["id", "object"],
    });
  });

  test("getRemoteImagePromise", async () => {
    const url = "http://example.com/12345";
    const expectedResult = {
      ok: true,
    } as unknown as Response; //this is a fetch Response
    const fetch = jest.fn(() => Promise.resolve(expectedResult)) as jest.Mock;
    global.fetch = fetch;
    const result = await api.getRemoteImagePromise(url);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result).toBe(expectedResult);
  });

  test("failed getRemoteImagePromise", () => {
    const url = "https://example.com/12345";
    const expectedResult = {
      ok: false,
      status: 419,
      statusText: "I'm a teapot",
    } as unknown as Response; //this is a fetch Response
    global.fetch = jest.fn(() => Promise.resolve(expectedResult)) as jest.Mock;
    api.getRemoteImagePromise(url).then(
      () => fail("Not rejected."),
      () => undefined,
    );
  });
});

describe("Business logic tests", () => {
  // const fakeBucket = "foobar";
  // const fakeSQS = "bazbuzz";
  // const openSearchClient = new Client({ node: "http://localhost:9200" });
  // const mockS3Client = mockClient(S3Client);
  // const mockSqsClient = mockClient(SQSClient);
  //
  // const itemId = "12345";
  // const itemUrl = "https://example.com/" + itemId;
  // const mockFetchResponse = { status: 200 } as Response; //this is a fetch response
  // const mockHeaders = new Map([
  //   ["Content-type", "image/jpeg"],
  //   ["Last-Modified", "2"],
  // ]);
  //
  // jest.mock("./ThumbnailApi", () => {
  //   const originalModule: ThumbnailApi = jest.requireActual("./ThumbnailApi");
  //   return {
  //     __esModule: true,
  //     ...originalModule,
  //   } as unknown as typeof ThumbnailApi;
  // });
  //
  // const api = new ThumbnailApi(
  //   fakeBucket,
  //   fakeSQS,
  //   mockS3Client as unknown as S3Client,
  //   mockSqsClient as unknown as SQSClient,
  //   openSearchClient,
  // );
  //
  // api.getS3Url = jest.fn().mockImplementation(() => Promise.resolve(itemUrl));
  //
  // api.getRemoteImagePromise = jest
  //   .fn()
  //   .mockImplementation(() => Promise.resolve(mockFetchResponse));
  //
  //api.getHeadersFromTarget = jest.fn().mockImplementation(() => mockHeaders))
  /*
  async serveItemFromS3(
    itemId: string,
    expressResponse: express.Response,
  ): Promise<void> {
    expressResponse.set(getCacheHeaders(LONG_CACHE_TIME));
    const s3url: string = await this.getS3Url(itemId);
    const response: Response = await this.getRemoteImagePromise(s3url);
    expressResponse.status(translateStatusCode(response.status));
    expressResponse.set(getHeadersFromTarget(response.headers));
    const body = response.body;
    if (body != null) {
      Readable.from(body).pipe(expressResponse, { end: true });
    } else {
      const error = new Error("Response had no body.");
      sendError(expressResponse, itemId, 502, error);
    }
  }
   */
  // test("serveItemFromS3", async () => {
  //   const mockExpressResponse = new ExpressResponse();
  //
  //   await api.serveItemFromS3(
  //     itemId,
  //     mockExpressResponse as unknown as express.Response,
  //   );
  //
  //   expect(mockExpressResponse.set).toHaveBeenCalledTimes(2);
  //   expect(mockExpressResponse.end).toHaveBeenCalled();
  // });
});
