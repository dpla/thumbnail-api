import * as express from 'express';
import * as AWS from 'aws-sdk';
import {PromiseResult} from 'aws-sdk/lib/request';
import fetch from 'node-fetch';
import {Request, Response, Headers} from "node-fetch";
import {Client, ApiResponse} from '@elastic/elasticsearch';

const LONG_CACHE_TIME: number = 60 * 60 * 24 * 30; //seconds
const SHORT_CACHE_TIME: number = 60; //seconds
const IMAGE_REQUEST_TIMEOUT: number = 10000; //ms

const PATH_PATTERN: RegExp = /^\/thumb\/([a-f0-9]{32})$/;
const URL_PATTERN: RegExp = /^https?:\/\//;

export class Thumb {
    bucket: string;
    s3: AWS.S3;
    sqs: AWS.SQS;
    esClient: Client;

    constructor(bucket: string, s3: AWS.S3, sqs: AWS.SQS, esClient: Client) {
        this.bucket = bucket;
        this.s3 = s3;
        this.sqs = sqs;
        this.esClient= esClient
    }

    async handle(req: express.Request, res: express.Response): Promise<void> {
        const itemId = this.getItemId(req.path);

        if (!itemId) {
            this.sendError(res, itemId, 400, "Bad item ID.");
            return;
        }

        console.debug("Serving request for " + itemId);

        try {
            //ask S3 if it has a copy of the image
            const s3response = await this.lookupImageInS3(itemId);
            //success, get image from s3
            console.debug(`${itemId} found in S3.`);
            await this.serveItemFromS3(itemId, res);

        } catch (e) {
            //failure, proxy image from contributor, queue cache request
            console.debug(`Error from S3 for ${itemId}.`, e);

            //if we already started sending a response, we're doomed.
            if (res.writableEnded) {
                res.end();

            } else {
                try {
                    await this.proxyItemFromContributor(itemId, res);

                } catch (error) {
                    if (!res.headersSent) {
                        this.sendError(res, itemId, 502, error);
                    }

                }
            }
        }
    }

    sendError(res: express.Response, itemId: string, code: number, error?: any): void {
        console.info(`Sending ${code} for ${itemId}`, error);
        res.status(code);
        res.end();
    }

    async proxyItemFromContributor(itemId, expressResponse): Promise<void> {
        //we only want the cache to have the proxied image from the contributor for a short amount
        //because it won't have been sized down
        expressResponse.set(this.getCacheHeaders(SHORT_CACHE_TIME));

        let esResponse: ApiResponse = undefined;

        try {
            esResponse = await this.lookupItemInElasticsearch(itemId);

        } catch (error) {
            console.debug(`Caught error for ${itemId} from ElasticSearch.`, error);

            if (error?.statusCode == 404) {
                console.debug("Was 404.");
                this.sendError(expressResponse, itemId, 404);
                return Promise.reject();

            } else {
                // couldn't connect or something
                this.sendError(expressResponse, itemId, 502, error);
                return Promise.reject();
            }
        }

        const imageUrl: string = await this.getImageUrlFromSearchResult(esResponse?.body);

        //don't wait on this, it's a side effect to make the image be in S3 next time
        this.queueToThumbnailCache(itemId, imageUrl)
            .then(() => {
                console.log(`${itemId} queued for thumbnail processing.`)
            })
            .catch((error) => {
                console.log("SQS error: ", error)
            });

        try {
            const remoteImageResponse: Response = await this.getRemoteImagePromise(imageUrl);
            expressResponse.status(this.getImageStatusCode(remoteImageResponse.status));
            expressResponse.set(this.getHeadersFromTarget(remoteImageResponse.headers));
            console.debug("Piping response.");
            remoteImageResponse.body.pipe(expressResponse, {end: true});

        } catch (error) {
            this.sendError(expressResponse,  itemId, this.getImageStatusCode(error.statusCode), error);
        }
    }

    async serveItemFromS3(itemId, expressResponse): Promise<void> {
        expressResponse.set(this.getCacheHeaders(LONG_CACHE_TIME));
        const s3url = await this.getS3Url(itemId);
        const response: Response = await this.getRemoteImagePromise(s3url);
        expressResponse.status(this.getImageStatusCode(response.status));
        expressResponse.set(this.getHeadersFromTarget(response.headers));
        console.debug("Piping response.");
        response.body.pipe(expressResponse, {end: true});
    }

//performs a head request against s3. it either works and we grab the data out from s3, or it fails and
//we get it from the contributor.
    async lookupImageInS3(id: string): Promise<PromiseResult<AWS.S3.Types.HeadObjectOutput, AWS.AWSError>> {
        console.debug("IN: lookupImageInS3 ", id);
        const params = {Bucket: this.bucket, Key: this.getS3Key(id)};
        return this.s3.headObject(params).promise();
    }

//todo: should we be doing a GET instead of a HEAD and piping out the data instead of using a signed URL?
    async getS3Url(id: string): Promise<string> {
        console.debug("IN: getS3Url ", id);
        const params = {Bucket: this.bucket, Key: this.getS3Key(id)};
        return this.s3.getSignedUrlPromise("getObject", params);
    }

    async queueToThumbnailCache(id: string, url: string): Promise<void> {
        console.debug("IN: queueToThumbnailCache", id, url);
        if (!process.env.SQS_URL) return;
        const msg = JSON.stringify({id: id, url: url});
        await this.sqs.sendMessage({MessageBody: msg, QueueUrl: process.env.SQS_URL}).promise();
    }

    async lookupItemInElasticsearch(id: string): Promise<ApiResponse> {
        console.debug("IN: lookupItemInElasticsearch", id);
        return this.esClient.get({
            id: id,
            index: "dpla_alias",
            _source: ["id", "object"]
        });
    }

    async getImageUrlFromSearchResult(record: Record<string, any>): Promise<string> {
        console.debug("IN: getImageUrlFromSearchResult");

        //using ?. operator short circuits the result in object to "undefined"
        //rather than throwing an exception when the property doesn't exist
        const obj: any = record?._source?.object;

        let url: string = "";

        if (obj && Array.isArray(obj)) {
            url = obj[0];

        } else if (obj && typeof obj == "string") {
            url = obj;

        } else {
            return Promise.reject("Couldn't find image URL in record.");
        }

        if (!this.isProbablyURL(url)) {
            return Promise.reject("URL was malformed.");

        } else {
            return Promise.resolve(url);
        }
    }

//wrapper promise + race that makes requests give up if they take too long
//in theory could be used for any promise, but we're using it for provider responses.
    async withTimeout(msecs: number, promise: Promise<any>) {
        console.debug("IN: withTimeout", msecs);
        const timeout = new Promise((resolve, reject) => {
            setTimeout(() => {
                reject(new Error('Response from server timed out.'));
            }, msecs);
        });
        return Promise.race([timeout, promise]);
    }

// -------------- non-async helper functions below --------------

//item ids are always the same length and have hex characters in them
//blow up if this isn't one
    getItemId(path: string): string | undefined {
        const matchResult = PATH_PATTERN.exec(path)
        if (matchResult) {
            return matchResult[1];
        } else {
            return undefined;
        }
    }

//the keys in the cache bucket in s3 have subfolders to keep it from being an enormous list
//the first 4 hex digits in the image id are used to create a path structure like /1/2/3/4
//weak argument validation here because it should have already been validated by getItemId.
    getS3Key(id: string): string {
        const prefix = id.substr(0, 4).split("").join("/");
        return prefix + "/" + id + ".jpg";
    }

    isProbablyURL(s: string): boolean {
        if (!s) return false;
        if (!URL_PATTERN.test(s)) return false;
        try {
            new URL(s);

        } catch (e) {
            //didn't parse
            return false;
        }
        return true;
    }

//tells upstream, including CloudFront, how long to keep the image around
//parameterized because we want provider errors to be cached for a shorter time
//whereas s3 responses should live there for a long time
//see LONG_CACHE_TIME and SHORT_CACHE_TIME, above
    getCacheHeaders(seconds: number): object {
        console.debug("IN: setCacheHeaders", seconds)
        const now = new Date().getTime();
        const expirationDateString = new Date(now + 1000 * seconds).toUTCString();
        const cacheControl = `public, max-age=${seconds}`;
        return {
            "Cache-Control": cacheControl,
            "Expires": expirationDateString
        };
    }

//issues async request for the image (could be s3 or provider)
    getRemoteImagePromise(imageUrl: string): Promise<Response|any> {
        console.debug("IN: getRemoteImagePromise", imageUrl);
        const request: Request = new Request(imageUrl);
        request.headers.append("User-Agent", "DPLA Image Proxy");
        return this.withTimeout(
            IMAGE_REQUEST_TIMEOUT,
            fetch(request, {redirect: "follow"})
        );
    }

//providers/s3 could set all sorts of weird headers, but we only want to pass along a few
    getHeadersFromTarget(headers: Headers): object {
        console.debug("IN: setHeadersFromTarget");

        const result = {};

        // Reduce headers to just those that we want to pass through
        const contentEncoding = "Content-Encoding";
        if (headers.has(contentEncoding)) {
            result[contentEncoding] = headers.get(contentEncoding);
        }

        const lastModified = "Last-Modified";
        if (headers.has(lastModified)) {
            result[lastModified] = headers.get(lastModified);
        }

        return result;
    }

// We have our own ideas of which response codes are appropriate for our client.
    getImageStatusCode(status: number): number {
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
}