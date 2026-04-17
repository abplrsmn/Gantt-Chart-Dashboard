import { NextResponse } from 'next/server';
import { syncCapexTelegramUpdate } from '@/lib/capex-telegram-sync';

export const dynamic = 'force-dynamic';

function firstNonEmptyString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

function getInboundText(body: any) {
  return firstNonEmptyString(
    body?.text,
    body?.message,
    body?.caption,
    body?.content?.text,
    body?.payload?.text,
    body?.payload?.message,
    body?.context?.text
  );
}

function asMaybeNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return undefined;
  const normalized = String(value).replace(/,/g, '').trim();
  if (!normalized) return undefined;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : value;
}

function parseBody(body: any) {
  const text = getInboundText(body);
  return {
    mode: body?.mode,
    unit: firstNonEmptyString(body?.unit, body?.hotelCode, body?.payload?.unit),
    project: firstNonEmptyString(body?.project, body?.taskName, body?.descriptionTitle, body?.payload?.project),
    description: firstNonEmptyString(body?.description, body?.desc, body?.payload?.description, text),
    commenceDate: firstNonEmptyString(body?.commenceDate, body?.startDate, body?.start, body?.payload?.commenceDate),
    endContract: firstNonEmptyString(body?.endContract, body?.dueDate, body?.due, body?.deadline, body?.payload?.endContract),
    budgetCapex: asMaybeNumber(body?.budgetCapex ?? body?.budget ?? body?.payload?.budgetCapex),
    contractAmount: asMaybeNumber(body?.contractAmount ?? body?.payload?.contractAmount),
    remarks: firstNonEmptyString(body?.remarks, body?.note, body?.statusLog, body?.payload?.remarks),
    currentSiteProgress: body?.currentSiteProgress ?? body?.progress ?? body?.payload?.currentSiteProgress,
    receivedDate: firstNonEmptyString(body?.receivedDate, body?.payload?.receivedDate),
    startDesignDate: firstNonEmptyString(body?.startDesignDate, body?.designDate, body?.payload?.startDesignDate),
    tenderStart: firstNonEmptyString(body?.tenderStart, body?.payload?.tenderStart),
    spkReleased: firstNonEmptyString(body?.spkReleased, body?.apsReleaseDate, body?.payload?.spkReleased),
    actualCompletion: firstNonEmptyString(body?.actualCompletion, body?.payload?.actualCompletion),
    assignee: firstNonEmptyString(body?.assignee, body?.assign, body?.pic, body?.payload?.assignee),
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = parseBody(body);

    if (!parsed.unit || !parsed.project) {
      return NextResponse.json(
        { success: false, error: 'unit and project are required' },
        { status: 400 }
      );
    }

    const result = await syncCapexTelegramUpdate(parsed);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Failed to sync CAPEX Telegram update',
      },
      { status: 500 }
    );
  }
}
