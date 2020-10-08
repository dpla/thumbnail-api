import * as express from 'express';
import * as aws from 'aws-sdk';
import {RequestHandler} from 'express-serve-static-core';
import {PromiseResult} from 'aws-sdk/lib/request';
import fetch from 'node-fetch';
import {Request, Response, Headers} from "node-fetch";

const LONG_CACHE_TIME: number = 60 * 60 * 24 * 30; //seconds
const SHORT_CACHE_TIME: number = 60; //seconds
const IMAGE_REQUEST_TIMEOUT: number = 10000; //ms
const CACHE_BUCKET: string = "dpla-thumbnails";
const PATH_PATTERN: RegExp = /^\/thumb\/([a-f0-9]{32})$/;
const DEFAULT_SEARCH_INDEX: string = "http://search.internal.dp.la:9200/dpla_alias";

const s3: aws.S3 = new aws.S3();
const sqs: aws.SQS = new aws.SQS({region: "us-east-1"});

const thumb: RequestHandler = async function (req: express.Request, res: express.Response) {

    const itemId = getItemId(req.path);

    if (!itemId) {
        res.sendStatus(400);
        res.end();
        return;
    }

    console.debug("Serving request for " + itemId);

    //todo wire in some catches

    Promise
        //kicking off the promise chain with one that always works
        .resolve(itemId)
        //ask S3 if it has a copy of the image
        .then((itemId: string) => lookupImageInS3(itemId))
        //process the response from s3
        .then(
            //success, get image from s3
            (response) => {
                setCacheHeaders(LONG_CACHE_TIME, res);
                return getS3Url(itemId)
            },
            //failure, proxy image from contributor, queue cache request
            (err: string) => {
                setCacheHeaders(SHORT_CACHE_TIME, res);
                return lookupItemInElasticsearch(itemId)
                    .then((response: Response) => response.json())
                    .then((result) => getImageUrlFromSearchResult(result))
                    .then((imageUrl) => {
                        queueToThumbnailCache(itemId, imageUrl);
                        return Promise.resolve(imageUrl)
                    })
            })
        //now we know where we're loading the image from.
        //initiate the connection to the remote server
        .then((url: string) => getRemoteImagePromise(url))
        //when it responds, pass the request info and image data along.
        .then((response: Response) => {
            res.status(getImageStatusCode(response));
            setHeadersFromTarget(response.headers, res)
            console.debug("Piping response.")
            response.body.pipe(res, {end: true});
            return;
        })
        .catch((reason) => {
            //overall runtime error catchall
            console.error(`Request for ${itemId} landed in top-level catch for ${reason}`);
            res.status(502);
            res.end();
            return;
        });
}

//item ids are always the same length and have hex characters in them
//blow up if this isn't one
function getItemId(path: string): string | undefined {
    const matchResult = PATH_PATTERN.exec(path)
    if (matchResult) {
        return matchResult[1];
    } else {
        return undefined;
    }
}

//the keys in the cache bucket in s3 have subfolders to keep it from being an enormous list
//the first 4 hex digits in the image id are used to create a path structure like /1/2/3/4
function getS3Key(id: string): string {
    const prefix = id.substr(0, 4).split("").join("/");
    return prefix + "/" + id + ".jpg";
}

//performs a head request against s3. it either works and we grab the data out from s3, or it fails and
//we get it from the contributor.
function lookupImageInS3(id: string): Promise<PromiseResult<aws.S3.Types.HeadObjectOutput, aws.AWSError>> {
    console.debug("IN: lookupImageInS3 ", id);
    const params = {Bucket: CACHE_BUCKET, Key: getS3Key(id)};
    return s3.headObject(params).promise();
}

//todo: should we be doing a GET instead of a HEAD and piping out the data instead of using a signed URL?
function getS3Url(id: string): Promise<string> {
    console.debug("IN: getS3Url ", id);
    const params = {Bucket: CACHE_BUCKET, Key: getS3Key(id)};
    return s3.getSignedUrlPromise("getObject", params);
}

function queueToThumbnailCache(id: string, url: string): void {
    console.debug("IN: queueToThumbnailCache", id, url);
    if (!process.env.SQS_URL) return;

    const msg = {id: id, url: url};

    sqs.sendMessage(
        {
            MessageBody: JSON.stringify(msg),
            QueueUrl: `${process.env.SQS_URL}/thumbp-image`
        },
        (error: aws.AWSError, data: aws.SQS.SendMessageResult): void => {
            if (error) {
                console.log("SQS error: ", error, data);
            }
        }
    );
}

function lookupItemInElasticsearch(id: string): Promise<Response> {
    console.debug("IN: lookupItemInElasticsearch", id);
    const elasticServer = process.env.ELASTIC_URL || DEFAULT_SEARCH_INDEX;
    const elasticUrl = `${elasticServer}/item/_search?q=id:${id}&_source=id,object`; //
    return fetch(new Request(elasticUrl));
}

function getImageUrlFromSearchResult(json: Object): Promise<string> {
    console.debug("IN: getImageUrlFromSearchResult");

    if (!json.hasOwnProperty("hits")) {
        return Promise.reject("Bad response from ElasticSearch.");
    }

    if (json["hits"]["total"] == 0) {
        return Promise.reject("No results found.");
    }

    //using ?. operator short circuts the result in object to "undefined"
    //rather than throwing an exception when the property doesn't exist

    const obj: any = json?.["hits"]?.hits?.[0]?._source?.object;
    let url: string = "";

    if (obj && Array.isArray(obj)) {
        url = obj[0];

    } else if (obj && typeof obj == "string") {
        url = obj;

    } else {
        return Promise.reject("Couldn't find image URL in record.");
    }

    if (!isProbablyURL(url)) {
        return Promise.reject("URL was malformed.");

    } else {
        return Promise.resolve(url);
    }
}

function isProbablyURL(s: string): boolean {
    return s && s.match(/^https?:\/\//) != null;
}

//tells upstream, including CloudFront, how long to keep the image around
//parameterized because we want provider errors to be cached for a shorter time
//whereas s3 responses should live there for a long time
//see LONG_CACHE_TIME and SHORT_CACHE_TIME, above
function setCacheHeaders(seconds: number, response: express.Response): void {
    console.debug("IN: setCacheHeaders", seconds)
    const now = new Date().getTime();
    const expirationDateString = new Date(now + 1000 * seconds).toUTCString();
    response.setHeader("Cache-Control", `public, max-age=${seconds}`);
    response.setHeader("Expires", expirationDateString);
}

//wrapper promise + race that makes requests give up if they take too long
//in theory could be used for any promise, but we're using it for provider responses.
function withTimeout(msecs: number, promise: Promise<any>) {
    console.debug("IN: withTimeout", msecs);
    const timeout = new Promise((resolve, reject) => {
        setTimeout(() => {
            reject(new Error('Response from server timed out.'));
        }, msecs);
    });
    return Promise.race([timeout, promise]);
}

//issues async request for the image (could be s3 or provider)
function getRemoteImagePromise(imageUrl: string): Promise<Response> {
    console.debug("IN: getRemoteImagePromise", imageUrl);
    const request: Request = new Request(imageUrl);
    request.headers.append("User-Agent", "DPLA Image Proxy");
    return withTimeout(
        IMAGE_REQUEST_TIMEOUT,
        fetch(request, {redirect: "follow"})
    );
}

//providers/s3 could set all sorts of weird headers, but we only want to pass along a few
function setHeadersFromTarget(headers: Headers, response: express.Response) {
    console.debug("IN: setHeadersFromTarget");
    // Reduce headers to just those that we want to pass through
    const headerKeys: string[] = ["content-length", "content-type", "last-modified", "date"];
    headers.forEach((value: string, name) => {
        if (headerKeys.indexOf(name.toLowerCase()) != -1) {
            response.setHeader(name, value);
        }
    });
}

// We have our own ideas of which response codes are appropriate for our client.
function getImageStatusCode(imgResponse: Response): number {
    switch (imgResponse.status) {
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

export default thumb;