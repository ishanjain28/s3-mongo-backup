// Usually, It'll be
// const backup = require('s3-mongo-backup')
// when you installed the package using yarn or npm
// but in example here, I used backup.js directly.
const backup = require("../backup.js");

var backupConfig = {
    mongodb: "mongodb://ishan:password@localhost:27017/freecodecamp", //MongoDB Connection URI
    s3: {
        accessKey: "asd", //AccessKey
        secretKey: "asd", //SecretKey
        region: "us-west-2", //S3 Bucket Region
        accessPerm: "private", //S3 Bucket Privacy, Private is HIGHLY Recommended
        bucketName: "asda`" //Bucket Name
    },
    keepLocalBackups: false, //If true, It'll create a folder in project root with database's name and store backups in it and if it's false, It'll use temporary directory of OS.
    noOfLocalBackups: 2, //This will only keep the most recent 5 backups and delete all older backups from local backup directory
    timezoneOffset: 300 //Timezone, Used in naming backups, It is assumed to be in hours if less than 16 and in minutes otherwise
};

var backupConfig2 = {
    mongodb: {
        "database": "freecodecamp",
        "host": "localhost",
        "username": "admin",
        "password": "password",
        "port": 27017
    },
    s3: {
        accessKey: "asd", //AccessKey
        secretKey: "asd", //SecretKey
        region: "us-west-2", //S3 Bucket Region
        accessPerm: "private", //S3 Bucket Privacy, Private is HIGHLY Recommended
        bucketName: "asda`" //Bucket Name
    },
    keepLocalBackups: false, //If true, It'll create a folder in project root with database's name and store backups in it and if it's false, It'll use temporary directory of OS.
    noOfLocalBackups: 2, //This will only keep the most recent 5 backups and delete all older backups from local backup directory
    timezoneOffset: 300 //Timezone, Used in naming backups, It is assumed to be in hours if less than 16 and in minutes otherwise
};

//  For one time backup
backup(backupConfig2).then(resolved => {
    console.log(resolved);
}, rejected => {
    console.error(rejected);
});

// For backups with some intervals.
setInterval(() => {
    backup(backupConfig).then(resolved => {
        console.log(resolved);
    }, rejected => {
        console.error(rejected);
    });
}, 60 * 60 * 3 * 1000); //Every 3 hours