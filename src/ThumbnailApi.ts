import * as express from "express";
import { Client, ApiResponse } from "@elastic/elasticsearch";
import {
  GetObjectCommand,
  GetObjectCommandInput,
  HeadObjectCommand,
  HeadObjectCommandInput,
  HeadObjectCommandOutput,
  NotFound,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  SendMessageCommand,
  SendMessageCommandInput,
  SendMessageResult,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { Readable } from "stream";

const LONG_CACHE_TIME: number = 60 * 60 * 24 * 30; // 30 days in seconds
const SHORT_CACHE_TIME = 60 * 60; // 1 hr in seconds
const FETCH_TIMEOUT = 10 * 1000; // 10 seconds;

const PATH_PATTERN = /^\/thumb\/([a-f0-9]{32})$/;
const URL_PATTERN = /^https?:\/\//;

export class ThumbnailApi {
  bucket: string;
  sqsURL: string;
  s3Client: S3Client;
  sqsClient: SQSClient;
  esClient: Client;

  constructor(
    bucket: string,
    sqsURL: string,
    s3Client: S3Client,
    sqsClient: SQSClient,
    esClient: Client,
  ) {
    this.bucket = bucket;
    this.sqsURL = sqsURL;
    this.s3Client = s3Client;
    this.sqsClient = sqsClient;
    this.esClient = esClient;
  }

  async handle(req: express.Request, res: express.Response) {
    const itemId: string | undefined = getItemId(req.path);

    if (!itemId) {
      const error = new Error("Bad item ID.");
      sendError(res, "id not found", 400, error);
      return;
    }

    let foundInS3 = false;

    try {
      //ask S3 if it has a copy of the image
      const result = await this.lookupImageInS3(itemId);
      if (result) {
        foundInS3 = true;
      }
    } catch (e) {
      if (!(e instanceof NotFound)) {
        const error = new Error("S3 communications failure.", { cause: e });
        sendError(res, itemId, 502, error);
        return;
      }
      // If it was a NotFund, will fall through and foundInS3 still === false
    }

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
    // we only want the cache to have the proxied image from the contributor
    // for a short amount because it won't have been sized down
    expressResponse.set(getCacheHeaders(SHORT_CACHE_TIME));
    const esResponse: ApiResponse =
      await this.lookupItemInElasticsearch(itemId);

    if (esResponse.statusCode === 404) {
      const error = new Error("Not found in search index.");
      sendError(expressResponse, itemId, 404, error);
      return;
    } else if (esResponse.statusCode === null || esResponse.statusCode > 399) {
      const error = new Error("Caught error from ElasticSearch.");
      sendError(expressResponse, itemId, 502, error);
      return;
    }

    const imageUrl: string | undefined = getImageUrlFromSearchResult(
      esResponse?.body as DplaMap,
    );

    if (imageUrl === undefined) {
      const error = new Error("No image url found.");
      sendError(expressResponse, itemId, 404, error);
      return;
    }

    // Don't await on this, it's a side effect to make the image be in S3
    // next time, technically not the end of the world if this fails.
    this.queueToThumbnailCache(itemId, imageUrl).catch((error: unknown) => {
      console.error("SQS error for %s", itemId, error);
    });

    let remoteImageResponse: Response | undefined = undefined;

    try {
      remoteImageResponse = await this.getRemoteImagePromise(imageUrl);
    } catch (e) {
      const error = new Error(`Couldn't connect to upstream ${imageUrl}`, {
        cause: e,
      });
      sendError(expressResponse, itemId, 404, error);
      return;
    }

    const status: number = translateStatusCode(remoteImageResponse.status);

    if (status > 399) {
      const error = new Error(`Status ${status} from upstream.`);
      sendError(expressResponse, itemId, 404, error);
      return;
    }

    const headers: Map<string, string> = getHeadersFromTarget(
      remoteImageResponse.headers,
    );

    const contentType = headers.get("Content-Type");
    if (
      contentType === undefined ||
      (!contentType.startsWith("image") &&
        !contentType.endsWith("octet-stream"))
    ) {
      const error = new Error(
        `Got bad content type ${contentType} from upstream.`,
      );
      sendError(expressResponse, itemId, 404, error);
      return;
    }

    expressResponse.status(status);
    expressResponse.set(headers);

    const body = remoteImageResponse.body;
    if (body === null) {
      const error = new Error("Received no body from upstream.");
      sendError(expressResponse, itemId, 502, error);
      return;
    }

    Readable.from(body).pipe(expressResponse, { end: true });
  }

  //bookmark
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
      return;
    } else {
      const error = new Error("Response had no body.");
      sendError(expressResponse, itemId, 502, error);
      return;
    }
  }

  // performs a head request against s3. it either works, and we grab the data
  // out from s3, or it fails, and we get it from the contributor.
  lookupImageInS3(id: string): Promise<HeadObjectCommandOutput> {
    const params: HeadObjectCommandInput = {
      Bucket: this.bucket,
      Key: getS3Key(id),
    };
    const commandInput: HeadObjectCommand = new HeadObjectCommand(params);
    return this.s3Client.send(commandInput);
  }

  getS3Url(id: string): Promise<string> {
    const params: GetObjectCommandInput = {
      Bucket: this.bucket,
      Key: getS3Key(id),
    };
    const request: GetObjectCommand = new GetObjectCommand(params);
    return getSignedUrl(this.s3Client, request);
  }

  queueToThumbnailCache(id: string, url: string): Promise<SendMessageResult> {
    const msg = JSON.stringify({ id: id, url: url });
    const params = {
      MessageBody: msg,
      QueueUrl: this.sqsURL,
    } as SendMessageCommandInput;
    const request: SendMessageCommand = new SendMessageCommand(params);
    return this.sqsClient.send(request);
  }

  lookupItemInElasticsearch(id: string): Promise<ApiResponse> {
    return this.esClient.get({
      id: id,
      index: "dpla_alias",
      _source: ["id", "object"],
    });
  }

  //issues async request for the image (could be s3 or provider)
  async getRemoteImagePromise(imageUrl: string): Promise<Response> {
    const request: Request = new Request(imageUrl);
    request.headers.append("User-Agent", "DPLA Image Proxy");
    const response = await fetch(request, {
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (response.ok) {
      return response;
    } else {
      throw new Error(
        `Failed to read remote image status: ${response.status} ${response.statusText}`,
      );
    }
  }
}

// thumbnail urls are unpredictably specified given the long history of
// mapping technology at DPLA.
export function getImageUrlFromSearchResult(
  record: DplaMap,
): string | undefined {
  //using ?. operator short circuits the result in object to "undefined"
  //rather than throwing an exception when the property doesn't exist
  const obj: string | string[] | undefined = record._source?.object;

  let url = undefined;

  if (obj === undefined) {
    return undefined;
  } else if (obj && Array.isArray(obj) && obj.length > 0) {
    url = obj[0];
  } else if (obj && typeof obj === "string") {
    url = obj;
  } else {
    return undefined;
  }

  return isProbablyURL(url) ? url : undefined;
}

// item ids are always the same length and have hex characters in them
// blow up if this isn't one
export function getItemId(path: string): string | undefined {
  const matchResult = PATH_PATTERN.exec(path);
  if (matchResult) {
    return matchResult[1];
  } else {
    return undefined;
  }
}

// The keys in the cache bucket in s3 have subfolders to keep it from being an
// enormous list the first 4 hex digits in the image id are used to create a
// path structure like /1/2/3/4 weak argument validation here because it should
// have already been validated by getItemId.
export function getS3Key(id: string): string {
  const prefix = id.substring(0, 4).split("").join("/");
  return prefix + "/" + id + ".jpg";
}

export function isProbablyURL(s: string): boolean {
  if (!s) return false;
  if (!URL_PATTERN.test(s)) return false;
  try {
    new URL(s);
  } catch {
    //didn't parse
    return false;
  }
  return true;
}

// tells upstream, including CloudFront, how long to keep the image around
// parameterized because we want provider errors to be cached for a shorter time
// whereas s3 responses should live there for a long time
// see LONG_CACHE_TIME and SHORT_CACHE_TIME, above
export function getCacheHeaders(seconds: number): Map<string, string> {
  const now = new Date().getTime();
  const expirationDateString = new Date(now + 1000 * seconds).toUTCString();
  const cacheControl = `public, max-age=${seconds}`;
  return new Map([
    ["Cache-Control", cacheControl],
    ["Expires", expirationDateString],
  ]);
}

//providers/s3 could set all sorts of weird headers, but we only want to pass along a few
export function getHeadersFromTarget(headers: Headers): Map<string, string> {
  const result = new Map<string, string>();

  const addHeader = (
    result: Map<string, string>,
    headers: Headers,
    header: string,
  ) => {
    if (headers.has(header)) {
      result.set(header, headers.get(header)!);
    }
  };

  // Reduce headers to just those that we want to pass through
  addHeader(result, headers, "Content-Type");
  addHeader(result, headers, "Last-Modified");

  return result;
}

// We have our own ideas of which response codes are appropriate for our client.
export function translateStatusCode(status: number): number {
  switch (status) {
    case 200:
      return 200;
    case 404:
    case 410:
      // We treat a 410 as a 404, because our provider could correct
      // the `object' property in the item's metadata, meaning the
      // resource doesn't have to be "410 Gone".
      return 404;
    default:
      // Other kinds of errors are just considered "bad gateway" errors
      // because we don't want to own them.
      return 502;
  }
}

export function sendError(
  res: express.Response,
  itemId: string,
  code: number,
  error?: Error,
): void {
  console.error("Sending %s for %s:", code, itemId, error);
  res.sendStatus(code);
  res.end();
}

interface UnderBarSource {
  object?: string | string[];
}

interface DplaMap {
  ["_source"]?: UnderBarSource;
}
