import test from 'ava';
import * as thumb from './src/thumb';
import * as express from 'express';
import * as crypto from 'crypto';
import * as aws from 'aws-sdk';
import {RequestHandler} from 'express-serve-static-core';
import {PromiseResult} from 'aws-sdk/lib/request';
import fetch from 'node-fetch';
import {Request, Response, Headers} from "node-fetch";
import { assert } from 'console';


test('getItemId', t => {
    const testData: object = {
        "/thumb/223ea5040640813b6c8204d1e0778d30": "223ea5040640813b6c8204d1e0778d30",
        "/thumb/11111111111111111111111111111111": "11111111111111111111111111111111",
        "/thumb//11111111111111111111111111111111": undefined,
        "/thumb/111111111111111111111111111111111/": undefined,
        "/thumb/oneoneoneoneoneoneoneoneoneoneon": undefined,
        "223ea5040640813b6c8204d1e0778d30": undefined,
        "/thumb": undefined,
        "/thumb/": undefined,
        "/thumb/1234": undefined
    };

    Object.entries(testData).forEach(([key, value]) => {
        const result = thumb.getItemId(key);
        t.is(result, value, `Failed for ${key}`);
    });

});

test('getS3Key', t => {
    const testData: object = {
        "223ea5040640813b6c8204d1e0778d30": "2/2/3/e/223ea5040640813b6c8204d1e0778d30.jpg",
        "11111111111111111111111111111111": "1/1/1/1/11111111111111111111111111111111.jpg"
    };

    Object.entries(testData).forEach(([key, value]) => {
        const result = thumb.getS3Key(key);
        t.is(result, value, `Failed for ${key}`);
    });
});

test('lookupImageInS3', async t => {
    const s3 = new aws.S3();
    const request: aws.S3.ListObjectsRequest = {
        Bucket: "dpla-thumbnails",
    };
    const list = await s3.listObjects(request).promise()
    const path = list.Contents[0].Key;
    const key = /([a-f0-9]{32}).jpg$/.exec(path)[1];
    //this will throw if it doesn't find one
    const result = await thumb.lookupImageInS3(key);
    t.pass(); 
});

test('getS3Url', async (t) => {
    const md5 = crypto.createHash('md5');
    const s3url = await thumb.getS3Url("0000f6ee924d7b60bbfefbc670575653");
    const response = await fetch(s3url);
    const buffer = await response.buffer();
    md5.update(buffer);
    t.is(md5.digest("hex"), 'df59792a760a13c04f31ee08fc3adbda');
});

test('queueToThumbnailCache', async (t) => {
    t.pass();
});

test('lookupItemInElasticsearch', async (t) => {
    t.pass();
});

test('getImageUrlFromSearchResult', async (t) => {
    t.pass();
});

test('isProbablyURL', async (t) => {
    t.pass();
});

test('getCacheHeaders', async (t) => {
    const result = thumb.getCacheHeaders(2);
    t.is(result['Cache-Control'], `public, max-age=2`);
    t.regex(result['Expires'], /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun),\W\d{2}\W(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\W\d{4}\W\d{2}:\d{2}:\d{2}\WGMT$/);
    t.pass();
});

test('withTimeout', async (t) => {
    t.pass();
});

test('getRemoteImagePromise', async (t) => {
    t.pass();
});

test('setHeadersFromTarget', async (t) => {
    const headers = new Headers();
    headers.append("foo", "foo");
    headers.append("bar", "bar");
    headers.append("Content-Encoding", "text/plain");
    headers.append("Last-Modified", "Wed, 21 Oct 2015 07:28:00 GMT");    
    const responseHeaders = thumb.getHeadersFromTarget(headers);
    ["Content-Encoding", "Last-Modified"].forEach(key => {
        t.is(responseHeaders[key], headers.get(key));
    })
    t.falsy(responseHeaders["foo"]);
    t.falsy(responseHeaders["bar"]);
});

test('getImageStatusCode', async (t) => {
    const data = {
        200: 200,
        404: 404,
        410: 404,
        5: 502,
        100: 502,
        555: 502
    }

    Object.entries(data).forEach(([value, expected]) => {
        t.is(thumb.getImageStatusCode(Number(value)), expected)
    });
});

