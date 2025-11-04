// utils/s3.mjs - S3 file operations

import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client, S3_CONFIG } from "../config/aws.mjs";

export async function uploadFileToS3(bucket, key, file) {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: file.content,
      ContentType: file.contentType,
    })
  );
}

export async function generatePresignedUrl(bucket, key, expiresIn = null) {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return await getSignedUrl(s3Client, command, {
    expiresIn: expiresIn || S3_CONFIG.PRESIGNED_URL_EXPIRY,
  });
}

export async function getSignedUrlsForFiles(files) {
  const out = [];
  for (const file of files) {
    if (file.filePath?.startsWith("s3://")) {
      const s3Bucket = file.filePath.split("/")[2];
      const s3Key = file.filePath.split("/").slice(3).join("/");
      const presignedUrl = await generatePresignedUrl(s3Bucket, s3Key);
      out.push({ ...file, fileUrl: presignedUrl });
    } else {
      out.push(file);
    }
  }
  return out;
}
