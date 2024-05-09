import * as AWS from "aws-sdk";
import { Client } from "@elastic/elasticsearch";
import * as express from "express";

export class PssApi {
  esClient: Client;

  constructor(esClient: Client) {
    this.esClient = esClient;
  }

  async handle(req: express.Request, res: express.Response): Promise<void> {}
}
