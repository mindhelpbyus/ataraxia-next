/**
 * Fixed Therapist Lambda Handler
 *
 * This version uses only columns that actually exist in the database
 * and ensures proper schema path configuration.
 *
 * Now updated to include FULL CRUD capabilities:
 * - Create (via Update/Registration)
 * - Read (List, Get, Search, Capacity, Matching)
 * - Update (Profile, Availability, Specialties, Insurance)
 * - Delete (Soft delete)
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
export declare const handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
//# sourceMappingURL=handler.d.ts.map