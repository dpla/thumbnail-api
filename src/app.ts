import express from 'express';
import AWSXRay from 'aws-xray-sdk';
import * as AWS from "aws-sdk";
import {ThumbnailApi} from "./ThumbnailApi";
import {Client} from "@elastic/elasticsearch";
import cluster from "cluster";
import os from "os";
import https from "https";

function getAws(xray: boolean, app: express.Express) {
  if (xray) {
    console.log("Enabling AWS X-Ray");
    const XRayExpress = AWSXRay.express;
    app.use(XRayExpress.openSegment('thumbnail-api'));
    AWSXRay.config([AWSXRay.plugins.EC2Plugin, AWSXRay.plugins.ElasticBeanstalkPlugin]);
    AWSXRay.capturePromise();
    AWSXRay.captureHTTPsGlobal(https, true);
    return AWSXRay.captureAWS(AWS);

  } else {
    return AWS;
  }
}

const numCPUs = Number(process.env.PS_COUNT) || os.cpus().length;
const mustFork = process.env.MUST_FORK === "true" ||  process.env.NODE_ENV === "production";

if (cluster.isMaster && mustFork) {
  cluster
      .on("exit", (worker) => {
        console.log(`worker ${worker.process.pid} died`);
      })
      .on("online", worker => {
        console.log(`worker ${worker.process.pid} online`);
      });
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
} else {

  const port = process.env.PORT || 3000;
  const awsOptions = {region: process.env.REGION || "us-east-1"};
  const bucket = process.env.BUCKET || "dpla-thumbnails";
  const xray: boolean = process.env.XRAY === "true";
  const elasticsearch = process.env.ELASTIC_URL || "http://search.internal.dp.la:9200/";

  const app = express();
  const aws = getAws(xray, app);
  const s3: AWS.S3 = new aws.S3(awsOptions);
  const sqs: AWS.SQS = new aws.SQS(awsOptions);

  const esClient: Client = new Client({
    node: elasticsearch,
    maxRetries: 5,
    requestTimeout: 60000,
    sniffOnStart: true
  });

  const thumbnailapi: ThumbnailApi = new ThumbnailApi(bucket, s3, sqs, esClient);

  app.get('/thumb/*', (req, res) => thumbnailapi.handle(req, res));
  app.get('/health', ((req, res) => res.sendStatus(200)))

  if (xray) {
    const XRayExpress = AWSXRay.express;
    app.use(XRayExpress.closeSegment());
  }

  app.listen(port, () => {
    console.log(`Server is listening on ${port}`);
  });
}