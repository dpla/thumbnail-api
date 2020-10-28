import express from 'express';
import { exit } from 'process';

import AWSXRay from 'aws-xray-sdk';
import https from "https";
import http from "http";
import * as AWS from "aws-sdk";
import {Thumb} from "./thumb";
import {Client} from "@elastic/elasticsearch";

const port = 3000;
const awsOptions = { region: "us-east-1"};
const bucket = "dpla-thumbnails";


const XRayExpress = AWSXRay.express;
const segment = XRayExpress.openSegment('thumbq')
const app = express();
app.use(segment);

AWSXRay.config([AWSXRay.plugins.EC2Plugin,AWSXRay.plugins.ElasticBeanstalkPlugin]);
AWSXRay.captureHTTPsGlobal(https, false);
AWSXRay.captureHTTPsGlobal(http, false);

const aws = AWSXRay.captureAWS(AWS);
const s3: AWS.S3 = new aws.S3(awsOptions);
const sqs: AWS.SQS = new aws.SQS(awsOptions);

const esClient: Client = new Client({
  node: process.env.ELASTIC_URL || "http://search.internal.dp.la:9200/",
  maxRetries: 5,
  requestTimeout: 60000,
  sniffOnStart: true
});

const thumb: Thumb = new Thumb(bucket, s3, sqs, esClient);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.get('/thumb/*', (req, res) => thumb.handle(req, res));

app.use(XRayExpress.closeSegment());

app.listen(port, () => {
  console.log(`Server is listening on ${port}`);
});
