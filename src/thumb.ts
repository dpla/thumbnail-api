import * as express from 'express';
import { RequestHandler } from 'express-serve-static-core';

import * as libRequest from 'request';
import * as aws from 'aws-sdk';
import { EitherAsync } from 'purify-ts/EitherAsync';
import { Either } from 'purify-ts/Either';


const ELASTIC_URL: String = process.env.ELASTIC_URL || "http://search.internal.dp.la:9200/dpla_alias";

const pathPattern: RegExp = /^\/thumb\/([a-f0-9]{32})$/;

const thumb: RequestHandler = (req: express.Request, res: express.Response) => {
  const matchResult = pathPattern.exec(req.path)

  EitherAsync.liftEither()


  

  if (matchResult !== null) {
    
  } else {
    console.log("Didn't match.")
  }

  res.sendStatus(200); 
};


export default thumb;