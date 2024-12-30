import * as express from "express";

import { DplaApi } from "./DplaApi";
import { ThumbnailStorage } from "./ThumbnailStorage";
import { ThumbnailCacheQueue } from "./ThumbnailCacheQueue";
import { ResponseHelper } from "./ResponseHelper";

const LONG_CACHE_TIME: number = 60 * 60 * 24 * 30; // 30 days in seconds
const SHORT_CACHE_TIME = 60 * 60; // 1 hr in seconds
const PATH_PATTERN = /^\/thumb\/([a-f0-9]{32})$/;

export class ThumbnailApi {
  dplaApi: DplaApi;
  thumbnailStorage: ThumbnailStorage;
  thumbnailCacheQueue: ThumbnailCacheQueue;
  responseHelper: ResponseHelper;

  constructor(
    dplaApi: DplaApi,
    thumbnailStorage: ThumbnailStorage,
    thumbnailCacheQueue: ThumbnailCacheQueue,
    responseHelper: ResponseHelper,
  ) {
    this.dplaApi = dplaApi;
    this.thumbnailStorage = thumbnailStorage;
    this.thumbnailCacheQueue = thumbnailCacheQueue;
    this.responseHelper = responseHelper;
  }

  async handle(req: express.Request, res: express.Response) {
    const itemId: string | undefined = this.getItemId(req.path);

    if (!itemId) {
      const error = new Error("Bad item ID.");
      this.sendError(res, "id not found", 400, error);
      return;
    }

    const foundInS3 = await this.thumbnailStorage.lookupImageInS3(itemId);

    if (foundInS3) {
      return this.serveItemFromS3(itemId, res);
    } else {
      return this.proxyItemFromContributor(itemId, res);
    }
  }

  async proxyItemFromContributor(
    itemId: string,
    expressResponse: express.Response,
  ): Promise<void> {
    let imageUrl = undefined;

    try {
      imageUrl = await this.dplaApi.getThumbnailUrl(itemId);
    } catch (e) {
      const error = new Error("Caught error from DPLA API.", { cause: e });
      this.sendError(expressResponse, itemId, 502, error);
      return;
    }

    if (imageUrl === undefined) {
      const error = new Error("No image URL found.");
      this.sendError(expressResponse, itemId, 404, error);
      return;
    }

    // Don't await on this, it's a side effect to make the image be in S3
    // next time, technically not the end of the world if this fails.
    this.thumbnailCacheQueue
      .queueToThumbnailCache(itemId, imageUrl)
      .catch((error: unknown) => {
        console.error("SQS error for %s", itemId, error);
      });

    // we only want the cache to have the proxied image from the contributor
    // for a short amount because it won't have been sized down
    expressResponse.set(this.responseHelper.getCacheHeaders(SHORT_CACHE_TIME));

    let remoteImageResponse: Response | undefined = undefined;

    try {
      remoteImageResponse =
        await this.responseHelper.getRemoteImagePromise(imageUrl);
    } catch (e) {
      const error = new Error(`Couldn't connect to upstream ${imageUrl}`, {
        cause: e,
      });
      this.sendError(expressResponse, itemId, 404, error);
      return;
    }

    const status: number = this.responseHelper.translateStatusCode(
      remoteImageResponse.status,
    );

    if (!this.responseHelper.okStatus(status)) {
      const error = new Error(`Status ${String(status)} from upstream.`);
      this.sendError(expressResponse, itemId, 404, error);
      return;
    }

    expressResponse.status(status);

    if (!this.responseHelper.okHeaders(remoteImageResponse.headers)) {
      const error = new Error(`Got bad headers from upstream.`);
      this.sendError(expressResponse, itemId, 404, error);
      return;
    }

    expressResponse.set(
      this.responseHelper.getHeadersFromTarget(remoteImageResponse.headers),
    );

    if (!this.responseHelper.okBody(remoteImageResponse.body)) {
      const error = new Error("Received no body from upstream.");
      this.sendError(expressResponse, itemId, 502, error);
      return;
    }

    await this.responseHelper.pipe(
      remoteImageResponse.body as ReadableStream,
      expressResponse,
    );
  }

  async serveItemFromS3(
    itemId: string,
    expressResponse: express.Response,
  ): Promise<void> {
    expressResponse.set(this.responseHelper.getCacheHeaders(LONG_CACHE_TIME));
    const s3url: string = await this.thumbnailStorage.getSignedS3Url(itemId);
    const response: Response =
      await this.responseHelper.getRemoteImagePromise(s3url);

    const status = this.responseHelper.translateStatusCode(response.status);
    this.responseHelper.okStatus(status);

    expressResponse.status(status);
    expressResponse.set(
      this.responseHelper.getHeadersFromTarget(response.headers),
    );
    if (this.responseHelper.okBody(response.body)) {
      await this.responseHelper.pipe(
        response.body as ReadableStream,
        expressResponse,
      );
    } else {
      const error = new Error("Response had no body.");
      this.sendError(expressResponse, itemId, 502, error);
    }
  }

  // item ids are always the same length and have hex characters in them
  // blow up if this isn't one
  getItemId(path: string): string | undefined {
    const matchResult = PATH_PATTERN.exec(path);
    if (matchResult) {
      return matchResult[1];
    } else {
      return undefined;
    }
  }

  sendError(
    res: express.Response,
    itemId: string,
    code: number,
    error?: Error,
  ): void {
    console.error("Sending %s for %s:", code, itemId, error);
    res.sendStatus(code);
    res.end();
  }
}
