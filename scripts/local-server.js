// Load environment variables
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { handler } = require('../dist/lambdas/auth/handler');

const app = express();
// Increase body limit
app.use(express.json({ limit: '10mb' }));
app.use(cors());

// Mock context
const context = {
    awsRequestId: 'local-req-id',
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'auth-handler',
    functionVersion: '$LATEST',
    memoryLimitInMB: '1024',
    logGroupName: '/aws/lambda/auth-handler',
    logStreamName: 'local-stream',
    getRemainingTimeInMillis: () => 3000,
    done: () => { },
    fail: () => { },
    succeed: () => { }
};

app.use(async (req, res) => {
    console.log(`${req.method} ${req.path}`);

    // Construct API Gateway Event
    const event = {
        path: req.path,
        httpMethod: req.method,
        headers: req.headers,
        multiValueHeaders: Object.entries(req.headers).reduce((acc, [key, val]) => {
            acc[key] = Array.isArray(val) ? val : [val];
            return acc;
        }, {}),
        queryStringParameters: req.query,
        multiValueQueryStringParameters: null,
        pathParameters: null,
        body: req.method === 'GET' ? null : JSON.stringify(req.body),
        isBase64Encoded: false,
        requestContext: {
            requestId: 'local-req-' + Date.now(),
            identity: {
                sourceIp: req.ip || '127.0.0.1',
                userAgent: req.headers['user-agent']
            },
            stage: 'dev'
        },
        resource: req.path // Simplify
    };

    try {
        const result = await handler(event, context);

        // Handle headers
        if (result.headers) {
            Object.entries(result.headers).forEach(([key, value]) => {
                res.setHeader(key, value);
            });
        }

        // Handle status code
        res.status(result.statusCode || 200);

        // Handle body
        // If body is stringified JSON, send as is or parse? Express send() handles string.
        res.send(result.body);
    } catch (error) {
        console.error('Handler error:', error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = 3002;
app.listen(PORT, () => {
    console.log(`✅ Local Lambda Server running on http://localhost:${PORT}`);
    console.log(`📍 Proxying requests to Ataraxia-Next auth handler`);
    console.log(`🔗 Frontend can now connect at http://localhost:${PORT}`);
});
