import {
  SendMessageCommand,
  SendMessageCommandInput,
  SQSClient,
} from "@aws-sdk/client-sqs";

export class ThumbnailCacheQueue {
  sqsUrl: string;
  sqsClient: SQSClient;

  constructor(sqsUrl: string, sqsClient: SQSClient) {
    this.sqsUrl = sqsUrl;
    this.sqsClient = sqsClient;
  }

  async queueToThumbnailCache(id: string, url: string): Promise<void> {
    const msg = this.createMessageBody(id, url);
    const request: SendMessageCommand = new SendMessageCommand(
      this.createMessageParams(msg),
    );
    await this.sqsClient.send(request);
    return Promise.resolve();
  }

  createMessageParams(messageBody: string): SendMessageCommandInput {
    return {
      MessageBody: messageBody,
      QueueUrl: this.sqsUrl,
    } as SendMessageCommandInput;
  }

  createMessageBody(id: string, url: string): string {
    return JSON.stringify({ id: id, url: url });
  }
}
