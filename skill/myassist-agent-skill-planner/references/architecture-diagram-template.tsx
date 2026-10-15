/* eslint-disable i18next/no-literal-string -- This file is a customizable React diagram template; visible labels are intentionally edited per generated artifact. */

/**
 * MyAssist Agent & Skill Architecture Diagram Template
 *
 * This file contains 3 layout patterns for visualising agent + skill architectures.
 * When adapting this template, follow the anti-overlap rules strictly:
 *
 * ANTI-OVERLAP RULES (DO NOT VIOLATE):
 * 1. Minimum horizontal gap between node edges: 20px
 * 2. Minimum vertical gap between node edges: 20px
 * 3. Node width must accommodate label text + 12px padding on each side
 * 4. Sublabel text must fit within node width - 12px
 * 5. Edge paths must not pass through node bodies (allow 4px clearance minimum)
 * 6. Annotations must be placed above/below nodes with 8px+ clearance
 * 7. Container boxes must have 16px+ padding from inner nodes on all sides
 * 8. Canvas dimensions W=1080, H=520 — do not change
 * 9. When calculating cx (center x), ensure left edge (cx - w/2) and right edge (cx + w/2) don't collide with adjacent nodes
 * 10. Junction dots are 14px diameter — edges connecting to junctions must end at cx±7 or cy±7
 * 11. typeLabel adds height — Agent nodes must be ≥90px tall, Skill nodes ≥64px tall to prevent the typeLabel clipping into the icon or main label below it
 * 12. **Connector edge clearance:** An edge must leave and enter every node perpendicularly. No edge segment may run along, overlap, or sit within 4px of a node border. Route edges through clear space and use turns only where needed to maintain this clearance.
 * 13. **Container header space:** Every labelled container must reserve a clear header band above its first node. Place the container label 18-20px below the container top and keep the first contained node at least 16px below the label baseline. Increase the container outward rather than moving its content closer to the label. Reserve at least 36px for a one-line heading and 48px for a two-line heading.
 *
 * WHAT YOU MUST CUSTOMISE:
 * - Node labels (agent name, skill names, input/output descriptions)
 * - Node sublabels (tool/connector names, format labels)
 * - Edge paths (update coordinates to match your node positions)
 * - formatLabel values for Office outputs (DOCX, XLSX, PPTX)
 * - Container box labels and positions (if grouping changes)
 *
 * WHAT YOU MUST NOT CHANGE:
 * - PAL colour values (keep colour consistency across all diagrams)
 * - Node component structure (the div + icon + label layout)
 * - Icon imports (use only the icons listed below)
 * - Canvas dimensions (W=1080, H=520)
 * - SVG arrow marker definition
 * - Font sizes and weights (maintain visual hierarchy)
 *
 * LAYOUT SELECTION GUIDE:
 * - Use SeriesLayout when: skills run strictly one after another in a single pipeline
 * - Use ParallelLayout when: some skills run in parallel and then converge (fan-in/fan-out)
 * - Use AgentOnlyLayout when: no discrete skills — standalone chat agent with tools/connectors
 *
 * DATA SOURCE MAPPING:
 * Never show a local computer folder path — MyAssist users cannot point to local folders.
 *
 * - SharePoint source files: Show SharePoint as a connector block (MCPIcon) pointing into the Agent,
 *   with a yellow file node labeled "Provide SharePoint folder link" as user input
 * - OneDrive output files: Show as output with sublabel "Save to configured OneDrive folder" or
 *   a separate input node "Provide OneDrive folder link" if users supply the destination each time
 * - User uploads working files: Show yellow file node "Upload Files" pointing into Agent
 * - File Search: Show as bottom tool text only when users upload reference material to File Search,
 *   not as a separate flow node. Example: "File Search: Upload files to File Search"
 * - User query: Show as "User Request" or "User Query", not as a file path
 */

import {
  Bot, // Agent (robot icon for the Agent Builder concept)
  Brain, // Memory
  FileSearch, // File Search tool
  FileSpreadsheet, // Spreadsheet
  FileText, // Document / generic file
  Globe, // Web Search
  ScrollText, // Skill
  Terminal, // Run Code
  User, // User
  WandSparkles, // Artifacts
  Wrench, // Tools (generic)
} from 'lucide-react';

// ══════════════════════════════════════════════════════════════════
// SHARED UTILITIES (DO NOT MODIFY)
// ══════════════════════════════════════════════════════════════════

const PAL = {
  agent: { fill: '#dae8fc', stroke: '#6c8ebf', icon: '#1a5276' },
  skill: { fill: '#d5e8d4', stroke: '#82b366', icon: '#1e6b3c' },
  connector: { fill: '#dae3f5', stroke: '#7a9cc8', icon: '#2c5f8a' },
  tool: { fill: '#e1d5e7', stroke: '#9673a6', icon: '#5b2c6f' },
  file: { fill: '#fff2cc', stroke: '#d6b656', icon: '#7d6608' },
  neutral: { fill: '#f5f5f5', stroke: '#aaaaaa', icon: '#555555' },
};

const EC = '#555555'; // Edge colour
const W = 1080,
  H = 520; // Canvas dimensions (DO NOT CHANGE)

function MCPIcon({
  size = 18,
  color = 'currentColor',
  strokeWidth = 1.5,
}: {
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <circle cx="4" cy="6" r="2" />
      <circle cx="20" cy="6" r="2" />
      <circle cx="4" cy="18" r="2" />
      <circle cx="20" cy="18" r="2" />
      <line x1="12" y1="9" x2="5" y2="7" />
      <line x1="12" y1="9" x2="19" y2="7" />
      <line x1="12" y1="15" x2="5" y2="17" />
      <line x1="12" y1="15" x2="19" y2="17" />
    </svg>
  );
}

interface NodeProps {
  cx: number;
  cy: number;
  w: number;
  h: number;
  label: string;
  sublabel?: string;
  formatLabel?: string; // For DOCX/XLSX/PPTX badges (replaces icon)
  typeLabel?: string; // For AGENT/SKILL type identification
  Icon?: typeof Bot | typeof MCPIcon;
  pal: { fill: string; stroke: string; icon: string };
  large?: boolean;
}

function Node({
  cx,
  cy,
  w,
  h,
  label,
  sublabel,
  formatLabel,
  typeLabel,
  Icon,
  pal,
  large = false,
}: NodeProps) {
  const renderVisual = () => {
    if (formatLabel) {
      return (
        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: pal.icon,
            background: 'rgba(255,255,255,0.7)',
            padding: '2px 6px',
            borderRadius: 4,
            border: `1px solid ${pal.stroke}`,
          }}
        >
          {formatLabel}
        </div>
      );
    }
    if (Icon) {
      return <Icon size={large ? 26 : 18} strokeWidth={1.5} color={pal.icon} />;
    }
    return null;
  };

  return (
    <div
      style={{
        position: 'absolute',
        left: cx - w / 2,
        top: cy - h / 2,
        width: w,
        height: h,
        background: pal.fill,
        border: `2px solid ${pal.stroke}`,
        borderRadius: 8,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '4px 6px',
        boxSizing: 'border-box',
        gap: 2,
        boxShadow: large ? '0 3px 10px rgba(0,0,0,0.18)' : '0 1px 4px rgba(0,0,0,0.10)',
        zIndex: 2,
        userSelect: 'none',
      }}
    >
      {typeLabel && (
        <div
          style={{
            fontSize: large ? 13 : 10,
            fontWeight: 700,
            color: pal.icon,
            textTransform: 'uppercase',
            letterSpacing: '0.8px',
            marginBottom: 2,
          }}
        >
          {typeLabel}
        </div>
      )}
      {renderVisual()}
      <div
        style={{
          fontSize: large ? 13 : 10,
          fontWeight: 700,
          color: '#222',
          textAlign: 'center',
          lineHeight: 1.2,
        }}
      >
        {label}
      </div>
      {sublabel && (
        <div
          style={{ fontSize: 8, color: '#555', textAlign: 'center', lineHeight: 1.3, marginTop: 1 }}
        >
          {sublabel}
        </div>
      )}
    </div>
  );
}

interface LegendProps {
  items: { label: string; fill: string; stroke: string }[];
}

function Legend({ items }: LegendProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginTop: 14,
        padding: '9px 16px',
        background: '#f9f9f9',
        border: '1px solid #dddddd',
        borderRadius: 6,
        width: W - 32,
        boxSizing: 'border-box',
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: '#666',
          marginRight: 4,
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        Legend:
      </span>
      {items.map(({ label, fill, stroke }, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            textAlign: 'center',
            padding: '4px 6px',
            background: fill,
            border: `1.5px solid ${stroke}`,
            borderRadius: 5,
            fontSize: 10,
            fontWeight: 600,
            color: '#333',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 6, flexShrink: 0 }}>
        <svg width={38} height={14}>
          <defs>
            <marker
              id="arr-legend"
              markerWidth="8"
              markerHeight="6"
              refX="7"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0,8 3,0 6" fill={EC} />
            </marker>
          </defs>
          <line
            x1={2}
            y1={7}
            x2={31}
            y2={7}
            stroke={EC}
            strokeWidth={1.5}
            markerEnd="url(#arr-legend)"
          />
        </svg>
        <span style={{ fontSize: 10, color: '#555', whiteSpace: 'nowrap' }}>Data flow</span>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// LAYOUT A: SERIES (LINEAR PIPELINE)
// ══════════════════════════════════════════════════════════════════
// Use when: skills run strictly one after another in sequence
// Structure: User → InputFiles → Agent → Skill A → Skill B → Skill C → Output
// Shows true sequential flow with handoffs between skills

export function SeriesLayout() {
  // Node positions (verify no overlaps — see ANTI-OVERLAP RULES above):
  // User:        cx=65,  cy=290, w=72,  h=78  → left=29,  right=101, top=251, bottom=329
  // InputFiles:  cx=168, cy=290, w=88,  h=52  → left=124, right=212, top=264, bottom=316
  // Agent:       cx=300, cy=290, w=150, h=90  → left=225, right=375, top=245, bottom=335
  // SkillA:      cx=490, cy=290, w=115, h=64  → left=432, right=547, top=258, bottom=322
  // SkillB:      cx=640, cy=290, w=115, h=64  → left=582, right=697, top=258, bottom=322
  // SkillC:      cx=790, cy=290, w=115, h=64  → left=732, right=847, top=258, bottom=322
  // Output:      cx=960, cy=290, w=140, h=52  → left=890, right=1030, top=264, bottom=316

  const edges = [
    'M101,290 H124', // 1  User → Input Files
    'M212,290 H225', // 2  Input Files → Agent
    'M375,290 H432', // 3  Agent → Skill A
    'M547,290 H582', // 4  Skill A → Skill B (handoff)
    'M697,290 H732', // 5  Skill B → Skill C (handoff)
    'M847,290 H890', // 6  Skill C → Output
  ];

  const legendItems = [
    { label: 'Agent', fill: PAL.agent.fill, stroke: PAL.agent.stroke },
    { label: 'Skill', fill: PAL.skill.fill, stroke: PAL.skill.stroke },
    { label: 'Tool', fill: PAL.tool.fill, stroke: PAL.tool.stroke },
    { label: 'File / IO', fill: PAL.file.fill, stroke: PAL.file.stroke },
    { label: 'Output', fill: PAL.agent.fill, stroke: PAL.agent.stroke },
  ];

  return (
    <div
      style={{
        fontFamily: 'Arial, sans-serif',
        background: '#fff',
        padding: 16,
        overflowX: 'auto',
      }}
    >
      <div style={{ position: 'relative', width: W, height: H }}>
        <svg
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: W,
            height: H,
            overflow: 'visible',
          }}
        >
          <defs>
            <marker id="arr" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0,8 3,0 6" fill={EC} />
            </marker>
          </defs>

          {/* Title */}
          <text x={W / 2} y={30} textAnchor="middle" fontSize={17} fontWeight="700" fill="#222">
            Agent &amp; Skills Architecture — Sequential Workflow
          </text>

          {/* Agent Ecosystem container */}
          <rect
            x={210}
            y={195}
            width={652}
            height={170}
            rx={8}
            fill="#fafafa"
            stroke="#cccccc"
            strokeWidth={1.5}
            strokeDasharray="8,4"
          />
          <text x={226} y={215} fontSize={10} fontStyle="italic" fill="#aaaaaa">
            Agent Ecosystem
          </text>

          {/* Output container */}
          <rect
            x={875}
            y={215}
            width={170}
            height={130}
            rx={8}
            fill="#fffef5"
            stroke="#d6b656"
            strokeWidth={1.2}
            strokeDasharray="6,3"
          />
          <text x={891} y={235} fontSize={10} fontStyle="italic" fill="#b8860b">
            Output
          </text>

          {/* Edges */}
          {edges.map((d, i) => (
            <path key={i} d={d} stroke={EC} strokeWidth={1.5} fill="none" markerEnd="url(#arr)" />
          ))}
        </svg>

        {/* Nodes */}
        <Node cx={65} cy={290} w={72} h={78} label="User" Icon={User} pal={PAL.neutral} />
        <Node cx={168} cy={290} w={88} h={52} label="Input Files" Icon={FileText} pal={PAL.file} />
        <Node
          cx={300}
          cy={290}
          w={150}
          h={90}
          label="Agent"
          Icon={Bot}
          pal={PAL.agent}
          large
          typeLabel="AGENT"
        />

        <Node
          cx={490}
          cy={290}
          w={115}
          h={64}
          label="Skill A"
          sublabel="Research"
          Icon={ScrollText}
          pal={PAL.skill}
          typeLabel="SKILL"
        />
        <Node
          cx={640}
          cy={290}
          w={115}
          h={64}
          label="Skill B"
          sublabel="Analyse"
          Icon={ScrollText}
          pal={PAL.skill}
          typeLabel="SKILL"
        />
        <Node
          cx={790}
          cy={290}
          w={115}
          h={64}
          label="Skill C"
          sublabel="Format"
          Icon={ScrollText}
          pal={PAL.skill}
          typeLabel="SKILL"
        />

        <Node
          cx={960}
          cy={290}
          w={140}
          h={52}
          label="Final Report"
          formatLabel="DOCX"
          pal={PAL.file}
        />
      </div>

      <Legend items={legendItems} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// LAYOUT B: PARALLEL THEN SERIES (FAN-IN / FAN-OUT)
// ══════════════════════════════════════════════════════════════════
// Use when: some skills run in parallel, then converge into another skill
// Structure: User → Agent [ SkillA ↘ SkillC ] → Outputs
//                             SkillB ↗

export function ParallelLayout() {
  // Node positions:
  // User:         cx=65,  cy=290, w=72,  h=78  → left=29,  right=101, top=251, bottom=329
  // InputFiles:   cx=168, cy=290, w=88,  h=52  → left=124, right=212, top=264, bottom=316
  // Agent:        cx=350, cy=290, w=150, h=78  → left=275, right=425, top=251, bottom=329
  // Connectors:   cx=350, cy=158, w=130, h=52  → left=285, right=415, top=132, bottom=184
  // Tools:        cx=350, cy=422, w=162, h=68  → left=269, right=431, top=388, bottom=456
  // SkillA:       cx=560, cy=200, w=115, h=52  → left=502, right=617, top=174, bottom=226
  // SkillB:       cx=560, cy=380, w=115, h=52  → left=502, right=617, top=354, bottom=406
  // SkillC:       cx=735, cy=290, w=115, h=52  → left=677, right=792, top=264, bottom=316
  // Junction:     cx=840, cy=290, r=7          → left=833, right=847, top=283, bottom=297
  // Microsite:    cx=965, cy=215, w=140, h=52  → left=895, right=1035, top=189, bottom=241
  // Document:     cx=965, cy=292, w=140, h=52  → left=895, right=1035, top=266, bottom=318
  // Spreadsheet:  cx=965, cy=369, w=140, h=52  → left=895, right=1035, top=343, bottom=395
  // Presentation: cx=965, cy=446, w=140, h=52  → left=895, right=1035, top=420, bottom=472

  const edges = [
    'M101,290 H124', // 1  User → Input Files
    'M212,290 H275', // 2  Input Files → Agent
    'M350,184 V251', // 3  Connectors → Agent (top)
    'M350,388 V329', // 4  Tools → Agent (bottom)
    'M425,270 H463 V200 H502', // 5  Agent → Skill A (upper branch)
    'M425,310 H463 V380 H502', // 6  Agent → Skill B (lower branch)
    'M617,200 H644 V290 H677', // 7  Skill A → Skill C (fan in, top arc)
    'M617,380 H650 V290 H677', // 8  Skill B → Skill C (fan in, bottom arc)
    'M792,290 H833', // 9  Skill C → Junction
    'M847,290 H875 V215 H895', // 10 Junction → Microsite
    'M847,290 H895', // 11 Junction → Document (straight)
    'M847,290 H875 V369 H895', // 12 Junction → Spreadsheet
    'M847,290 H875 V446 H895', // 13 Junction → Presentation
  ];

  const legendItems = [
    { label: 'Agent', fill: PAL.agent.fill, stroke: PAL.agent.stroke },
    { label: 'Skill', fill: PAL.skill.fill, stroke: PAL.skill.stroke },
    { label: 'Connector', fill: PAL.connector.fill, stroke: PAL.connector.stroke },
    { label: 'Tool', fill: PAL.tool.fill, stroke: PAL.tool.stroke },
    { label: 'File / IO', fill: PAL.file.fill, stroke: PAL.file.stroke },
    { label: 'Output', fill: PAL.agent.fill, stroke: PAL.agent.stroke },
  ];

  return (
    <div
      style={{
        fontFamily: 'Arial, sans-serif',
        background: '#fff',
        padding: 16,
        overflowX: 'auto',
      }}
    >
      <div style={{ position: 'relative', width: W, height: H }}>
        <svg
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: W,
            height: H,
            overflow: 'visible',
          }}
        >
          <defs>
            <marker id="arr" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0,8 3,0 6" fill={EC} />
            </marker>
          </defs>

          {/* Title */}
          <text x={W / 2} y={30} textAnchor="middle" fontSize={17} fontWeight="700" fill="#222">
            Agent &amp; Skills Architecture — Parallel then Series
          </text>

          {/* Agent Ecosystem container */}
          <rect
            x={232}
            y={82}
            width={582}
            height={410}
            rx={8}
            fill="#fafafa"
            stroke="#cccccc"
            strokeWidth={1.5}
            strokeDasharray="8,4"
          />
          <text x={248} y={102} fontSize={10} fontStyle="italic" fill="#aaaaaa">
            Agent Ecosystem
          </text>

          {/* Parallel group box */}
          <rect
            x={486}
            y={128}
            width={147}
            height={300}
            rx={6}
            fill="rgba(213,232,212,0.22)"
            stroke="#82b366"
            strokeWidth={1}
            strokeDasharray="5,3"
          />
          <text x={559} y={148} textAnchor="middle" fontSize={9} fontStyle="italic" fill="#4a8c5c">
            ① Parallel
          </text>

          {/* Series annotation */}
          <text x={735} y={252} textAnchor="middle" fontSize={9} fontStyle="italic" fill="#4a8c5c">
            ② Series
          </text>

          {/* Outputs container */}
          <rect
            x={880}
            y={128}
            width={178}
            height={374}
            rx={8}
            fill="#fffef5"
            stroke="#d6b656"
            strokeWidth={1.2}
            strokeDasharray="6,3"
          />
          <text x={896} y={148} fontSize={10} fontStyle="italic" fill="#b8860b">
            Outputs
          </text>

          {/* Edges */}
          {edges.map((d, i) => (
            <path key={i} d={d} stroke={EC} strokeWidth={1.5} fill="none" markerEnd="url(#arr)" />
          ))}
        </svg>

        {/* Junction dot */}
        <div
          style={{
            position: 'absolute',
            left: 833,
            top: 283,
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: '#333333',
            zIndex: 4,
          }}
        />

        {/* Nodes */}
        <Node cx={65} cy={290} w={72} h={78} label="User" Icon={User} pal={PAL.neutral} />
        <Node cx={168} cy={290} w={88} h={52} label="Input Files" Icon={FileText} pal={PAL.file} />
        <Node
          cx={350}
          cy={158}
          w={130}
          h={52}
          label="Connectors"
          Icon={MCPIcon}
          pal={PAL.connector}
        />
        <Node
          cx={350}
          cy={290}
          w={150}
          h={90}
          label="Agent"
          Icon={Bot}
          pal={PAL.agent}
          large
          typeLabel="AGENT"
        />
        <Node
          cx={350}
          cy={422}
          w={162}
          h={68}
          label="Tools"
          sublabel="Run Code · Skills · Artifacts · Web Search"
          Icon={Wrench}
          pal={PAL.tool}
        />

        <Node
          cx={560}
          cy={200}
          w={115}
          h={64}
          label="Skill A"
          Icon={ScrollText}
          pal={PAL.skill}
          typeLabel="SKILL"
        />
        <Node
          cx={560}
          cy={380}
          w={115}
          h={64}
          label="Skill B"
          Icon={ScrollText}
          pal={PAL.skill}
          typeLabel="SKILL"
        />
        <Node
          cx={735}
          cy={290}
          w={115}
          h={64}
          label="Skill C"
          Icon={ScrollText}
          pal={PAL.skill}
          typeLabel="SKILL"
        />

        <Node cx={965} cy={215} w={140} h={52} label="Microsite" Icon={Globe} pal={PAL.agent} />
        <Node cx={965} cy={292} w={140} h={52} label="Document" formatLabel="DOCX" pal={PAL.file} />
        <Node
          cx={965}
          cy={369}
          w={140}
          h={52}
          label="Spreadsheet"
          formatLabel="XLSX"
          pal={PAL.file}
        />
        <Node
          cx={965}
          cy={446}
          w={140}
          h={52}
          label="Presentation"
          formatLabel="PPTX"
          pal={PAL.file}
        />
      </div>

      <Legend items={legendItems} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// LAYOUT C: AGENT ONLY (NO SKILLS)
// ══════════════════════════════════════════════════════════════════
// Use when: standalone chat agent with tools/connectors — no discrete skills
// Structure: User → Agent (with tools annotations) → Output

export function AgentOnlyLayout() {
  // Node positions:
  // User:         cx=120, cy=290, w=72,  h=78  → left=84,  right=156, top=251, bottom=329
  // Query:        cx=270, cy=290, w=88,  h=52  → left=226, right=314, top=264, bottom=316
  // RefFiles:     cx=270, cy=180, w=120, h=52  → left=210, right=330, top=154, bottom=206
  // FileSearch:   cx=400, cy=180, w=130, h=52  → left=335, right=465, top=154, bottom=206
  // Agent:        cx=540, cy=290, w=180, h=110 → left=450, right=630, top=235, bottom=345
  // Connector:    cx=540, cy=440, w=150, h=52  → left=465, right=615, top=414, bottom=466
  // Output:       cx=850, cy=290, w=140, h=52  → left=780, right=920, top=264, bottom=316

  const edges = [
    'M156,270 H196 V180 H210', // 1  User → Reference Files (upper branch)
    'M156,310 H196 V290 H226', // 2  User → Query (lower branch)
    'M330,180 H335', // 3  Reference Files → File Search
    'M465,180 H500 V235 H540', // 4  File Search → Agent
    'M314,290 H450', // 5  Query → Agent
    'M540,414 V345', // 6  Connector → Agent (bottom)
    'M630,290 H780', // 7  Agent → Output
  ];

  const legendItems = [
    { label: 'Agent', fill: PAL.agent.fill, stroke: PAL.agent.stroke },
    { label: 'Connector', fill: PAL.connector.fill, stroke: PAL.connector.stroke },
    { label: 'Tool', fill: PAL.tool.fill, stroke: PAL.tool.stroke },
    { label: 'File / IO', fill: PAL.file.fill, stroke: PAL.file.stroke },
    { label: 'Output', fill: PAL.agent.fill, stroke: PAL.agent.stroke },
  ];

  return (
    <div
      style={{
        fontFamily: 'Arial, sans-serif',
        background: '#fff',
        padding: 16,
        overflowX: 'auto',
      }}
    >
      <div style={{ position: 'relative', width: W, height: H }}>
        <svg
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: W,
            height: H,
            overflow: 'visible',
          }}
        >
          <defs>
            <marker id="arr" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0,8 3,0 6" fill={EC} />
            </marker>
          </defs>

          {/* Title */}
          <text x={W / 2} y={30} textAnchor="middle" fontSize={17} fontWeight="700" fill="#222">
            Agent Architecture — Standalone Chat Agent
          </text>

          {/* Agent Ecosystem container */}
          <rect
            x={430}
            y={82}
            width={220}
            height={410}
            rx={8}
            fill="#fafafa"
            stroke="#cccccc"
            strokeWidth={1.5}
            strokeDasharray="8,4"
          />
          <text x={446} y={102} fontSize={10} fontStyle="italic" fill="#aaaaaa">
            Agent Ecosystem
          </text>

          {/* Output container */}
          <rect
            x={765}
            y={215}
            width={170}
            height={130}
            rx={8}
            fill="#fffef5"
            stroke="#d6b656"
            strokeWidth={1.2}
            strokeDasharray="6,3"
          />
          <text x={781} y={235} fontSize={10} fontStyle="italic" fill="#b8860b">
            Output
          </text>

          {/* Edges */}
          {edges.map((d, i) => (
            <path key={i} d={d} stroke={EC} strokeWidth={1.5} fill="none" markerEnd="url(#arr)" />
          ))}
        </svg>

        {/* Nodes */}
        <Node cx={120} cy={290} w={72} h={78} label="User" Icon={User} pal={PAL.neutral} />
        <Node cx={270} cy={290} w={88} h={52} label="User Query" Icon={FileText} pal={PAL.file} />
        <Node
          cx={270}
          cy={180}
          w={120}
          h={52}
          label="Reference Files"
          Icon={FileText}
          pal={PAL.file}
        />
        <Node
          cx={400}
          cy={180}
          w={130}
          h={52}
          label="File Search"
          Icon={FileSearch}
          pal={PAL.tool}
        />
        <Node
          cx={540}
          cy={290}
          w={180}
          h={110}
          label="Policy Q&A Agent"
          Icon={Bot}
          pal={PAL.agent}
          large
          typeLabel="AGENT"
        />
        <Node
          cx={540}
          cy={440}
          w={150}
          h={52}
          label="SharePoint"
          Icon={MCPIcon}
          pal={PAL.connector}
        />
        <Node
          cx={850}
          cy={290}
          w={140}
          h={52}
          label="Answer with Sources"
          Icon={FileText}
          pal={PAL.file}
        />
      </div>

      <Legend items={legendItems} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// DEFAULT EXPORT (renders SeriesLayout by default)
// ══════════════════════════════════════════════════════════════════

export default SeriesLayout;
