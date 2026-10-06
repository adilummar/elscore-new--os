const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");

const S3 = new S3Client({
  region: "auto",
  endpoint: "https://3ecfd7eb6fba0c493a74052dc7e00863.r2.cloudflarestorage.com",
  credentials: {
    accessKeyId: "a30a64461b1905124ceefe6cab6bb739",
    secretAccessKey: "681cc68e768651e0c99d042b34d486dbfdf2677ed199ea6861252aa86e7239ca",
  },
});

async function run() {
  const buckets = ["elscore-production-new-backup", "ellscore-production-new-backup"];
  
  for (const bucket of buckets) {
    try {
      console.log(`\nTesting PUT to bucket: ${bucket}...`);
      await S3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: "backup-verification/test-upload.txt",
        Body: "EL SCORE OS R2 BACKUP VERIFICATION",
      }));
      console.log(`[SUCCESS] PUT worked on ${bucket}!`);

      console.log(`Testing DELETE from bucket: ${bucket}...`);
      await S3.send(new DeleteObjectCommand({
        Bucket: bucket,
        Key: "backup-verification/test-upload.txt",
      }));
      console.log(`[SUCCESS] DELETE worked on ${bucket}!`);
      
      // If we succeed, stop the loop and return the working bucket
      return bucket;
    } catch (err) {
      console.log(`[FAILED] on ${bucket}:`, err.Code || err.message);
    }
  }
}

run();
