#!/bin/bash

# Load environment variables from .env file
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Create zip from dist directory
cd dist
zip -r ../lambda-update.zip .
cd ..

# Update Lambda function
aws lambda update-function-code --function-name ataraxia-auth-dev --zip-file fileb://lambda-update.zip

echo "Lambda function updated successfully!"