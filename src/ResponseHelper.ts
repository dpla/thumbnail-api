import { Readable } from "stream";
import express from "express";

export class ResponseHelper {
  FETCH_TIMEOUT = 10 * 1000; // 10 seconds;

  pipe(body: ReadableStream, expressResponse: express.Response): Promise<void> {
    Readable.from(body).pipe(expressResponse, { end: true });
    return Promise.resolve();
  }

  //issues async request for the image (could be s3 or provider)
  async getRemoteImagePromise(imageUrl: string): Promise<Response> {
    const request: Request = new Request(imageUrl);
    request.headers.append("User-Agent", "DPLA Image Proxy");
    const response = await fetch(request, {
      redirect: "follow",
      signal: AbortSignal.timeout(this.FETCH_TIMEOUT),
    });
    if (response.ok) {
      return response;
    } else {
      throw new Error(
        `Failed to read remote image status: ${String(response.status)} ${response.statusText}`,
      );
    }
  }

  //providers/s3 could set all sorts of weird headers, but we only want to pass along a few
  getHeadersFromTarget(headers: Headers): Map<string, string> {
    const result = new Map<string, string>();

    const addHeader = (
      result: Map<string, string>,
      headers: Headers,
      header: string,
    ) => {
      const value = headers.get(header);
      if (value) {
        result.set(header, value);
      }
    };

    // Reduce headers to just those that we want to pass through
    addHeader(result, headers, "Content-Type");
    addHeader(result, headers, "Last-Modified");

    return result;
  }

  // We have our own ideas of which response codes are appropriate for our client.
  translateStatusCode(status: number): number {
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

  okBody(body: ReadableStream | null): boolean {
    return body != null;
  }

  okStatus(status: number): boolean {
    return status < 400;
  }

  okHeaders(headers: Headers): boolean {
    const contentType = headers.get("Content-Type");
    return (
      contentType != null &&
      (contentType.startsWith("image") || contentType.endsWith("octet-stream"))
    );
  }

  // tells upstream, including CloudFront, how long to keep the image around
  // parameterized because we want provider errors to be cached for a shorter time
  // whereas s3 responses should live there for a long time
  // see LONG_CACHE_TIME and SHORT_CACHE_TIME, above
  getCacheHeaders(seconds: number): Map<string, string> {
    const now = new Date().getTime();
    const expirationDateString = new Date(now + 1000 * seconds).toUTCString();
    const cacheControl = `public, max-age=${String(seconds)}`;
    return new Map([
      ["Cache-Control", cacheControl],
      ["Expires", expirationDateString],
    ]);
  }
}
