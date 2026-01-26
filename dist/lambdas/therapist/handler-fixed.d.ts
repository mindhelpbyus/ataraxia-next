/**
 * Fixed Therapist Lambda Handler
 *
 * This version uses only columns that actually exist in the database
 * and ensures proper schema path configuration.
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
export declare const handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
//# sourceMappingURL=handler-fixed.d.ts.map