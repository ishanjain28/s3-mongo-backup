const {exec} = require('child_process'),
  moment = require('moment'),
  fs = require('fs'),
  Admzip = require('adm-zip'),
  path = require('path'),
  isLoggingEnabled = false,
  logTime = (TIME) => `[${TIME}]:`;

// S3 Utils Used to check if provided bucket exists If it does not exists then
// it can create one, and then use it.  Also used to upload File
function ListBuckets({timezoneOffset, S3}) {
  return new Promise((resolve, reject) => {
    S3.listBuckets((err, data) => {
      if (err) {
        return console.error(`${logTime(currentTime(timezoneOffset))} ${err}`)
      }

      let doesBucketExists = data
        .Buckets
        .find(a => a.Name === bucketName)

      if (!doesBucketExists) {
        console.log(`${logTime(currentTime(timezoneOffset))} Bucket does not exists!\n${logTime(currentTime(timezoneOffset))} Creating one now!`)
        reject({error: 1, message: "Bucket Does not exists", code: "BENOENT"})
      } else {
        resolve({error: 0, message: "Bucket Exists, Proceed!", code: "OK", BURL: data.Location})
      }
    });
  });
}

function CreateBucket({S3, bucketParams, timezoneOffset}) {
  return new Promise((resolve, reject) => {
    S3.createBucket(bucketParams, (err, data) => {
      if (err) {
        console.error(`${logTime(currentTime(timezoneOffset))} ${err.message}`)
        reject({error: 1, message: err.message})
      }
      if (data) {
        console.log(`${logTime(currentTime(timezoneOffset))} Successfully created Bucket\n${logTime(currentTime(timezoneOffset))} URL: ${data.Location}`)
        resolve({error: 0, url: data.Location, message: 'Sucessfully created URL'})
      }
    })
  });
}

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