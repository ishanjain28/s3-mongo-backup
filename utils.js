function UploadFile({ZIP_NAME, backupDir, bucketName, timezoneOffset, S3}) {
  let fileStream = fs.createReadStream(path.resolve(`tmp/${ZIP_NAME}.zip`));

  fileStream.on('error', (err) => {
    return console.error(`${logTime(currentTime(timezoneOffset))} ${err.message}`)
  });

  let uploadParams = {
    Bucket: bucketName,
    Key: backupDir + `/mongo_${ZIP_NAME}`,
    Body: fileStream
  }

  S3.upload(uploadParams, (err, data) => {
    if (err) {
      console.error(`${logTime(currentTime(timezoneOffset))} ${err.message}`)
      // TODO: Wait and retry
      this.UploadFile()
    }

    if (data) {
      console.log(`${logTime(currentTime(timezoneOffset))}, ${data.Location}`)
    }
  })
}

module.exports = {
  utils: {
    backup: {
      Mongo: BackupMongo
    },
    s3: {
      List: ListBuckets,
      UploadFile: UploadFile,
      CraeteBucket: CreateBucket
    },
    zip: {
      Create: CreateZIP
    },
    Delete: Delete
  },
  checkConfig: checkConfig,
  currentTime: currentTime
}