/**
 * Auth Lambda Handler - Cloud Agnostic + Prisma Implementation
 *
 * Handles authentication using the abstract AuthProvider and Prisma ORM.
 * Replaces legacy SQL with Prisma Client for all database interactions.
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
export declare const handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
//# sourceMappingURL=handler.d.ts.map