import { ThumbnailApi } from "../../src/ThumbnailApi";

import * as express from "express";
import { Response as ExpressResponse } from "jest-express/lib/response";

import * as matchers from "jest-extended";
import { DplaApi } from "../../src/DplaApi";
import { ThumbnailStorage } from "../../src/ThumbnailStorage";
import { ThumbnailCacheQueue } from "../../src/ThumbnailCacheQueue";
import { ResponseHelper } from "../../src/ResponseHelper";
expect.extend(matchers);

describe("ThumbnailApi", () => {
  const dplaApi = jest.mocked(DplaApi);
  const thumbnailStorage = jest.mocked(ThumbnailStorage);
  const thumbnailCacheQueue = jest.mocked(ThumbnailCacheQueue);
  const responsePiper = jest.mocked(ResponseHelper);

  const thumbnailApi = new ThumbnailApi(
    dplaApi as unknown as DplaApi,
    thumbnailStorage as unknown as ThumbnailStorage,
    thumbnailCacheQueue as unknown as ThumbnailCacheQueue,
    responsePiper as unknown as ResponseHelper,
  );

  beforeEach(() => {
    jest.resetAllMocks();
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
