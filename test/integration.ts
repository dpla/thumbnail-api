import test from "ava";
import { Paginator } from "@smithy/types";
import crypto from "crypto";
import { ThumbnailApi } from "../src/ThumbnailApi";
import { Client } from "@elastic/elasticsearch";
import {
  S3Client,
  paginateListObjectsV2,
  S3PaginationConfiguration,
  ListObjectsV2CommandInput,
  _Object,
  HeadObjectCommand,
  HeadObjectCommandOutput,
  ListObjectsV2CommandOutput,
} from "@aws-sdk/client-s3";
import { SQSClient } from "@aws-sdk/client-sqs";

const options = { region: "us-east-1" };
const s3: S3Client = new S3Client(options);
const sqs: SQSClient = new SQSClient(options);
const esClient: Client = new Client({
  node: process.env.ELASTIC_URL || "http://search.internal.dp.la:9200/",
  maxRetries: 5,
  requestTimeout: 60000,
  sniffOnStart: true,
});

const thumb = new ThumbnailApi("dpla-thumbnails", s3, sqs, esClient);

test("getS3Key", (t) => {
  const testData: object = {
    "223ea5040640813b6c8204d1e0778d30":
      "2/2/3/e/223ea5040640813b6c8204d1e0778d30.jpg",
    "11111111111111111111111111111111":
      "1/1/1/1/11111111111111111111111111111111.jpg",
  };

  Object.entries(testData).forEach(([key, value]) => {
    const result: string = thumb.getS3Key(key);
    t.is(result, value, `Failed for ${key}`);
  });
});

test("lookupImageInS3", async (t) => {
  const config: S3PaginationConfiguration = {
    client: s3,
    pageSize: 1000,
  };
  const request: ListObjectsV2CommandInput = {
    Bucket: "dpla-thumbnails",
    Prefix: "0/0/0/0/",
  };
  const paginator: Paginator<ListObjectsV2CommandOutput> =
    paginateListObjectsV2(config, request);
  const list: string[] = [];
  for await (const page of paginator) {
    const keys: string[] = page.Contents.map((o: _Object): string => o.Key);
    list.push(...keys);
  }
  const path: string = list[0];
  const key: string = /([a-f0-9]{32}).jpg$/.exec(path)[1];
  //this will throw if it doesn't find one
  await thumb.lookupImageInS3(key);
  t.pass(); //this will fail if the promise rejects.
});

test("getS3Url", async (t) => {
  const id = "0000f6ee924d7b60bbfefbc670575653";
  const request = new HeadObjectCommand({
    Bucket: "dpla-thumbnails",
    Key: `${id[0]}/${id[1]}/${id[2]}/${id[3]}/${id}.jpg`,
  });
  const result: HeadObjectCommandOutput = await s3.send(request);
  const origMD5: string = result.ETag?.replace(/"/g, "");
  const md5: crypto.Hash = crypto.createHash("md5");
  const s3url: string = await thumb.getS3Url(id);
  const response: Response = await fetch(s3url);
  const data: Uint8Array<ArrayBufferLike> = await response.bytes();
  md5.write(data);
  t.is(md5.digest("hex"), origMD5);
});

test("getRemoteImagePromise", async (t) => {
  const url =
    "https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png";
  const result: Response = await thumb.getRemoteImagePromise(url);
  t.is(result.status, 200, "Didn't receive image in body.");
});
