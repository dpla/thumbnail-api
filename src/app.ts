import express from 'express';
import { exit } from 'process';
import thumb from './thumb';
import AWSXRay from 'aws-xray-sdk';
import https from "https";
import http from "http";

const port = 3000;
const app = express();
const XRayExpress = AWSXRay.express;

AWSXRay.config([AWSXRay.plugins.EC2Plugin,AWSXRay.plugins.ElasticBeanstalkPlugin]);
AWSXRay.captureHTTPsGlobal(https, false);
AWSXRay.captureHTTPsGlobal(http, false);

app.use(XRayExpress.openSegment('thumbq'));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.get('/thumb/*', thumb);

app.use(XRayExpress.closeSegment());

app.listen(port, () => {
  console.log(`Server is listening on ${port}`);
});
