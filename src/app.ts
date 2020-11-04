import express from 'express';
import AWSXRay from 'aws-xray-sdk';
import * as AWS from "aws-sdk";
import {Thumb} from "./thumb";
import {Client} from "@elastic/elasticsearch";

const port = process.env.PORT || 3000;
const awsOptions = { region: process.env.REGION || "us-east-1"};
const bucket = process.env.BUCKET || "dpla-thumbnails";
const xray = process.env.XRAY;
const elasticsearch = process.env.ELASTIC_URL || "http://search.internal.dp.la:9200/";

const app = express();

function getAws() {
  if (xray) {
    console.log("Enabling AWS X-Ray");
    const XRayExpress = AWSXRay.express;
    const segment = XRayExpress.openSegment('thumbq')
    app.use(segment);
    AWSXRay.capturePromise();
    AWSXRay.config([AWSXRay.plugins.EC2Plugin, AWSXRay.plugins.ElasticBeanstalkPlugin]);
    AWSXRay.captureHTTPsGlobal(require('https'), false);
    AWSXRay.captureHTTPsGlobal(require('http'), false);
    return AWSXRay.captureAWS(AWS);

  } else {
    return AWS;
  }
}

const aws = getAws();
const s3: AWS.S3 = new aws.S3(awsOptions);
const sqs: AWS.SQS = new aws.SQS(awsOptions);

const esClient: Client = new Client({
  node: elasticsearch,
  maxRetries: 5,
  requestTimeout: 60000,
  sniffOnStart: true
});

const thumb: Thumb = new Thumb(bucket, s3, sqs, esClient);

app.get('/thumb/*', (req, res) => thumb.handle(req, res));
app.get('/health', ((req, res) => res.sendStatus(200)))

if (xray) {
  const XRayExpress = AWSXRay.express;
  app.use(XRayExpress.closeSegment());
}

app.listen(port, () => {
  console.log(`Server is listening on ${port}`);
});
