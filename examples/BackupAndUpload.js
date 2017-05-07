const backup = require('../backup')

let config = {
  mongodb: {
    host: "Database-host", //Database host
    name: "database-name" //Database name
    // Optional Values
    // username: "Username-to-use",
    // password: "Password-to-use"
  },
  s3: {
    accessKey: "public-key", //AccessKey
    secretKey: "private-key", //SecretKey
    region: "us-west-2", //S3 Bucket Region
    accessPerm: "private", //S3 Bucket Privacy, Private is HIGHLY Recommended
    bucketName: "awesome-bucket" //Bucket Name
  },
  timezoneOffset: 300 //Timezone, Used in naming backups
}