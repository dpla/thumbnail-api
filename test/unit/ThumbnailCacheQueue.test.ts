import { mockClient } from "aws-sdk-client-mock";
import "aws-sdk-client-mock-jest";

import {
  SendMessageCommand,
  SendMessageCommandOutput,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { ThumbnailCacheQueue } from "../../src/ThumbnailCacheQueue";

describe("ThumbnailCacheQueue", () => {
  const fakeSQS = "bazbuzz";
  const mockSqsClient = mockClient(SQSClient);
  const thumbnailCacheQueue = new ThumbnailCacheQueue(
    fakeSQS,
    mockSqsClient as unknown as SQSClient,
  );

  beforeEach(() => {
    mockSqsClient.reset();
  });

  test("createMessageBody", () => {
    const id = "12345";
    const url = "https://example.com/12345";
    const result = thumbnailCacheQueue.createMessageBody(id, url);
    expect(JSON.parse(result)).toStrictEqual({
      id: id,
      url: url,
    });
  });

  test("createMessageParams", () => {
    const messageBody = "Yo, Banana Boy!";
    const result = thumbnailCacheQueue.createMessageParams(messageBody);
    expect(result).toStrictEqual({
      MessageBody: messageBody,
      QueueUrl: fakeSQS,
    });
  });

  test("queueToThumbnailCache", async () => {
    const id = "12345";
    const url = "https://example.com/12345";
    mockSqsClient
      .on(SendMessageCommand)
      .resolves({} as SendMessageCommandOutput);
    await thumbnailCacheQueue.queueToThumbnailCache(id, url);
    expect(mockSqsClient).toHaveReceivedCommandWith(SendMessageCommand, {
      MessageBody: JSON.stringify({ id: id, url: url }),
      QueueUrl: fakeSQS,
    });
  });
});
