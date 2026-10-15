/* eslint-disable i18next/no-literal-string -- This file is a customizable React diagram template; visible labels are intentionally edited per generated artifact. */

/**
 * MyAssist Agent Handoff Architecture Diagram Template
 *
 * Use when one Agent completes a distinct stage and hands a defined result to a
 * second Agent. For skills within one Agent, use architecture-diagram-template.tsx.
 *
 * ANTI-OVERLAP RULES:
 * 1. Keep 20px minimum gaps between node edges.
 * 2. Keep edge paths outside node bodies with at least 4px clearance.
 * 3. Keep labels and sublabels within their nodes, allowing 12px horizontal padding.
 * 4. Keep annotations at least 8px from nodes and edges.
 * 5. Preserve this canvas size (W=1160, H=490) and the shared visual system.
 * 6. typeLabel adds height — Agent nodes must be ≥86px tall, Skill nodes ≥62px tall to prevent the typeLabel clipping into the icon or main label below it.
 * 7. **Connector edge clearance:** An edge must leave and enter every node perpendicularly. No edge segment may run along, overlap, or sit within 4px of a node border. Route edges through clear space and use turns only where needed to maintain this clearance.
 * 8. **Container header space:** Every labelled container must reserve a clear header band above its first node. Place the container label 18-20px below the container top and keep the first contained node at least 16px below the label baseline. Increase the container outward rather than moving its content closer to the label. Reserve at least 36px for a one-line heading and 48px for a two-line heading.
 *
 * Customise node labels, sublabels, edge paths, container labels, the handoff
 * label, and output format labels. Do not replace the palette, Node component,
 * lucide-react icons, typography, or output-format badges.
 *
 * DATA SOURCE MAPPING:
 * Never show a local computer folder path. Use the SharePoint connector (MCPIcon) for
 * SharePoint or OneDrive files, with file nodes showing "Provide SharePoint folder link"
 * or "Provide OneDrive folder link" as user input. User uploads show "Upload Files".
 * File Search appears as bottom tool text only when reference material is uploaded.
 */

import { Bot, FileText, Globe, ScrollText, User, Wrench } from 'lucide-react';

const PAL = {
  agent: { fill: '#dae8fc', stroke: '#6c8ebf', icon: '#1a5276' },
  skill: { fill: '#d5e8d4', stroke: '#82b366', icon: '#1e6b3c' },
  connector: { fill: '#dae3f5', stroke: '#7a9cc8', icon: '#2c5f8a' },
  tool: { fill: '#e1d5e7', stroke: '#9673a6', icon: '#5b2c6f' },
  file: { fill: '#fff2cc', stroke: '#d6b656', icon: '#7d6608' },
  neutral: { fill: '#f5f5f5', stroke: '#aaaaaa', icon: '#555555' },
};

const EC = '#555555';
const HC = '#e67e22';
const W = 1160;
const H = 490;

function MCPIcon({ size = 18, color = 'currentColor', strokeWidth = 1.5 }: any) {
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
  formatLabel?: string;
  typeLabel?: string;
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
        <div style={{ fontSize: 8, color: '#555', textAlign: 'center', lineHeight: 1.3 }}>
          {sublabel}
        </div>
      )}
    </div>
  );
}

export default function HandoffLayout() {
  // All nodes maintain 20px+ clear gaps. Update edges whenever a node moves.
  const edges = [
    'M86,265 H106',
    'M194,265 H245',
    'M315,180 V228',
    'M315,333 V302',
    'M385,250 H398 V205 H406',
    'M385,280 H398 V325 H406',
    'M518,205 H527 V265',
    'M518,325 H527 V265',
    'M718,180 V228',
    'M718,333 V302',
    'M788,250 H800 V205 H809',
    'M788,280 H800 V325 H809',
    'M921,205 H926 V265',
    'M921,325 H926 V265',
    'M940,265 H952 V185 H974',
    'M940,265 H974',
    'M940,265 H952 V325 H974',
    'M940,265 H952 V395 H974',
  ];

  const legendItems = [
    { label: 'Agent', fill: PAL.agent.fill, stroke: PAL.agent.stroke },
    { label: 'Skill', fill: PAL.skill.fill, stroke: PAL.skill.stroke },
    { label: 'Connector', fill: PAL.connector.fill, stroke: PAL.connector.stroke },
    { label: 'Tool', fill: PAL.tool.fill, stroke: PAL.tool.stroke },
    { label: 'File / IO', fill: PAL.file.fill, stroke: PAL.file.stroke },
    { label: 'Handoff', fill: '#fde8d0', stroke: HC },
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
            <marker
              id="arrHandoff"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0,10 3.5,0 7" fill={HC} />
            </marker>
          </defs>
          <text x={W / 2} y={28} textAnchor="middle" fontSize={17} fontWeight="700" fill="#222">
            Agent &amp; Skills Architecture - Agent Handoff
          </text>
          <rect
            x={198}
            y={72}
            width={342}
            height={372}
            rx={8}
            fill="#fafafa"
            stroke="#cccccc"
            strokeWidth={1.5}
            strokeDasharray="8,4"
          />
          <text x={214} y={92} fontSize={10} fontStyle="italic" fill="#aaaaaa">
            Agent 1 Ecosystem
          </text>
          <rect
            x={598}
            y={72}
            width={344}
            height={372}
            rx={8}
            fill="#fafafa"
            stroke="#cccccc"
            strokeWidth={1.5}
            strokeDasharray="8,4"
          />
          <text x={614} y={92} fontSize={10} fontStyle="italic" fill="#aaaaaa">
            Agent 2 Ecosystem
          </text>
          <rect
            x={958}
            y={100}
            width={178}
            height={336}
            rx={8}
            fill="#fffef5"
            stroke="#d6b656"
            strokeWidth={1.2}
            strokeDasharray="6,3"
          />
          <text x={974} y={120} fontSize={10} fontStyle="italic" fill="#b8860b">
            Outputs
          </text>
          {edges.map((d, i) => (
            <path key={i} d={d} stroke={EC} strokeWidth={1.5} fill="none" markerEnd="url(#arr)" />
          ))}
          <path
            d="M535,265 H648"
            stroke={HC}
            strokeWidth={2.5}
            fill="none"
            strokeDasharray="7,4"
            markerEnd="url(#arrHandoff)"
          />
          <rect
            x={557}
            y={241}
            width={68}
            height={17}
            rx={8}
            fill="#fde8d0"
            stroke={HC}
            strokeWidth={1.2}
          />
          <text x={591} y={254} textAnchor="middle" fontSize={9} fontWeight="700" fill={HC}>
            Handoff
          </text>
        </svg>

        <div
          style={{
            position: 'absolute',
            left: 521,
            top: 258,
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: '#333',
            zIndex: 4,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 926,
            top: 258,
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: '#333',
            zIndex: 4,
          }}
        />

        <Node cx={52} cy={265} w={68} h={74} label="User" Icon={User} pal={PAL.neutral} />
        <Node cx={150} cy={265} w={88} h={50} label="Input Files" Icon={FileText} pal={PAL.file} />

        <Node
          cx={315}
          cy={155}
          w={115}
          h={50}
          label="Connectors"
          Icon={MCPIcon}
          pal={PAL.connector}
        />
        <Node
          cx={315}
          cy={265}
          w={140}
          h={86}
          label="Agent 1"
          Icon={Bot}
          pal={PAL.agent}
          large
          typeLabel="AGENT"
        />
        <Node
          cx={315}
          cy={365}
          w={152}
          h={64}
          label="Tools"
          sublabel="Run Code | Skills | Artifacts"
          Icon={Wrench}
          pal={PAL.tool}
        />
        <Node
          cx={462}
          cy={205}
          w={112}
          h={62}
          label="Skill A"
          Icon={ScrollText}
          pal={PAL.skill}
          typeLabel="SKILL"
        />
        <Node
          cx={462}
          cy={325}
          w={112}
          h={62}
          label="Skill B"
          Icon={ScrollText}
          pal={PAL.skill}
          typeLabel="SKILL"
        />

        <Node
          cx={718}
          cy={155}
          w={115}
          h={50}
          label="Connectors"
          Icon={MCPIcon}
          pal={PAL.connector}
        />
        <Node
          cx={718}
          cy={265}
          w={140}
          h={86}
          label="Agent 2"
          Icon={Bot}
          pal={PAL.agent}
          large
          typeLabel="AGENT"
        />
        <Node
          cx={718}
          cy={365}
          w={152}
          h={64}
          label="Tools"
          sublabel="Run Code | Skills | Artifacts"
          Icon={Wrench}
          pal={PAL.tool}
        />
        <Node
          cx={865}
          cy={205}
          w={112}
          h={62}
          label="Skill C"
          Icon={ScrollText}
          pal={PAL.skill}
          typeLabel="SKILL"
        />
        <Node
          cx={865}
          cy={325}
          w={112}
          h={62}
          label="Skill D"
          Icon={ScrollText}
          pal={PAL.skill}
          typeLabel="SKILL"
        />

        <Node cx={1048} cy={185} w={148} h={50} label="Microsite" Icon={Globe} pal={PAL.agent} />
        <Node
          cx={1048}
          cy={255}
          w={148}
          h={50}
          label="Document"
          formatLabel="DOCX"
          pal={PAL.file}
        />
        <Node
          cx={1048}
          cy={325}
          w={148}
          h={50}
          label="Spreadsheet"
          formatLabel="XLSX"
          pal={PAL.file}
        />
        <Node
          cx={1048}
          cy={395}
          w={148}
          h={50}
          label="Presentation"
          formatLabel="PPTX"
          pal={PAL.file}
        />
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginTop: 14,
          padding: '9px 16px',
          background: '#f9f9f9',
          border: '1px solid #ddd',
          borderRadius: 6,
          width: W - 32,
          boxSizing: 'border-box',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: '#666', marginRight: 4 }}>
          Legend:
        </span>
        {legendItems.map(({ label, fill, stroke }) => (
          <div
            key={label}
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
      </div>
    </div>
  );
}
