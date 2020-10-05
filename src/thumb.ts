import * as express from 'express';
import { RequestHandler } from 'express-serve-static-core';

import * as libRequest from 'request';
import * as aws from 'aws-sdk';

const ELASTIC_URL: String = process.env.ELASTIC_URL || "http://search.internal.dp.la:9200/dpla_alias";

const pathPattern: RegExp = /^\/thumb\/([a-f0-9]{32})$/;

const s3: aws.S3 = new aws.S3();

const thumb: RequestHandler = (req: express.Request, res: express.Response) => {
  
  const itemId = await getItemId(req.path).then((err) => {res.sendStatus(404); return }
  // const id = await lookupImageInS3(id)
  // .then()
  // .catch()
  


  
  res.sendStatus(200); 
};


const getItemId = (path: String) => {
  const matchResult = pathPattern.exec(req.;path)
  if (matchResult === null) {
    return Promise.resolve(matchResult[1]);
  } else {
    return Promise.reject("");
  }
} 


//returns a url for an image
// doint too much. should return promise for s3 head req
const lookupImageInS3 = (id: String) => {
  const prefix = id.substr(0, 4).split("").join("/");
  const s3key = prefix + "/" + id + ".jpg";
  const params = new aws.S3.Types.HeadObjectRequest()
  params.bucket = "dpla-thumbnails";
  params.key = s3key;
  return params.promise();
});
  //     // Not found so go ahead and get info from ES.
  //     // First set short cache-expiration headers so that the client gets an
  //     // optimized image if it checks back soon.
  //     conn.setCacheHeaders(60);

  //     const q_url = ELASTIC_URL + `/item/_search?q=id:${id}&_source=id,object`;
  //     libRequest(q_url, (error, response, body) => {
  //       conn.checkSearchResponse(error, response, body);
  //     });

  //   } else {
  //     // Set longer cache-expiration headers for the nice optimized image
  //     conn.setCacheHeaders(60 * 60 * 24 * 30); // 30 days
  //     conn.imageURL = s3.getSignedUrl("getObject", params);
  //     conn.proxyImage();
  //   }
  // });
};

const setCacheHeaders = (seconds: number, response: express.Response) => {
  const now = new Date().getTime();
  const expirationDateString = new Date(now + 1000 * seconds).toUTCString();
  response.setHeader("Cache-Control", `public, max-age=${seconds}`);
  response.setHeader("Expires", expirationDateString);
};

export default thumb;