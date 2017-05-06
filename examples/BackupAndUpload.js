const backup = require('../backup')

let config = {
  mongodb: {
    host: "localhost", //Database host
    name: "zion17" //Database name
  },
  s3: {
    accessKey: "AccessKey", //AccessKey
    secretKey: "SecretKey", //SecretKey
    region: "us-west-2", //S3 Bucket Region
    accessPerm: "private", //S3 Bucket Privacy, Private is HIGHLY Recommended
    bucketName: "fintrig" //Bucket Name
  },
  timezoneOffset: 300 //Timezone, Used in naming backups
}

backup
  .BackupAndUpload(config)
  .then(res => {
    console.log(res)
  }, err => {
    console.log(err)
  })