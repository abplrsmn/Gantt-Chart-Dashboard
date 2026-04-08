import { promises as fs } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const mappingSchema = z.array(
  z.object({
    no: z.number(),
    clickupTaskId: z.string().nullable(),
    clickupTaskName: z.string().nullable().optional(),
  })
);

const mappingPath = path.join(process.cwd(), 'public', 'capex', 'mapping.json');

async function readMapping() {
  const raw = await fs.readFile(mappingPath, 'utf8');
  return mappingSchema.parse(JSON.parse(raw));
}

async function writeMapping(data: z.infer<typeof mappingSchema>) {
  await fs.mkdir(path.dirname(mappingPath), { recursive: true });
  await fs.writeFile(mappingPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

export async function GET() {
  try {
    const data = await readMapping();
    return NextResponse.json({ success: true, data, total: data.length, empty: data.length === 0 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to load mapping' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const data = mappingSchema.parse(body);
    await writeMapping(data);
    return NextResponse.json({ success: true, data, total: data.length });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to update mapping' }, { status: 400 });
  }
}
