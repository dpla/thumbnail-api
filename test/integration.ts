import test, { ExecutionContext } from "ava";
import { Paginator } from "@smithy/types";
import crypto from "crypto";
import { ThumbnailApi } from "../src/ThumbnailApi";
import { Client } from "@elastic/elasticsearch";
import {
  S3Client,
  paginateListObjectsV2,
  S3PaginationConfiguration,
  ListObjectsV2CommandInput,
  HeadObjectCommand,
  HeadObjectCommandOutput,
  ListObjectsV2CommandOutput,
  S3ClientConfig,
  HeadObjectCommandInput,
} from "@aws-sdk/client-s3";
import { SQSClient, SQSClientConfig } from "@aws-sdk/client-sqs";

const options = { region: "us-east-1" };
const s3: S3Client = new S3Client(options as S3ClientConfig);
const sqs: SQSClient = new SQSClient(options as SQSClientConfig);
const esClient: Client = new Client({
  node: process.env.ELASTIC_URL ?? "http://search.internal.dp.la:9200/",
  maxRetries: 5,
  requestTimeout: 60000,
  sniffOnStart: true,
});

const thumb = new ThumbnailApi("dpla-thumbnails", "", s3, sqs, esClient);

test("getRemoteImagePromise", async (t: ExecutionContext) => {
  const url =
    "https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png";
  const result: Response = await thumb.getRemoteImagePromise(url);
  t.is(result.status, 200, "Didn't receive image in body.");
});

test("lookupImageInS3", async (t: ExecutionContext) => {
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

  for await (const page of paginator ?? []) {
    for (const obj of page.Contents ?? []) {
      if (obj?.Key) {
        list.push(obj.Key);
      }
    }
  }

  const path: string = list[0];
  const key: string | undefined = /([a-f0-9]{32}).jpg$/.exec(path)?.[1];
  if (key === undefined) {
    throw new Error("Couldn't parse ");
  }
  //this will throw if it doesn't find one
  await thumb.lookupImageInS3(key);
  t.pass(); //this will fail if the promise rejects.
});

test("getS3Url", async (t: ExecutionContext) => {
  const id = "0000f6ee924d7b60bbfefbc670575653";
  const request: HeadObjectCommand = new HeadObjectCommand({
    Bucket: "dpla-thumbnails",
    Key: `${id[0]}/${id[1]}/${id[2]}/${id[3]}/${id}.jpg`,
  } as HeadObjectCommandInput);
  const result: HeadObjectCommandOutput = await s3.send(request);
  const origMD5: string | undefined = result.ETag?.replace(/"/g, "");
  if (origMD5 === undefined) {
    t.fail("Didn't get MD5 from S3");
  }
  const md5: crypto.Hash = crypto.createHash("md5");
  const s3url: string = await thumb.getS3Url(id);
  const response: Response = await fetch(s3url);
  const blob = await response.blob();
  const bytes = await blob.bytes();
  md5.update(bytes);
  t.is(md5.digest("hex"), origMD5);
});
