import { mockClient } from "aws-sdk-client-mock";
import "aws-sdk-client-mock-jest";
import {
  GetObjectCommand,
  HeadObjectCommand,
  HeadObjectCommandOutput,
  NotFound,
  S3Client,
} from "@aws-sdk/client-s3";
jest.mock("@aws-sdk/s3-request-presigner");
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ThumbnailStorage } from "../../src/ThumbnailStorage";
import * as matchers from "jest-extended";
expect.extend(matchers);

describe("ThumbnailStorage", () => {
  const fakeBucket = "fakeBucket";
  const mockS3Client = mockClient(S3Client);
  const thumbnailStorage = new ThumbnailStorage(
    mockS3Client as unknown as S3Client,
    fakeBucket,
  );

  beforeEach(() => {
    mockS3Client.reset();
  });

  test.each([
    [
      "223ea5040640813b6c8204d1e0778d30",
      "2/2/3/e/223ea5040640813b6c8204d1e0778d30.jpg",
    ],
    [
      "11111111111111111111111111111111",
      "1/1/1/1/11111111111111111111111111111111.jpg",
    ],
  ])("getS3Key", (input, output) => {
    expect(thumbnailStorage.getS3Key(input)).toBe(output);
  });

  test("lookupImageInS3: success", async () => {
    const id = "12345";
    mockS3Client.on(HeadObjectCommand).resolves({} as HeadObjectCommandOutput);
    await thumbnailStorage.lookupImageInS3(id);
    expect(mockS3Client).toHaveReceivedCommandWith(HeadObjectCommand, {
      Bucket: fakeBucket,
      Key: "1/2/3/4/12345.jpg",
    });
  });

  test("lookupImageInS3: not found", async () => {
    const id = "12345";
    mockS3Client
      .on(HeadObjectCommand)
      .rejects(new NotFound({ message: "Not found.", $metadata: {} }));
    const result = await thumbnailStorage.lookupImageInS3(id);
    expect(result).toBe(false);
    expect(mockS3Client).toHaveReceivedCommandWith(HeadObjectCommand, {
      Bucket: fakeBucket,
      Key: "1/2/3/4/12345.jpg",
    });
  });

  test("lookupImageInS3: failure", async () => {
    const id = "12345";
    mockS3Client.on(HeadObjectCommand).rejects(new Error("Oopsie."));
    expect.assertions(2);
    await thumbnailStorage.lookupImageInS3(id).catch((error: unknown) => {
      expect(error).toBeDefined();
    });

    expect(mockS3Client).toHaveReceivedCommandWith(HeadObjectCommand, {
      Bucket: fakeBucket,
      Key: "1/2/3/4/12345.jpg",
    });
  });

  test("getSignedS3Url", async () => {
    const id = "12345";
    const url = "https://example.com/12345";
    const mockedGetSignedUrl = jest.mocked(getSignedUrl);
    mockedGetSignedUrl.mockResolvedValue(url);
    const result = await thumbnailStorage.getSignedS3Url(id);
    expect(mockedGetSignedUrl).toHaveBeenCalledWith(
      mockS3Client,
      expect.any(GetObjectCommand),
    );
    expect(result).toBe(url);
  });
});
