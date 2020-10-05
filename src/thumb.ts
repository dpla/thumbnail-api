import * as express from 'express';
import { RequestHandler } from 'express-serve-static-core';

import * as aws from 'aws-sdk';

const LONG_CACHE_TIME = 60 * 60 * 24 * 30;
const SHORT_CACHE_TIME = 60;

const PATH_PATTERN: RegExp = /^\/thumb\/([a-f0-9]{32})$/;

const s3: aws.S3 = new aws.S3();

function thumb(req: express.Request, res: express.Response): RequestHandler {
  getItemId(req.path)
  .then(
    (itemId) => itemId,
    (err) => { res.sendStatus(404); return }
  ).then(
    (itemId: string) => lookupImageInS3(itemId)
  ).then(
    () => { setCacheHeaders(LONG_CACHE_TIME, res); },
    () => { setCacheHeaders(SHORT_CACHE_TIME, res); }
  )

  res.sendStatus(200); 
};


function getItemId(path: string): Promise<string> {
  const matchResult = PATH_PATTERN.exec(path)
  if (matchResult === null) {
    return Promise.resolve(matchResult[1]);
  } else {
    return Promise.reject("Bad item ID.");
  }
} 

function lookupImageInS3(id: string): Promise<any> {
  const prefix = id.substr(0, 4).split("").join("/");
  const s3key = prefix + "/" + id + ".jpg";
  const params: aws.S3.Types.HeadObjectRequest = {
    Bucket: "dpla-thumbnails",
    Key: s3key
  };
  return s3.headObject(params).promise()
};

function lookupImageInElasticsearch(id: string): Promise<any> {
  const elasticUrl = process.env.ELASTIC_URL || "http://search.internal.dp.la:9200/dpla_alias";
  return fetch(`${elasticUrl}/item/_search?q=id:${id}&_source=id,object`);
}

function getImageUrlFromSearch(json: Object): Promise<string> {

  if ((!json.hasOwnProperty("hits")) || (!json.hasOwnProperty("total"))) {
    return Promise.reject("Bad response from ElasticSearch.");
  }

  if (json["hits"]["total"] == 0) {
    return Promise.reject("No record found.");
  }
  
  const obj = json?.["hits"]?.hits?.[0]?._source?.object;

  let url = "";

  if (obj && Array.isArray(obj)) {
    url = obj[0]; 

  } else if (obj && typeof obj == "string") {
    url = obj;

  } else {
    return Promise.reject("Couldn't find image URL in record.");
  }

  if (!isProbablyURL(url)) {
    return Promise.reject("URL was malformed.");
  }

  return Promise.resolve(url);
};

function isProbablyURL(s: string): boolean {
  return s && s.match(/^https?:\/\//) != null;
};

function setCacheHeaders(seconds: number, response: express.Response): void {
  const now = new Date().getTime();
  const expirationDateString = new Date(now + 1000 * seconds).toUTCString();
  response.setHeader("Cache-Control", `public, max-age=${seconds}`);
  response.setHeader("Expires", expirationDateString);
};

export default thumb;