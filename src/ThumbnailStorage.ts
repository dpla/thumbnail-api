import {
  GetObjectCommand,
  GetObjectCommandInput,
  HeadObjectCommand,
  HeadObjectCommandInput,
  NotFound,
  S3Client,
} from "@aws-sdk/client-s3";

import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export class ThumbnailStorage {
  s3Client: S3Client;
  bucket: string;

  constructor(s3Client: S3Client, bucket: string) {
    this.s3Client = s3Client;
    this.bucket = bucket;
  }

  async lookupImageInS3(itemId: string): Promise<boolean> {
    const params: HeadObjectCommandInput = {
      Bucket: this.bucket,
      Key: this.getS3Key(itemId),
    };
    const commandInput: HeadObjectCommand = new HeadObjectCommand(params);

    try {
      await this.s3Client.send(commandInput);
      return true;
    } catch (e) {
      if (e instanceof NotFound) {
        return false;
      } else {
        throw new Error("S3 communications failure.", { cause: e });
      }
    }
  }

  getSignedS3Url(id: string): Promise<string> {
    const params: GetObjectCommandInput = {
      Bucket: this.bucket,
      Key: this.getS3Key(id),
    };
    const request: GetObjectCommand = new GetObjectCommand(params);
    return getSignedUrl(this.s3Client, request);
  }

  // The keys in the cache bucket in s3 have subfolders to keep it from being an
  // enormous list the first 4 hex digits in the image id are used to create a
  // path structure like /1/2/3/4 weak argument validation here because it should
  // have already been validated by getItemId.
  getS3Key(id: string): string {
    const prefix = id.substring(0, 4).split("").join("/");
    return prefix + "/" + id + ".jpg";
  }
}
