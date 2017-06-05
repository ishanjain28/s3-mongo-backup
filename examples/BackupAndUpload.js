// Usually, It'll be
// const backup = require('s3-mongo-backup')
// when you installed the package using yarn or npm
// but in example here, I used backup.js directly.
const backup = require("../backup.js");

var backupConfig = {
    mongodb: {
        host: "localhost", //Database host
        name: "" //Database name
        // Optional Values
        // username: "", //Username to use to connect to database
        // password: "" //Password to use to connect to database
    },
    s3: {
        accessKey: "", //AccessKey
        secretKey: "", //SecretKey
        region: "us-west-2", //S3 Bucket Region
        accessPerm: "private", //S3 Bucket Privacy, Private is HIGHLY Recommended
        bucketName: "" //Bucket Name
    },
    keepLocalBackups: false, //If true, It'll create a folder with database's name and store backups in it and if it's false, It'll use temporary directory of OS.
    timezoneOffset: 300 //Timezone, Used in naming backups, It is assumed to be in hours if less than 16 and in minutes otherwise
};

//  For one time backup
backup(backupConfig).then(resolved => {
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
