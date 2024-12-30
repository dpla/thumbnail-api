import { ThumbnailApi } from "../../src/ThumbnailApi";

import * as matchers from "jest-extended";
expect.extend(matchers);

import { DplaApi } from "../../src/DplaApi";
import { ThumbnailStorage } from "../../src/ThumbnailStorage";
import { ThumbnailCacheQueue } from "../../src/ThumbnailCacheQueue";
import { ResponseHelper } from "../../src/ResponseHelper";
import { S3Client } from "@aws-sdk/client-s3";

import * as express from "express";
import { Response as ExpressResponse } from "jest-express/lib/response";
import { SQSClient } from "@aws-sdk/client-sqs";

describe("ThumbnailApi", () => {
  const dplaApi = jest.mocked(DplaApi);
  const mockS3Client = jest.mocked(S3Client);
  const thumbnailStorage = new ThumbnailStorage(
    mockS3Client as unknown as S3Client,
    "bucket",
  );
  const thumbnailCacheQueue = jest.mocked(ThumbnailCacheQueue);
  const responseHelper = new ResponseHelper();
  const thumbnailApi = new ThumbnailApi(
    dplaApi as unknown as DplaApi,
    thumbnailStorage as unknown as ThumbnailStorage,
    thumbnailCacheQueue as unknown as ThumbnailCacheQueue,
    responseHelper,
  );

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
    expect(thumbnailApi.getItemId(input)).toBe(output);
  });

  test("sendError", () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation();
    const mockResponse = new ExpressResponse();
    const itemId = "12345";
    const code = 6789;
    const error = new Error("send me");
    thumbnailApi.sendError(
      mockResponse as unknown as express.Response,
      itemId,
      code,
      error,
    );
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(mockResponse.sendStatus).toHaveBeenCalledWith(code);
    expect(mockResponse.end).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
  });
});

describe("ThumbnailApi async tests", () => {
  const itemId = "12345";
  const mockUrl = "https://example.com/12345";
  const dplaApi = new DplaApi("", "");

  dplaApi.getThumbnailUrl = (dplaId: string) => {
    expect(dplaId).toBe(itemId);
    return Promise.resolve(mockUrl);
  };

  const mockS3Client = jest.mocked(S3Client);
  const mockSqsClient = jest.mocked(SQSClient);

  const thumbnailStorage = new ThumbnailStorage(
    mockS3Client as unknown as S3Client,
    "bucket",
  );

  thumbnailStorage.getSignedS3Url = (id) => {
    expect(id).toBe(itemId);
    return Promise.resolve(mockUrl);
  };

  const thumbnailCacheQueue = new ThumbnailCacheQueue(
    "",
    mockSqsClient as unknown as SQSClient,
  );

  thumbnailCacheQueue.queueToThumbnailCache = (id: string, url: string) => {
    expect(id).toBe(itemId);
    expect(url).toBe(mockUrl);
    return Promise.resolve();
  };

  const responseHelper = new ResponseHelper();

  responseHelper.getRemoteImagePromise = (imageUrl: string) => {
    return Promise.resolve(
      new Response("12345", {
        status: 200,
        statusText: "OK",
        headers: [
          ["url", imageUrl],
          ["content-type", "image/jpeg"],
        ],
      }),
    );
  };

  responseHelper.getHeadersFromTarget = (headers: Headers) => {
    expect(headers).toBeDefined();
    return new Map([["content-type", "image/jpeg"]]);
  };

  const mockPipe = jest.fn();
  responseHelper.pipe = mockPipe;

  const mockExpressResponse = new ExpressResponse();

  const thumbnailApi = new ThumbnailApi(
    dplaApi as unknown as DplaApi,
    thumbnailStorage as unknown as ThumbnailStorage,
    thumbnailCacheQueue as unknown as ThumbnailCacheQueue,
    responseHelper,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    mockExpressResponse.resetMocked();
  });

  test("serveItemFromS3", async () => {
    await thumbnailApi.serveItemFromS3(
      itemId,
      mockExpressResponse as unknown as express.Response,
    );
    expect(mockExpressResponse.set).toHaveBeenCalledTimes(2);
    expect(mockPipe).toHaveBeenCalled();
  });

  test("proxyItemFromContributor: success", async () => {
    await thumbnailApi.proxyItemFromContributor(
      itemId,
      mockExpressResponse as unknown as express.Response,
    );
    expect(mockExpressResponse.set).toHaveBeenCalledTimes(2);
    expect(mockPipe).toHaveBeenCalled();
  });

  test("proxyItemFromContributor: success", async () => {
    await thumbnailApi.proxyItemFromContributor(
      itemId,
      mockExpressResponse as unknown as express.Response,
    );
    expect(mockExpressResponse.set).toHaveBeenCalledTimes(2);
    expect(mockPipe).toHaveBeenCalled();
  });

  test("proxyItemFromContributor: thumbnail lookup failure", async () => {
    const dplaApi = new DplaApi("", "");
    const getThumbnailUrl = jest.fn(() => {
      throw new Error("oops");
    });

    dplaApi.getThumbnailUrl = getThumbnailUrl;

    const thumbnailApiBadThumbnailCall = new ThumbnailApi(
      dplaApi as unknown as DplaApi,
      thumbnailStorage as unknown as ThumbnailStorage,
      thumbnailCacheQueue as unknown as ThumbnailCacheQueue,
      responseHelper,
    );

    const sendError = jest.fn();
    thumbnailApiBadThumbnailCall.sendError = sendError;

    await thumbnailApiBadThumbnailCall.proxyItemFromContributor(
      itemId,
      mockExpressResponse as unknown as express.Response,
    );

    expect(getThumbnailUrl).toHaveBeenCalled();
    expect(sendError).toHaveBeenCalled();
  });

  test("proxyItemFromContributor: thumbnail undefined", async () => {
    const dplaApi = new DplaApi("", "");
    const getThumbnailUrl = jest.fn(() => {
      return Promise.resolve(undefined);
    });

    dplaApi.getThumbnailUrl = getThumbnailUrl;

    const thumbnailApiBadThumbnailCall = new ThumbnailApi(
      dplaApi as unknown as DplaApi,
      thumbnailStorage as unknown as ThumbnailStorage,
      thumbnailCacheQueue as unknown as ThumbnailCacheQueue,
      responseHelper,
    );

    const sendError = jest.fn();
    thumbnailApiBadThumbnailCall.sendError = sendError;

    await thumbnailApiBadThumbnailCall.proxyItemFromContributor(
      itemId,
      mockExpressResponse as unknown as express.Response,
    );

    expect(getThumbnailUrl).toHaveBeenCalled();
    expect(sendError).toHaveBeenCalled();
  });

  test("thumbnailCacheQueue failed", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation();
    const thumbnailCacheQueue = new ThumbnailCacheQueue(
      "",
      mockS3Client as unknown as SQSClient,
    );

    const queueToThumbnailCache = jest.fn(() => {
      return Promise.reject(new Error("oops"));
    });

    thumbnailCacheQueue.queueToThumbnailCache = queueToThumbnailCache;

    const thumbnailApiFailingCacheQueue = new ThumbnailApi(
      dplaApi as unknown as DplaApi,
      thumbnailStorage as unknown as ThumbnailStorage,
      thumbnailCacheQueue as unknown as ThumbnailCacheQueue,
      responseHelper,
    );

    await thumbnailApiFailingCacheQueue.proxyItemFromContributor(
      itemId,
      mockExpressResponse as unknown as express.Response,
    );

    expect(queueToThumbnailCache).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
  });
});
