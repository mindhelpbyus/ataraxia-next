/**
 * Auth Lambda Handler - Hybrid Support (Firebase + Cognito)
 *
 * Handles authentication supporting both Firebase and Cognito providers simultaneously.
 * Uses DB lookup to route requests to the correct provider for existing users.
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
export declare const handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
//# sourceMappingURL=handler.d.ts.map