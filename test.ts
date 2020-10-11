import test from 'ava';
import * as thumb from './src/thumb';
import * as express from 'express';
import * as crypto from 'crypto';
import * as aws from 'aws-sdk';
import {RequestHandler} from 'express-serve-static-core';
import {PromiseResult} from 'aws-sdk/lib/request';
import fetch from 'node-fetch';
import {Request, Response, Headers} from "node-fetch";


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
        t.assert(result === value, `Failed for ${key}`);
    });

});

test('getS3Key', t => {
    const testData: object = {
        "223ea5040640813b6c8204d1e0778d30": "2/2/3/e/223ea5040640813b6c8204d1e0778d30.jpg",
        "11111111111111111111111111111111": "1/1/1/1/11111111111111111111111111111111.jpg"
    };

    Object.entries(testData).forEach(([key, value]) => {
        const result = thumb.getS3Key(key);
        t.log(result);
        t.assert(result === value, `Failed for ${key}`);
    });
});

test('lookupImageInS3', t => {
    const s3 = new aws.S3();
    const request: aws.S3.ListObjectsRequest = {
        Bucket: "dpla-thumbnails",
    };
    s3.listObjects(request, (err, data) => {
        t.log(data);
    });
    t.assert(true); //todo finish
});

test('getS3Url', async (t) => {
    const md5 = crypto.createHash('md5');
    const s3url = await thumb.getS3Url("0000f6ee924d7b60bbfefbc670575653");
    const response = await fetch(s3url);
    const buffer = await response.buffer();
    md5.update(buffer);
    t.assert(md5.digest("hex") == 'df59792a760a13c04f31ee08fc3adbda');
});