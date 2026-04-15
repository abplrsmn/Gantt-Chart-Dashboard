import { NextResponse } from 'next/server';
import { debugListResolution, resolveAnyTargetListByName } from '@/lib/clickup-target';

export const dynamic = 'force-dynamic';

const DEFAULT_SPACE = (process.env.CAPEX_TARGET_SPACE_NAME || 'Project').trim();
const DEFAULT_LIST = (process.env.CAPEX_TARGET_LIST_NAME || 'CAPEX Gantt 2026').trim();

function sanitizeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || 'Unknown error');
  return message.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer ***');
}

export async function GET() {
  try {
    const target = await resolveAnyTargetListByName({
      listName: DEFAULT_LIST,
      candidates: [
        DEFAULT_LIST,
        'CAPEX Gantt',
        'CAPEX',
        'CAPEX Gantt 2025',
        'CAPEX Gantt 2024',
      ],
      spaceName: DEFAULT_SPACE,
    });

    const debug = await debugListResolution({
      listName: DEFAULT_LIST,
      preferredSpaceName: DEFAULT_SPACE,
    });

    return NextResponse.json({
      success: true,
      env: {
        capexTargetSpaceName: DEFAULT_SPACE,
        capexTargetListName: DEFAULT_LIST,
        clickupTeamIdConfigured: Boolean((process.env.CLICKUP_TEAM_ID || '').trim()),
        clickupTokenConfigured: Boolean((process.env.CLICKUP_API_TOKEN || '').trim()),
      },
      resolvedTarget: target,
      debug,
    });
  } catch (error: unknown) {
    const errorMessage = sanitizeError(error);
    let debug: unknown = null;

    try {
      debug = await debugListResolution({
        listName: DEFAULT_LIST,
        preferredSpaceName: DEFAULT_SPACE,
      });
    } catch (nestedError: unknown) {
      debug = { error: sanitizeError(nestedError) };
    }

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        env: {
          capexTargetSpaceName: DEFAULT_SPACE,
          capexTargetListName: DEFAULT_LIST,
          clickupTeamIdConfigured: Boolean((process.env.CLICKUP_TEAM_ID || '').trim()),
          clickupTokenConfigured: Boolean((process.env.CLICKUP_API_TOKEN || '').trim()),
        },
        debug,
      },
      { status: 500 }
    );
  }
}
