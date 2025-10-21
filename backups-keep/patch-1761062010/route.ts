export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { POST as doPost, GET as doGet } from '../fetch/route';
export async function POST(req) { return doPost(req); }
export async function GET(req) { return doGet(req); }
