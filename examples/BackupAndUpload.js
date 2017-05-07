const backup = require("../backup")

var backupConfig = {
  mongodb: {
    host: "localhost", //Database host
    name: "" //Database name
    // Optional Values
    //username: "", //Username to use to connect to database
    //password: "" //Password to use to connect to database
  },
  s3: {
    accessKey: "public-key", //AccessKey
    secretKey: "private-key", //SecretKey
    region: "us-west-2", //S3 Bucket Region
    accessPerm: "private", //S3 Bucket Privacy, Private is HIGHLY Recommended
    bucketName: "awesome-bucket" //Bucket Name
  },
  timezoneOffset: 300 //Timezone, Used in naming backups, It is assumed to be in hours if less than 16 and in minutes otherwise
}

//  For one time backup
backup(config).then(resolved => {
  console.log(resolved)
}, rejected => {
  console.error(rejected)
});;

// For backups with some intervals.

setInterval(() => {
  backup(config).then(resolved => {
    console.log(resolved)
  }, rejected => {
    console.error(rejected)
  });
}, 60 * 60 * 3); // Every 3 hours