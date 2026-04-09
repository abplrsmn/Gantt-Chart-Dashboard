export type CapexSeedRow = {
  sourceKey: string;
  unit: string;
  name: string;
  start?: string;
  end?: string;
  status: string;
  progress?: number;
  note?: string;
  pic?: string;
  nextAction?: string;
  phase?: 'brief' | 'design' | 'control' | 'project_management' | 'handover' | 'done' | 'blocked';
  milestones?: {
    briefDate?: string;
    designDate?: string;
    controlDate?: string;
    projectManagementDate?: string;
    handoverDate?: string;
  };
};

export const capexSeedRows: CapexSeedRow[] = [
  {
    sourceKey: 'SPH|SPH TENNIS COURT INDOOR|19 Jan 2026',
    unit: 'SPH',
    name: 'SPH TENNIS COURT INDOOR',
    start: '19 Jan 2026',
    end: '21 Feb 2026',
    status: 'DONE BY 17 FEB',
    progress: 100,
    pic: 'SPH Ops',
    note: 'Closed earlier than planned.',
    nextAction: 'Archive final completion note',
  },
  {
    sourceKey: 'SPH|SPH TENNIS COURT 3|25-Feb-2026',
    unit: 'SPH',
    name: 'SPH TENNIS COURT 3',
    start: '25-Feb-2026',
    end: '14-Apr-2026',
    status: 'ON SCHEDULE',
    progress: 50,
    pic: 'SPH Project',
    note: 'Mid-progress and still aligned to schedule.',
    nextAction: 'Track completion pace against 14 Apr target',
  },
  {
    sourceKey: "ALV|AEI : MUR 6'th : deluxe & bussiness|3 Dec 2025",
    unit: 'ALV',
    name: "AEI : MUR 6'th : deluxe & bussiness",
    start: '3 Dec 2025',
    end: '14 Mar 2026',
    status: 'DONE BY 11 MARCH',
    progress: 100,
    pic: 'ALV Team',
    note: 'Completed ahead of planned end date.',
    nextAction: 'Closeout documentation',
  },
  {
    sourceKey: 'ALV|LANDSCAPE : BOULEVARD|5 Jan 2026',
    unit: 'ALV',
    name: 'LANDSCAPE : BOULEVARD',
    start: '5 Jan 2026',
    end: '9 Feb 2026',
    status: 'DONE BY 9 FEB',
    progress: 100,
    pic: 'ALTIRA',
    note: 'Landscape work completed.',
    nextAction: 'No immediate action',
  },
  {
    sourceKey: 'ALV|LANDSCAPE : GATE|11 Jan 2026',
    unit: 'ALV',
    name: 'LANDSCAPE : GATE',
    start: '11 Jan 2026',
    end: '14 Mar 2026',
    status: 'DONE BY 16 FEB & PENDING ON SIGNAGE',
    progress: 95,
    pic: 'ALTIRA',
    note: 'Main work done but signage closure still pending.',
    nextAction: 'Set signage closure date',
  },
  {
    sourceKey: 'ALV|LANDSCAPE : LOBBY DROP OFF|6 April 2026',
    unit: 'ALV',
    name: 'LANDSCAPE : LOBBY DROP OFF',
    start: '6 April 2026',
    end: '21 May 2026',
    status: 'COMMENCED AFTER HOLIDAY',
    progress: 0,
    pic: 'ALV Landscape',
    note: 'Recently started post-holiday, no physical progress recorded yet.',
    nextAction: 'Confirm mobilization and first milestone',
  },
  {
    sourceKey: 'ACC|REPAIR SURFACE TENNIS COURT 5&6|7-Feb-2026',
    unit: 'ACC',
    name: 'REPAIR SURFACE TENNIS COURT 5&6',
    start: '7-Feb-2026',
    end: '17-Mar-2026',
    status: 'DONE BY 10 MARCH',
    progress: 100,
    pic: 'ACC Ops',
    note: 'Delivered ahead of timeline.',
    nextAction: 'Handover sign-off',
  },
  {
    sourceKey: 'ACC|PATHWAY REPAIR|5 Sept 2025',
    unit: 'ACC',
    name: 'PATHWAY REPAIR',
    start: '5 Sept 2025',
    status: 'ONGOING',
    pic: 'ACC Infra',
    note: 'Open project without a recorded end date.',
    nextAction: 'Update blocker and target completion date',
  },
  {
    sourceKey: "ASM|AEI - MUR 18'TH : Q1 & Q1A|18 Dec 2025",
    unit: 'ASM',
    name: "AEI - MUR 18'TH : Q1 & Q1A",
    start: '18 Dec 2025',
    end: '14 Mar 2026',
    status: 'DONE BY 15 MARCH',
    progress: 100,
    pic: 'ASM Team',
    note: 'Completed close to target date.',
    nextAction: 'Close project record',
  },
  {
    sourceKey: 'AKB|2025 : CANOPY & FACADE NORTH LOBBY|6-Apr-2026',
    unit: 'AKB',
    name: '2025 : CANOPY & FACADE NORTH LOBBY',
    start: '6-Apr-2026',
    end: '6-May-2026',
    status: 'COMMENCED AFTER HOLIDAY',
    progress: 0,
    pic: 'AKB Project',
    note: 'Recently commenced with no progress booked yet.',
    nextAction: 'Validate site kickoff progress',
  },
  {
    sourceKey: 'AMD|FR : FACADE REPAIR & REPAINTING|19-Feb-2026',
    unit: 'AMD',
    name: 'FR : FACADE REPAIR & REPAINTING',
    start: '19-Feb-2026',
    end: '30-May-2026',
    status: 'ON SCHEDULE',
    progress: 30,
    pic: 'AMD CAPEX',
    note: 'Healthy timeline but still needs weekly pace monitoring.',
    nextAction: 'Review April weekly completion target',
  },
  {
    sourceKey: 'APL|2025 : PPR Pipe Replacement|28-Nov-2025',
    unit: 'APL',
    name: '2025 : PPR Pipe Replacement',
    start: '28-Nov-2025',
    end: '31-Mar-2025',
    status: 'ON SCHEDULE',
    progress: 95,
    pic: 'APL Engineering',
    note: 'Date anomaly detected: end date appears earlier than start year.',
    nextAction: 'Correct end date / year in source sheet',
  },
  {
    sourceKey: 'AME|2025 : AME wood parquet|6 April 2026',
    unit: 'AME',
    name: '2025 : AME wood parquet',
    start: '6 April 2026',
    end: '6 May 2026',
    status: 'COMMENCED AFTER HOLIDAY',
    progress: 0,
    pic: 'AME Project',
    note: 'Recently started, waiting for visible execution progress.',
    nextAction: 'Confirm contractor mobilization',
  },
];
