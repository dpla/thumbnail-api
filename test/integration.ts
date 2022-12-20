import test from "ava";
import * as aws from "aws-sdk";
import crypto from "crypto";
import fetch from "node-fetch";
import {ThumbnailApi} from "../src/ThumbnailApi";
import {Client} from "@elastic/elasticsearch";

const options = { region: "us-east-1" };
const s3 = new aws.S3(options);
const sqs = new aws.SQS(options);
const esClient: Client = new Client({
    node: process.env.ELASTIC_URL || "http://search.internal.dp.la:9200/",
    maxRetries: 5,
    requestTimeout: 60000,
    sniffOnStart: true
});

const thumb = new ThumbnailApi("dpla-thumbnails", s3, sqs, esClient);

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
    const request: aws.S3.ListObjectsRequest = {
        Bucket: "dpla-thumbnails",
    };
    const list = await s3.listObjects(request).promise();
    const path = list.Contents[0].Key;
    const key = /([a-f0-9]{32}).jpg$/.exec(path)[1];
    //this will throw if it doesn't find one
    await thumb.lookupImageInS3(key);
    t.pass(); //this will fail if the promise rejects.
});

test('getS3Url', async (t) => {
    const id = "0000f6ee924d7b60bbfefbc670575653";
    const result = await s3.headObject({Bucket: "dpla-thumbnails", Key: thumb.getS3Key(id)}).promise();
    const origMD5 = result.ETag?.replace(/"/g, '');
    const md5 = crypto.createHash('md5');
    const s3url = await thumb.getS3Url(id);
    const response = await fetch(s3url);
    const buffer = await response.buffer();
    md5.write(buffer);
    t.is(md5.digest("hex"), origMD5);
});

test('getRemoteImagePromise', async (t) => {
    const url = "https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png";
    const result = await thumb.getRemoteImagePromise(url);
    t.is(result.status, 200, "Didn't receive image in body.");
});
