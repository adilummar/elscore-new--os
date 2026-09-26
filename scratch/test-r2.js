const { S3Client, ListBucketsCommand } = require("@aws-sdk/client-s3");

const S3 = new S3Client({
  region: "auto",
  endpoint: "https://3ecfd7eb6fba0c493a74052dc7e00863.r2.cloudflarestorage.com",
  credentials: {
    accessKeyId: "839366a47662c93524e8d1fd55cef05e",
    secretAccessKey: "0b4b0dc5e3eeb9eb600b8a4d9e0f334114a130490f491e1d7d25ea5b1a1d993b",
  },
});

async function run() {
  try {
    console.log("Testing connection to Cloudflare R2...");
    const res = await S3.send(new ListBucketsCommand({}));
    console.log("SUCCESS! Buckets:", res.Buckets);
  } catch (err) {
    console.error("FAILED:");
    console.error(err);
  }
}

run();
