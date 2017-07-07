# s3-mongo-backup
This Module Helps in automating mongodb database Backups and uploading them to AWS S3.

# Features

- Supports Promises
- Uploads Backups to S3
- Uses GZip Compression to reduce Backup Size

# Usage

## Import 

    const MBackup = require('s3-mongo-backup');

## Create a configuration Object

    var backupConfig = {
       mongodb: "mongodb://localhost:27017", // MongoDB Connection URI 
    s3: {
       accessKey: "",  //AccessKey
       secretKey: "",  //SecretKey
       region: "",     //S3 Bucket Region
       accessPerm: "private", //S3 Bucket Privacy, Since, You'll be storing Database, Private is HIGHLY Recommended
       bucketName: "" //Bucket Name
    },
    keepLocalBackups: false,  //If true, It'll create a folder in project root with database's name and store backups in it and if it's false, It'll use temporary directory of OS
    noOfLocalBackups: 5, //This will only keep the most recent 5 backups and delete all older backups from local backup directory
    timezoneOffset: 300 //Timezone, It is assumed to be in hours if less than 16 and in minutes otherwise
    }

### Call the Function and provide Configuration Object to it. 


    MBackup(backupConfig)
      .then(
        onResolve => {
        // When everything was successful
          console.log(onResolve);
    }
        onReject => {
        // When Anything goes wrong!
          console.log(onReject);
    });

> See examples directory for more examples

### Timezone offset's Purpose

Database zip files are stored in format `{database_name}_{YYYY-MM-DDTHH:mm:ss}`. Here, If you don't provide a Timezone offset, It'll assume UTC timezone and name all the backups accordingly. Now, If something goes wrong at "2:00 PM" in your timezone and you need to restore a backup made at "1:00 PM" in your timezone, You'll have to change UTC time to your time and then see which backup you have to restore. 

But If you provide a timezone of where ever you live, You can immdiately recognise which backup can be useful. 

To see how to provide Timezone offset, Please refer to [moment#utcOffset](http://momentjs.com/docs/#/manipulating/utc-offset/)

# License

MIT

# Changelog

    2.0.0 -> Uses MongoDB Connection URI directly, instead of asking for individual values of username, database name, password and database host.


## NOTE

1. This module uses `mongodump` to create backup of database, You need to have it installed on the machine on which you are using this module. 
2. To restore the generated backups

    mongorestore --host localhost --port=27017 --gzip --archive=\<path to backup.gz\>

