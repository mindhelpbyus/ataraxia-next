require('dotenv').config();
const AWS = require('aws-sdk');

console.log('Loading debug-auth.js');
console.log('Env keys:', Object.keys(process.env).filter(k => k.startsWith('AWS')));

AWS.config.getCredentials(function (err) {
    if (err) console.log('Err loading creds:', err.stack);
    else {
        console.log('Creds loaded:', AWS.config.credentials.accessKeyId);
        const sts = new AWS.STS();
        sts.getCallerIdentity({}, function (err, data) {
            if (err) console.log('STS Error:', err);
            else console.log('STS Data:', data);
        });
    }
});
